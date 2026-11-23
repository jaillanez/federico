"""Unit/integration tests for the services behind leads: file sniffing, phones, captcha,
retention and real SMTP delivery."""

import os
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Lead, LeadFile
from app.services import captcha, mail, storage
from app.services.filetypes import HEIC, JPEG, PDF, PNG, WEBP, sniff
from app.services.phone import normalize_ar_phone
from app.services.retention import purge_old_leads


@pytest.mark.parametrize(
    ("head", "kind"),
    [
        (b"%PDF-1.4\n", PDF),
        (b"\xff\xd8\xff\xe0\x00\x10JFIF", JPEG),
        (b"\x89PNG\r\n\x1a\n\x00\x00", PNG),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", WEBP),
        (b"\x00\x00\x00\x18ftypheic\x00\x00", HEIC),
        (b"\x00\x00\x00\x18ftypmif1\x00\x00", HEIC),
        (b"MZ\x90\x00", None),  # .exe
        (b"PK\x03\x04", None),  # zip / docx
        (b"<html>", None),
        (b"\x00\x00\x00\x18ftypisom", None),  # mp4 video
        (b"", None),
    ],
)
def test_sniff(head: bytes, kind: object) -> None:
    assert sniff(head) == kind


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0264 15 5651609", "+5492645651609"),
        ("264-5651609", "+5492645651609"),
        ("+54 9 264 565-1609", "+5492645651609"),
        ("(0264) 155-651609", "+5492645651609"),
        ("11 15 1234-5678", "+5491112345678"),
        ("+5491112345678", "+5491112345678"),
        ("02966 15 123456", "+5492966123456"),
        ("123", None),
        ("0264 4220", None),
        ("+1 202 555 0101", None),
        ("0000000000", None),
    ],
)
def test_normalize_ar_phone(raw: str, expected: str | None) -> None:
    assert normalize_ar_phone(raw) == expected


def _transport(status: int, body: object) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL(captcha.VERIFY_URL)
        assert b"secret=s3cret" in request.content
        return httpx.Response(status, json=body)

    return httpx.MockTransport(handler)


async def test_turnstile_verification(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "s3cret")
    get_settings.cache_clear()
    try:
        assert await captcha.verify_turnstile("t", "1.2.3.4", _transport(200, {"success": True}))
        assert not await captcha.verify_turnstile("t", None, _transport(200, {"success": False}))
        assert not await captcha.verify_turnstile("t", None, _transport(500, {}))
        assert not await captcha.verify_turnstile(None, None, _transport(200, {"success": True}))

        def boom(_: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("offline")

        assert not await captcha.verify_turnstile("t", None, httpx.MockTransport(boom))
    finally:
        get_settings.cache_clear()


async def test_turnstile_disabled_without_secret_outside_production() -> None:
    assert await captcha.verify_turnstile(None, None)


async def _lead(session: AsyncSession, estado: str, age_days: int) -> Lead:
    lead = Lead(
        id=uuid.uuid4(),
        contacto_nombre="X",
        email="x@example.com",
        estado=estado,
        created_at=datetime.now(UTC) - timedelta(days=age_days),
    )
    key = f"leads/{lead.id}/{uuid.uuid4()}.pdf"
    await storage.put_private(key, b"%PDF-1.4", "application/pdf")
    lead.files.append(
        LeadFile(
            tipo="factura", storage_key=key, nombre_original="f.pdf", mime="x", bytes=8, sha256="0"
        )
    )
    session.add(lead)
    await session.commit()
    return lead


def _exists(key: str) -> bool:
    try:
        storage.client().head_object(Bucket=get_settings().s3_bucket_private, Key=key)
        return True
    except Exception:
        return False


@pytest.mark.usefixtures("clean_leads")
async def test_retention_deletes_old_inactive_leads_and_their_files(session: AsyncSession) -> None:
    old_new = await _lead(session, "nuevo", 800)
    old_discarded = await _lead(session, "descartado", 800)
    old_client = await _lead(session, "cliente", 800)  # kept: still a client
    recent = await _lead(session, "nuevo", 30)  # kept: younger than 24 months
    old_keys = [old_new.files[0].storage_key, old_discarded.files[0].storage_key]

    assert await purge_old_leads(session) == 2

    remaining = set(await session.scalars(select(Lead.id)))
    assert remaining == {old_client.id, recent.id}
    assert await session.scalar(select(func.count()).select_from(LeadFile)) == 2
    assert not any(_exists(k) for k in old_keys)
    assert _exists(recent.files[0].storage_key)


@pytest.mark.skipif(not os.environ.get("TEST_MAILPIT_URL"), reason="Mailpit no configurado")
async def test_smtp_delivery_through_mailpit(monkeypatch: pytest.MonkeyPatch) -> None:
    base = os.environ["TEST_MAILPIT_URL"].rstrip("/")
    monkeypatch.setenv("MAIL_BACKEND", "smtp")
    monkeypatch.setenv("SMTP_HOST", os.environ.get("TEST_SMTP_HOST", "localhost"))
    monkeypatch.setenv("SMTP_PORT", os.environ.get("TEST_SMTP_PORT", "1125"))
    get_settings.cache_clear()
    subject = f"Prueba SMTP {uuid.uuid4()}"
    try:
        await mail.send(mail.Mail(to="ana@example.com", subject=subject, text="Hola"))
    finally:
        get_settings.cache_clear()
    async with httpx.AsyncClient() as http:
        res = await http.get(f"{base}/api/v1/search", params={"query": f'subject:"{subject}"'})
        found = res.json()["messages"]
        assert len(found) == 1
        assert found[0]["To"][0]["Address"] == "ana@example.com"
        assert found[0]["Attachments"] == 0
