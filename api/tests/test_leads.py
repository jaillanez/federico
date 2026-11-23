"""Integration tests for POST /api/leads (real PostgreSQL + real MinIO)."""

import hashlib
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Lead, LeadFile
from app.services import mail, storage
from tests.conftest import VALID_CAPTCHA

pytestmark = pytest.mark.usefixtures("clean_leads", "captcha_ok")

MB = 1024 * 1024
PDF = b"%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
EXE = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 64  # Windows executable header


def form(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "origen": "diagnostico",
        "empresa": "Bodega Ejemplo S.A.",
        "contacto_nombre": "Ana Pérez",
        "cargo": "Gerente de planta",
        "email": "ana@example.com",
        "whatsapp": "0264 15 5651609",
        "provincia": "San Juan",
        "localidad": "Pocito",
        "objetivos": ["reducir_costo_fijo", "evaluar_solar"],
        "mensaje": "Queremos bajar la factura.",
        "consentimiento": "true",
        "utm_source": "google",
        "utm_campaign": "tarifas",
        "cf-turnstile-response": VALID_CAPTCHA,
    }
    data.update(overrides)
    return {k: v for k, v in data.items() if v is not None}


async def post(
    client: AsyncClient, data: dict[str, Any], files: list[tuple[str, tuple[str, bytes, str]]]
) -> httpx.Response:
    return await client.post("/api/leads", data=data, files=files or None)


async def lead_count(session: AsyncSession) -> int:
    return await session.scalar(select(func.count()).select_from(Lead)) or 0


async def test_happy_path_stores_lead_files_and_sends_emails(
    client: AsyncClient, session: AsyncSession, outbox: list[mail.Mail]
) -> None:
    res = await post(
        client,
        form(),
        [
            ("factura", ("factura-agosto.pdf", PDF, "application/pdf")),
            ("presupuesto_solar", ("presupuesto.png", PNG, "image/png")),
        ],
    )
    assert res.status_code == 201, res.text
    lead_id = res.json()["id"]

    lead = await session.scalar(select(Lead).where(Lead.id == lead_id))
    assert lead is not None
    assert lead.whatsapp == "+5492645651609"
    assert lead.objetivos == ["reducir_costo_fijo", "evaluar_solar"]
    assert lead.estado == "nuevo"
    assert lead.origen == "diagnostico"
    assert lead.utm_source == "google" and lead.utm_campaign == "tarifas"
    assert lead.consentimiento_at is not None
    assert lead.ip_hash and len(lead.ip_hash) == 64  # hashed, never the raw IP

    files = (await session.scalars(select(LeadFile).where(LeadFile.lead_id == lead.id))).all()
    by_type = {f.tipo: f for f in files}
    assert set(by_type) == {"factura", "presupuesto_solar"}
    factura = by_type["factura"]
    assert factura.mime == "application/pdf"
    assert factura.storage_key.startswith(f"leads/{lead.id}/") and factura.storage_key.endswith(
        ".pdf"
    )
    assert factura.sha256 == hashlib.sha256(PDF).hexdigest()
    assert factura.bytes == len(PDF)
    assert factura.nombre_original == "factura-agosto.pdf"
    obj = storage.client().get_object(
        Bucket=get_settings().s3_bucket_private, Key=factura.storage_key
    )
    assert obj["Body"].read() == PDF

    # One notification to Federico (link to the panel, no attachments) and one confirmation.
    assert [m.to for m in outbox] == ["federico@example.com", "ana@example.com"]
    notice = outbox[0]
    assert f"/admin/consultas/{lead.id}" in notice.text
    assert "Reducir costos fijos" in notice.text
    assert notice.reply_to == "ana@example.com"
    assert "%PDF" not in notice.text
    assert "24 a 48 horas" in outbox[1].text


async def test_exe_renamed_as_pdf_is_rejected(client: AsyncClient, session: AsyncSession) -> None:
    res = await post(client, form(), [("factura", ("factura.pdf", EXE, "application/pdf"))])
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "invalid_file_type"
    assert "no es un PDF ni una imagen" in err["message"]
    assert "factura" in err["fields"]
    assert await lead_count(session) == 0


async def test_file_over_15_mb_is_rejected(client: AsyncClient, session: AsyncSession) -> None:
    big = PDF + b"0" * (16 * MB)
    res = await post(client, form(), [("factura", ("grande.pdf", big, "application/pdf"))])
    assert res.status_code == 413
    assert "supera los 15 MB" in res.json()["error"]["message"]
    assert await lead_count(session) == 0


async def test_more_than_3_files_is_rejected(client: AsyncClient) -> None:
    files = [("factura", (f"f{i}.pdf", PDF, "application/pdf")) for i in range(4)]
    res = await post(client, form(), files)
    assert res.status_code == 422
    assert res.json()["error"]["fields"] == {"archivos": "Máximo 3 archivos."}


async def test_total_over_40_mb_is_rejected(client: AsyncClient) -> None:
    chunk = PDF + b"0" * (14 * MB)
    files = [("factura", (f"f{i}.pdf", chunk, "application/pdf")) for i in range(3)]
    res = await post(client, form(), files)
    assert res.status_code == 413
    assert "40 MB" in res.json()["error"]["message"]


@pytest.mark.parametrize("token", [None, "token-falso"])
async def test_invalid_captcha_is_rejected(
    client: AsyncClient, session: AsyncSession, token: str | None
) -> None:
    data = form(**{"cf-turnstile-response": token})
    res = await post(client, data, [("factura", ("f.pdf", PDF, "application/pdf"))])
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "captcha_invalid"
    assert await lead_count(session) == 0


async def test_sixth_submission_in_an_hour_is_rate_limited(client: AsyncClient) -> None:
    data = form(origen="contacto", objetivos=None)
    for _ in range(5):
        assert (await post(client, data, [])).status_code == 201
    res = await post(client, data, [])
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "rate_limited"


async def test_honeypot_pretends_success_but_stores_nothing(
    client: AsyncClient, session: AsyncSession, outbox: list[mail.Mail]
) -> None:
    res = await post(client, form(sitio_web="http://spam.example"), [])
    assert res.status_code == 201
    assert await lead_count(session) == 0
    assert outbox == []


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"contacto_nombre": "  "}, "contacto_nombre"),
        ({"email": "no-es-un-email"}, "email"),
        ({"whatsapp": "123"}, "whatsapp"),
        ({"whatsapp": None}, "whatsapp"),
        ({"provincia": None}, "provincia"),
        ({"objetivos": None}, "objetivos"),
        ({"objetivos": ["inventado"]}, "objetivos"),
        ({"consentimiento": "false"}, "consentimiento"),
    ],
)
async def test_field_validation(
    client: AsyncClient, session: AsyncSession, overrides: dict[str, Any], field: str
) -> None:
    res = await post(client, form(**overrides), [("factura", ("f.pdf", PDF, "application/pdf"))])
    assert res.status_code == 422
    fields = res.json()["error"]["fields"]
    assert field in fields
    assert fields[field]  # Spanish message, not a generic one
    assert await lead_count(session) == 0


async def test_diagnostico_requires_the_invoice(client: AsyncClient) -> None:
    res = await post(client, form(), [("presupuesto_solar", ("p.pdf", PDF, "application/pdf"))])
    assert res.status_code == 422
    assert "factura" in res.json()["error"]["fields"]


async def test_contact_form_needs_message_but_no_files(
    client: AsyncClient, session: AsyncSession, outbox: list[mail.Mail]
) -> None:
    data = {
        "origen": "contacto",
        "contacto_nombre": "Juan",
        "email": "juan@example.com",
        "consentimiento": "true",
        "cf-turnstile-response": VALID_CAPTCHA,
    }
    assert (await post(client, data, [])).status_code == 422
    res = await post(client, {**data, "mensaje": "Quiero una visita"}, [])
    assert res.status_code == 201
    assert res.json()["message"] == "¡Recibimos tu mensaje!"
    lead = await session.scalar(select(Lead))
    assert lead is not None and lead.origen == "contacto" and lead.whatsapp is None
    assert outbox[1].subject == "Recibimos tu consulta"


async def test_private_file_needs_a_signed_url(client: AsyncClient, session: AsyncSession) -> None:
    res = await post(client, form(), [("factura", ("f.pdf", PDF, "application/pdf"))])
    assert res.status_code == 201
    key = await session.scalar(select(LeadFile.storage_key))
    assert key is not None
    s = get_settings()
    async with httpx.AsyncClient() as http:
        anonymous = await http.get(f"{s.s3_endpoint_url}/{s.s3_bucket_private}/{key}")
        assert anonymous.status_code == 403
        signed = await http.get(storage.signed_private_url(key, "factura.pdf"))
        assert signed.status_code == 200
        assert signed.content == PDF
        assert 'filename="factura.pdf"' in signed.headers["content-disposition"]


async def test_mail_failure_does_not_lose_the_lead(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken(_: mail.Mail) -> None:
        raise OSError("smtp down")

    monkeypatch.setattr("app.services.lead_mail.send", broken)
    res = await post(client, form(), [("factura", ("f.pdf", PDF, "application/pdf"))])
    assert res.status_code == 201
    assert await lead_count(session) == 1


async def test_failed_upload_rolls_back_and_removes_uploaded_files(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_put = storage.put_private
    stored: list[str] = []

    async def flaky_put(key: str, data: bytes, content_type: str) -> None:
        if stored:
            raise OSError("storage down")
        await real_put(key, data, content_type)
        stored.append(key)

    monkeypatch.setattr(storage, "put_private", flaky_put)
    files = [
        ("factura", ("f.pdf", PDF, "application/pdf")),
        ("presupuesto_solar", ("p.png", PNG, "image/png")),
    ]
    with pytest.raises(OSError, match="storage down"):
        await post(client, form(), files)
    assert await lead_count(session) == 0
    bucket = get_settings().s3_bucket_private
    listing = storage.client().list_objects_v2(Bucket=bucket, Prefix=stored[0])
    assert listing.get("KeyCount", 0) == 0  # the first file was cleaned up
