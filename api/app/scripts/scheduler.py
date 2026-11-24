"""Production scheduler: `python -m app.scripts.scheduler` (its own container).

- every hour: rebuild the site if scheduled articles became public
- every day at 03:30 (Argentina): purge expired leads (Ley 25.326) and run the backup script
No cron daemon needed; state is just "last run" timestamps in memory.
"""

import asyncio
import logging
import re
import subprocess
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.services.rebuild import Rebuilder
from app.services.retention import purge_old_leads
from app.services.scheduled import rebuild_if_articles_due

log = logging.getLogger("scheduler")
ART = timedelta(hours=-3)  # Argentina, no DST
DAILY_AT = (3, 30)


def redact(text: str) -> str:
    """Remove credentials from connection URLs before anything reaches the logs."""
    return re.sub(r"://[^/@\s]+@", "://***@", text)


def next_daily(now: datetime) -> datetime:
    local = now + ART
    target = local.replace(hour=DAILY_AT[0], minute=DAILY_AT[1], second=0, microsecond=0)
    if target <= local:
        target += timedelta(days=1)
    return target - ART


async def daily() -> None:
    async with SessionLocal() as session:
        deleted = await purge_old_leads(session)
    log.info("retention: %d leads deleted", deleted)
    # pg_dump → gzip → encrypt → R2, with 30-day retention (infra/backup.sh).
    result = await asyncio.to_thread(
        subprocess.run, ["/app/infra/backup.sh"], capture_output=True, text=True, check=False
    )
    level = logging.INFO if result.returncode == 0 else logging.ERROR
    log.log(
        level, "backup exit=%s %s", result.returncode, redact(result.stdout + result.stderr)[-500:]
    )


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    rebuilder = Rebuilder()
    last_check = datetime.now(UTC)
    next_day = next_daily(last_check)
    log.info("scheduler started; next daily run at %s UTC", next_day.isoformat())
    while True:
        await asyncio.sleep(60)
        now = datetime.now(UTC)
        if now - last_check >= timedelta(hours=1):
            async with SessionLocal() as session:
                await rebuild_if_articles_due(session, last_check, now, rebuilder)
            last_check = now
        if now >= next_day:
            try:
                await daily()
            except Exception:
                log.exception("daily job failed")
            next_day = next_daily(now)


if __name__ == "__main__":
    asyncio.run(main())
