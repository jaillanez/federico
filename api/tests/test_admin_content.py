"""Admin articles, testimonials, settings and the rebuild service."""

import asyncio
import io
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from httpx import AsyncClient
from PIL import Image

from app.config import get_settings
from app.services.rebuild import Rebuilder

pytestmark = pytest.mark.usefixtures("clean_content")


def png(width: int = 2000, height: int = 1000) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (10, 120, 60)).save(buf, "PNG")
    return buf.getvalue()


async def test_article_lifecycle_draft_scheduled_published(
    admin_client: AsyncClient, client: AsyncClient, rebuilds: list[str]
) -> None:
    res = await admin_client.post(
        "/api/admin/articles",
        json={
            "titulo": "¿Qué es la energía reactiva?",
            "cuerpo_md": "## Hola",
            "tags": ["Tarifas", "tarifas", " Energía Reactiva "],
        },
    )
    assert res.status_code == 201
    art = res.json()
    assert art["slug"] == "que-es-la-energia-reactiva"
    assert art["estado"] == "borrador"
    assert art["tags"] == ["tarifas", "energia-reactiva"]
    assert rebuilds == []

    future = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    res = await admin_client.patch(
        f"/api/admin/articles/{art['id']}", json={"publicado_at": future}
    )
    assert res.json()["estado"] == "programado"
    assert rebuilds == []  # not visible yet
    assert (await client.get(f"/api/articles/{art['slug']}")).status_code == 404

    past = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    res = await admin_client.patch(f"/api/admin/articles/{art['id']}", json={"publicado_at": past})
    assert res.json()["estado"] == "publicado"
    assert len(rebuilds) == 1
    assert (await client.get(f"/api/articles/{art['slug']}")).status_code == 200

    cover = await admin_client.post(
        f"/api/admin/articles/{art['id']}/cover", files={"file": ("p.png", png(), "image/png")}
    )
    assert cover.status_code == 200
    url = cover.json()["portada_url"]
    assert url.endswith("-1600.webp")
    async with httpx.AsyncClient() as http:
        assert (await http.get(url)).status_code == 200

    assert (await admin_client.delete(f"/api/admin/articles/{art['id']}")).status_code == 204
    assert len(rebuilds) == 3  # cover change + deletion of a live article


async def test_testimonials_crud_and_logo(admin_client: AsyncClient, client: AsyncClient) -> None:
    res = await admin_client.post(
        "/api/admin/testimonials",
        json={
            "nombre": "María Gómez",
            "empresa": "Finca Sol",
            "texto": "Bajamos la factura un montón.",
        },
    )
    assert res.status_code == 201
    t = res.json()
    assert t["publicado"] is False
    assert (await client.get("/api/testimonials")).json() == []

    await admin_client.patch(f"/api/admin/testimonials/{t['id']}", json={"publicado": True})
    assert [x["nombre"] for x in (await client.get("/api/testimonials")).json()] == ["María Gómez"]

    logo = await admin_client.post(
        f"/api/admin/testimonials/{t['id']}/logo",
        files={"file": ("l.png", png(300, 100), "image/png")},
    )
    assert logo.json()["logo_url"].endswith("-400.webp")
    bad = await admin_client.post(
        f"/api/admin/testimonials/{t['id']}/logo", files={"file": ("l.txt", b"hola", "text/plain")}
    )
    assert bad.status_code == 422
    assert (await admin_client.delete(f"/api/admin/testimonials/{t['id']}")).status_code == 204
    assert (await admin_client.get("/api/admin/testimonials")).json() == []


async def test_settings_roundtrip_and_validation(
    admin_client: AsyncClient, client: AsyncClient, rebuilds: list[str]
) -> None:
    body = {
        "contacto": {"direccion": "Brasil 359 (O), San Juan", "telefono": "0264-4220106",
                     "celular": "0264 15 5651609", "email": "monetidel@gmail.com"},
        "whatsapp": {"numero": "5492645651609"},
        "metricas": [
            {"clave": "obras", "etiqueta": "Obras ejecutadas", "valor": 120, "sufijo": "+"}
        ],
        "tg_phi_limite": 0.62,
    }  # fmt: skip
    res = await admin_client.put("/api/admin/settings", json=body)
    assert res.status_code == 200
    assert (await admin_client.get("/api/admin/settings")).json() == body
    public = (await client.get("/api/settings/public")).json()["values"]
    assert public["metricas"][0]["valor"] == 120
    assert len(rebuilds) == 1

    wrong = await admin_client.put(
        "/api/admin/settings", json={**body, "whatsapp": {"numero": "0264155651609"}}
    )
    assert wrong.status_code == 422


async def test_rebuild_groups_requests_and_calls_the_webhook(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200)

    monkeypatch.setenv("REBUILD_WEBHOOK_URL", "http://builder.local/rebuild")
    monkeypatch.setenv("REBUILD_WEBHOOK_TOKEN", "t0ken")
    monkeypatch.setenv("REBUILD_DELAY_SECONDS", "0.2")
    get_settings.cache_clear()
    try:
        r = Rebuilder()
        r.transport = httpx.MockTransport(handler)
        first = r.request()
        assert first.pending and first.scheduled_for is not None
        for _ in range(5):  # a burst of edits...
            r.request()
            await asyncio.sleep(0.01)
        await r.wait()
        assert len(calls) == 1  # ...becomes one rebuild
        assert calls[0].headers["authorization"] == "Bearer t0ken"
        status = r.status()
        assert not status.pending and status.last_ok is True and status.configured

        r.transport = httpx.MockTransport(lambda _: httpx.Response(500))
        r.request()
        await r.wait()
        assert r.status().last_ok is False
    finally:
        get_settings.cache_clear()


async def test_rebuild_endpoint(editor_client: AsyncClient) -> None:
    res = await editor_client.post("/api/admin/rebuild")
    assert res.status_code == 202
    assert set(res.json()) == {"pending", "scheduled_for", "last_run_at", "last_ok", "configured"}
