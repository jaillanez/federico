"""Ley 25.326: delete leads that never moved forward ("nuevo" or "descartado") after N months,
together with their files in the private bucket."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Lead, LeadFile
from app.services import storage

log = logging.getLogger(__name__)
PURGEABLE_STATES = ("nuevo", "descartado")


def cutoff(now: datetime | None = None) -> datetime:
    months = get_settings().lead_retention_months
    return (now or datetime.now(UTC)) - timedelta(days=round(months * 30.4375))


async def purge_old_leads(session: AsyncSession, now: datetime | None = None) -> int:
    """Delete expired leads and their files. Returns how many leads were deleted."""
    limit = cutoff(now)
    expired = select(Lead.id).where(Lead.estado.in_(PURGEABLE_STATES), Lead.created_at < limit)
    keys = list(
        await session.scalars(select(LeadFile.storage_key).where(LeadFile.lead_id.in_(expired)))
    )
    # Files first: if the DB delete fails we only lose already-expired files, never orphan rows.
    await storage.delete_private(keys)
    result = await session.execute(delete(Lead).where(Lead.id.in_(expired)))
    await session.commit()
    count = int(result.rowcount or 0)
    log.info("retention: deleted %d leads and %d files older than %s", count, len(keys), limit)
    return count
