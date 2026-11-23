"""Admin leads: filters, status history, notes, signed downloads, CSV and dashboard."""

import csv
import io
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from httpx import AsyncClient

from app.db import SessionLocal
from app.models import Lead, LeadFile
from app.services import storage

pytestmark = pytest.mark.usefixtures("clean_leads")

PDF = b"%PDF-1.7 factura de prueba"


async def make_lead(**fields: object) -> Lead:
    defaults: dict[str, object] = {
        "contacto_nombre": "Ana Pérez",
        "email": "ana@example.com",
        "empresa": "Bodega Ejemplo",
        "provincia": "San Juan",
        "objetivos": ["evaluar_solar"],
    }
    lead = Lead(id=uuid.uuid4(), **{**defaults, **fields})
    key = f"leads/{lead.id}/{uuid.uuid4()}.pdf"
    await storage.put_private(key, PDF, "application/pdf")
    lead.files.append(
        LeadFile(tipo="factura", storage_key=key, nombre_original="factura agosto.pdf",
                 mime="application/pdf", bytes=len(PDF), sha256="0")
    )  # fmt: skip
    async with SessionLocal() as s:
        s.add(lead)
        await s.commit()
    return lead


async def test_list_filters_and_search(admin_client: AsyncClient) -> None:
    await make_lead(empresa="Minera Andina", provincia="Catamarca")
    await make_lead(empresa="Finca Sol", estado="respondido")
    old = datetime.now(UTC) - timedelta(days=40)
    await make_lead(empresa="Vieja SA", created_at=old)

    async def names(**params: str) -> list[str]:
        res = await admin_client.get("/api/admin/leads", params=params)
        assert res.status_code == 200, res.text
        return sorted(x["empresa"] for x in res.json()["items"])

    assert await names() == ["Finca Sol", "Minera Andina", "Vieja SA"]
    assert await names(estado="respondido") == ["Finca Sol"]
    assert await names(provincia="Catamarca") == ["Minera Andina"]
    assert await names(q="andina") == ["Minera Andina"]
    since = (datetime.now(UTC) - timedelta(days=7)).date().isoformat()
    assert await names(desde=since) == ["Finca Sol", "Minera Andina"]
    first = (await admin_client.get("/api/admin/leads")).json()["items"][0]
    assert first["cantidad_archivos"] == 1


async def test_status_change_is_recorded_in_the_history(admin_client: AsyncClient) -> None:
    lead = await make_lead()
    res = await admin_client.patch(
        f"/api/admin/leads/{lead.id}", json={"estado": "en_analisis", "nota": "Pedí más facturas"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["estado"] == "en_analisis"
    note = body["notas"][0]
    assert (note["estado_anterior"], note["estado_nuevo"]) == ("nuevo", "en_analisis")
    assert note["texto"] == "Pedí más facturas"
    assert note["autor"] == "Usuario admin"

    await admin_client.post(
        f"/api/admin/leads/{lead.id}/notes", json={"texto": "Llamé, no atendió"}
    )
    res = await admin_client.patch(f"/api/admin/leads/{lead.id}", json={"estado": "cliente"})
    history = res.json()["notas"]
    assert [n["estado_nuevo"] for n in history] == ["cliente", None, "en_analisis"]
    # Same status and no note: nothing to record.
    res = await admin_client.patch(f"/api/admin/leads/{lead.id}", json={"estado": "cliente"})
    assert len(res.json()["notas"]) == 3
    bad = await admin_client.patch(f"/api/admin/leads/{lead.id}", json={"estado": "inventado"})
    assert bad.status_code == 422


async def test_file_download_redirects_to_a_short_lived_signed_url(
    admin_client: AsyncClient,
) -> None:
    lead = await make_lead()
    detail = (await admin_client.get(f"/api/admin/leads/{lead.id}")).json()
    file_id = detail["archivos"][0]["id"]
    res = await admin_client.get(f"/api/admin/leads/{lead.id}/files/{file_id}")
    assert res.status_code == 307
    url = res.headers["location"]
    assert "X-Amz-Expires=300" in url  # 5 minutes
    async with httpx.AsyncClient() as http:
        got = await http.get(url)
        assert got.status_code == 200 and got.content == PDF
    other = await admin_client.get(f"/api/admin/leads/{uuid.uuid4()}/files/{file_id}")
    assert other.status_code == 404  # file must belong to the lead


async def test_csv_export_is_excel_friendly_and_safe(admin_client: AsyncClient) -> None:
    await make_lead(empresa='=HYPERLINK("http://evil")', mensaje="Hola, ¿qué tal?")
    res = await admin_client.get("/api/admin/leads.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    text = res.content.decode("utf-8")
    assert text.startswith("﻿")
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    header, row = rows[0], rows[1]
    assert header[:4] == ["fecha", "estado", "origen", "empresa"]
    assert row[header.index("empresa")].startswith("'=")  # formula neutralized
    assert row[header.index("mensaje")] == "Hola, ¿qué tal?"


async def test_dashboard(admin_client: AsyncClient) -> None:
    await make_lead(provincia="Mendoza")
    await make_lead(provincia="Mendoza", estado="respondido")
    await make_lead(provincia=None)
    res = await admin_client.get("/api/admin/dashboard")
    body = res.json()
    assert body["consultas_nuevas"] == 2
    assert body["consultas_semana"] == 3
    assert body["semana_por_provincia"] == {"Mendoza": 2, "Sin provincia": 1}
