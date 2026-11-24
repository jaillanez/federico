import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Article
from app.scripts import objects
from app.scripts.scheduler import next_daily
from app.services.rebuild import Rebuilder
from app.services.scheduled import articles_due, rebuild_if_articles_due

pytestmark = pytest.mark.usefixtures("clean_content")


async def test_rebuild_only_when_a_scheduled_article_goes_live(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = datetime.now(UTC)
    session.add_all(
        [
            Article(slug="ya", titulo="Ya", publicado_at=now - timedelta(minutes=30)),
            Article(slug="viejo", titulo="Viejo", publicado_at=now - timedelta(days=3)),
            Article(slug="futuro", titulo="Futuro", publicado_at=now + timedelta(days=1)),
            Article(slug="borrador", titulo="Borrador", publicado_at=None),
        ]
    )
    await session.commit()
    last_hour = (now - timedelta(hours=1), now)
    assert await articles_due(session, *last_hour) == 1

    calls: list[bool] = []
    r = Rebuilder()

    def fake_request() -> object:
        calls.append(True)
        return r.status()

    monkeypatch.setattr(r, "request", fake_request)
    assert await rebuild_if_articles_due(session, *last_hour, r)
    assert not await rebuild_if_articles_due(session, now, now + timedelta(minutes=10), r)
    assert calls == [True]


def test_daily_job_runs_at_0330_argentina() -> None:
    # 2026-11-23 10:00 UTC = 07:00 ART → next run tomorrow 03:30 ART = 06:30 UTC.
    assert next_daily(datetime(2026, 11, 23, 10, 0, tzinfo=UTC)) == datetime(
        2026, 11, 24, 6, 30, tzinfo=UTC
    )
    # 05:00 UTC = 02:00 ART → today at 03:30 ART.
    assert next_daily(datetime(2026, 11, 23, 5, 0, tzinfo=UTC)) == datetime(
        2026, 11, 23, 6, 30, tzinfo=UTC
    )


def test_objects_cli_roundtrip_latest_and_prune(tmp_path: Path) -> None:
    bucket = get_settings().backup_bucket
    prefix = f"test-{uuid.uuid4().hex[:8]}/"
    src = tmp_path / "a.bin"
    src.write_bytes(b"backup")
    assert objects.main(["put", bucket, f"{prefix}1.enc", str(src)]) == 0
    assert objects.main(["put", bucket, f"{prefix}2.enc", str(src)]) == 0
    dst = tmp_path / "b.bin"
    assert objects.main(["get", bucket, f"{prefix}2.enc", str(dst)]) == 0
    assert dst.read_bytes() == b"backup"
    assert objects.main(["latest", bucket, prefix]) == 0
    assert objects.main(["prune", bucket, prefix, "30"]) == 0  # nothing old yet
    assert objects.main(["prune", bucket, prefix, "-1"]) == 0  # everything is "older"
    assert objects.main(["latest", bucket, prefix]) == 1
    assert objects.main(["unknown", bucket]) == 2


def test_backup_logs_never_contain_credentials() -> None:
    from app.scripts.scheduler import redact

    msg = 'pg_dump: error: connection to "postgresql://sei_owner:s3cr3t@db:5432/sei" failed'
    assert "s3cr3t" not in redact(msg)
    assert "postgresql://***@db:5432/sei" in redact(msg)
