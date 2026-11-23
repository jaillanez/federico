from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.models import (
    Article,
    Project,
    ProjectImage,
    Sector,
    ServiceCategory,
    SiteSetting,
)

pytestmark = pytest.mark.usefixtures("clean_content")


async def _catalog(session: AsyncSession) -> tuple[ServiceCategory, Sector]:
    cat = ServiceCategory(slug="tableros-y-bombeo", nombre="Tableros y bombeo")
    sec = Sector(slug="mineria", nombre="Minería")
    session.add_all([cat, sec])
    await session.flush()
    return cat, sec


async def _projects(session: AsyncSession) -> None:
    cat, sec = await _catalog(session)
    a = Project(
        slug="obra-a",
        titulo="Obra A",
        provincia="San Juan",
        category_id=cat.id,
        sector_id=sec.id,
        destacado=True,
        publicado=True,
        potencia_kw=Decimal("75.5"),
        fecha_obra=date(2024, 5, 1),
    )
    b = Project(slug="obra-b", titulo="Obra B", provincia="Mendoza", publicado=True)
    hidden = Project(slug="obra-oculta", titulo="Oculta", provincia="San Juan", publicado=False)
    session.add_all([a, b, hidden])
    await session.flush()
    session.add_all(
        [
            ProjectImage(
                project_id=a.id,
                storage_key=f"projects/{a.id}/img1",
                ancho=1800,
                alto=1200,
                orden=1,
                es_portada=True,
                alt_text="Tablero",
            ),
            ProjectImage(project_id=a.id, storage_key=f"projects/{a.id}/img0", orden=0),
        ]
    )
    await session.commit()


async def test_projects_only_published_and_featured_first(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _projects(session)
    res = await client.get("/api/projects")
    assert res.status_code == 200
    body = res.json()
    assert [p["slug"] for p in body["items"]] == ["obra-a", "obra-b"]
    assert body["total"] == 2
    first = body["items"][0]
    assert first["categoria"] == {"slug": "tableros-y-bombeo", "nombre": "Tableros y bombeo"}
    assert first["potencia_kw"] == 75.5
    assert first["cantidad_fotos"] == 2
    # Explicit cover wins over order; widths limited by the original size.
    assert first["portada"]["alt_text"] == "Tablero"
    assert [s["width"] for s in first["portada"]["sources"]] == [400, 800, 1600]
    assert first["portada"]["sources"][0]["avif"].endswith("/img1-400.avif")


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("categoria=tableros-y-bombeo", ["obra-a"]),
        ("sector=mineria", ["obra-a"]),
        ("provincia=Mendoza", ["obra-b"]),
        ("destacado=false", ["obra-b"]),
        ("provincia=Salta", []),
    ],
)
async def test_project_filters(
    client: AsyncClient, session: AsyncSession, query: str, expected: list[str]
) -> None:
    await _projects(session)
    res = await client.get(f"/api/projects?{query}")
    assert [p["slug"] for p in res.json()["items"]] == expected


async def test_projects_pagination(client: AsyncClient, session: AsyncSession) -> None:
    await _projects(session)
    res = await client.get("/api/projects?per_page=1&page=2")
    body = res.json()
    assert body["total"] == 2
    assert [p["slug"] for p in body["items"]] == ["obra-b"]
    too_many = await client.get("/api/projects?per_page=51")
    assert too_many.status_code == 422
    assert "per_page" in too_many.json()["error"]["fields"]


async def test_project_detail(client: AsyncClient, session: AsyncSession) -> None:
    await _projects(session)
    res = await client.get("/api/projects/obra-a")
    assert res.status_code == 200
    body = res.json()
    assert [i["alt_text"] for i in body["imagenes"]] == ["", "Tablero"]  # ordered by `orden`
    assert body["imagenes"][0]["sources"] == [
        {
            "width": 400,
            "avif": body["imagenes"][0]["sources"][0]["avif"],
            "webp": body["imagenes"][0]["sources"][0]["webp"],
        }
    ]


async def test_hidden_or_missing_project_is_404(client: AsyncClient, session: AsyncSession) -> None:
    await _projects(session)
    for slug in ("obra-oculta", "no-existe"):
        res = await client.get(f"/api/projects/{slug}")
        assert res.status_code == 404
        assert res.json()["error"]["message"] == "No encontramos esa obra."


async def test_articles_only_past_publication(client: AsyncClient, session: AsyncSession) -> None:
    now = datetime.now(UTC)
    session.add_all(
        [
            Article(
                slug="viejo", titulo="Viejo", publicado_at=now - timedelta(days=5), tags=["solar"]
            ),
            Article(
                slug="nuevo", titulo="Nuevo", publicado_at=now - timedelta(days=1), tags=["tarifas"]
            ),
            Article(slug="programado", titulo="Prog", publicado_at=now + timedelta(days=1)),
            Article(slug="borrador", titulo="Borrador", publicado_at=None),
        ]
    )
    await session.commit()
    res = await client.get("/api/articles")
    assert [a["slug"] for a in res.json()["items"]] == ["nuevo", "viejo"]
    by_tag = await client.get("/api/articles?tag=solar")
    assert [a["slug"] for a in by_tag.json()["items"]] == ["viejo"]
    assert (await client.get("/api/articles/viejo")).status_code == 200
    assert (await client.get("/api/articles/programado")).status_code == 404
    assert (await client.get("/api/articles/borrador")).status_code == 404


async def test_testimonials_only_published(client: AsyncClient, session: AsyncSession) -> None:
    session.add_all(
        [
            models.Testimonial(
                nombre="B", texto="t", publicado=True, orden=2, logo_key="logos/b.png"
            ),
            models.Testimonial(nombre="A", texto="t", publicado=True, orden=1),
            models.Testimonial(nombre="X", texto="t", publicado=False),
        ]
    )
    await session.commit()
    res = await client.get("/api/testimonials")
    body = res.json()
    assert [t["nombre"] for t in body] == ["A", "B"]
    assert body[1]["logo_url"].endswith("/logos/b.png")


async def test_public_settings_whitelist(client: AsyncClient, session: AsyncSession) -> None:
    session.add_all(
        [
            SiteSetting(clave="whatsapp", valor={"numero": "549"}),
            SiteSetting(clave="tg_phi_limite", valor=0.62),
            SiteSetting(clave="interno", valor={"secreto": True}),
        ]
    )
    await session.commit()
    res = await client.get("/api/settings/public")
    assert res.json() == {"values": {"whatsapp": {"numero": "549"}, "tg_phi_limite": 0.62}}
