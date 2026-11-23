"""Periodic jobs (run by app/scripts/scheduler.py in production)."""

import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Article
from app.services.rebuild import Rebuilder

log = logging.getLogger(__name__)


async def articles_due(session: AsyncSession, since: datetime, until: datetime) -> int:
    """Scheduled articles whose publication time fell inside (since, until]."""
    count = await session.scalar(
        select(func.count()).where(Article.publicado_at > since, Article.publicado_at <= until)
    )
    return int(count or 0)


async def rebuild_if_articles_due(
    session: AsyncSession, since: datetime, until: datetime, rebuilder: Rebuilder
) -> bool:
    """Scheduled articles only appear on the static site after a rebuild: trigger it."""
    due = await articles_due(session, since, until)
    if due:
        log.info("%d scheduled article(s) became public; rebuilding", due)
        rebuilder.request()
        await rebuilder.wait()
    return due > 0
