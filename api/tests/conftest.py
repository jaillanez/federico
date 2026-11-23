"""Tests run against real services: PostgreSQL and S3 (MinIO). No database or storage mocks.

Environment:
  TEST_DATABASE_URL   owner user of a throwaway database (schema rebuilt with Alembic)
  TEST_S3_ENDPOINT    MinIO endpoint (default http://localhost:9010); test buckets are created
  TEST_MAILPIT_URL    optional Mailpit web URL to run the real-SMTP test
Only the external Turnstile call is replaced (see `captcha_ok`), and email uses the memory backend.
"""

import os
from collections.abc import AsyncIterator, Iterator

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://sei_owner@localhost:5432/sei_test"
)
os.environ["MIGRATIONS_DATABASE_URL"] = os.environ["DATABASE_URL"]
os.environ["ENVIRONMENT"] = "test"
os.environ["S3_ENDPOINT_URL"] = os.environ.get("TEST_S3_ENDPOINT", "http://localhost:9010")
os.environ.setdefault("S3_ACCESS_KEY", "sei-minio")
os.environ.setdefault("S3_SECRET_KEY", "sei-minio-secret")
os.environ["S3_BUCKET_PUBLIC"] = "sei-test-public"
os.environ["S3_BUCKET_PRIVATE"] = "sei-test-private"
os.environ["MAIL_BACKEND"] = "memory"
os.environ["TURNSTILE_SECRET_KEY"] = ""
os.environ["MAIL_LEADS_TO"] = "federico@example.com"

import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from alembic import command
from app.db import SessionLocal, engine
from app.main import app
from app.routers.leads import get_captcha_verifier
from app.scripts.init_storage import main as init_storage
from app.services import mail


@pytest.fixture(scope="session", autouse=True)
def _migrated_db() -> None:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def _buckets() -> None:
    init_storage()


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


@pytest.fixture
async def clean_leads() -> None:
    async with SessionLocal() as s:
        await s.execute(text("TRUNCATE leads CASCADE"))
        await s.commit()


@pytest.fixture
def outbox() -> Iterator[list[mail.Mail]]:
    mail.outbox.clear()
    yield mail.outbox
    mail.outbox.clear()


VALID_CAPTCHA = "token-valido"


@pytest.fixture
def captcha_ok() -> Iterator[None]:
    """Replace the Turnstile call: only VALID_CAPTCHA passes."""

    async def verifier(token: str | None, ip: str | None) -> bool:
        return token == VALID_CAPTCHA

    app.dependency_overrides[get_captcha_verifier] = lambda: verifier
    yield
    app.dependency_overrides.pop(get_captcha_verifier, None)
