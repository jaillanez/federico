import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Lead, Project, ProjectImage
from tests.conftest import table_names

EXPECTED_TABLES = {
    "admin_users",
    "service_categories",
    "sectors",
    "projects",
    "project_images",
    "leads",
    "lead_files",
    "lead_notes",
    "articles",
    "testimonials",
    "site_settings",
}


async def test_migration_creates_the_11_tables(session: AsyncSession) -> None:
    assert await table_names(session) == EXPECTED_TABLES


async def test_only_one_cover_image_per_project(session: AsyncSession) -> None:
    project = Project(slug="test-portada", titulo="Test")
    session.add(project)
    await session.flush()
    session.add_all(
        [
            ProjectImage(project_id=project.id, storage_key="a", es_portada=True),
            ProjectImage(project_id=project.id, storage_key="b", es_portada=True),
        ]
    )
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_lead_rejects_unknown_goal(session: AsyncSession) -> None:
    session.add(Lead(contacto_nombre="X", email="x@example.com", objetivos=["no_valido"]))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_lead_defaults(session: AsyncSession) -> None:
    lead = Lead(contacto_nombre="X", email="x@example.com", objetivos=["evaluar_solar"])
    session.add(lead)
    await session.flush()
    await session.refresh(lead)
    assert lead.estado == "nuevo"
    assert lead.id is not None
    assert lead.created_at is not None
