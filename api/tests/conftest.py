"""Tests run against a real PostgreSQL database (no DB mocks).

Set TEST_DATABASE_URL (owner user); the schema is rebuilt with Alembic once per session.
"""

import os
from collections.abc import AsyncIterator

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://sei_owner@localhost:5432/sei_test"
)
os.environ["MIGRATIONS_DATABASE_URL"] = os.environ["DATABASE_URL"]
os.environ["ENVIRONMENT"] = "test"

import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from alembic import command
from app.db import SessionLocal, engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _migrated_db() -> None:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as s:
        yield s
        await s.rollback()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
async def _dispose_engine() -> AsyncIterator[None]:
    yield
    await engine.dispose()


async def table_names(s: AsyncSession) -> set[str]:
    rows = await s.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name <> 'alembic_version'"
        )
    )
    return {r[0] for r in rows}


CONTENT_TABLES = (
    "project_images, projects, service_categories, sectors, articles, testimonials, site_settings"
)


@pytest.fixture
async def clean_content() -> None:
    """Empty content tables so each test controls exactly what exists."""
    async with SessionLocal() as s:
        await s.execute(text(f"TRUNCATE {CONTENT_TABLES} CASCADE"))
        await s.commit()
