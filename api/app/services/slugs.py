import re
import unicodedata
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def slugify(text: str, max_len: int = 150) -> str:
    text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-") or "sin-titulo"


async def unique_slug(session: AsyncSession, model: Any, base: str, exclude_id: Any = None) -> str:
    """`base`, or `base-2`, `base-3`... if taken by another row."""
    slug, n = base, 1
    while True:
        stmt = select(model.id).where(model.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(model.id != exclude_id)
        if await session.scalar(stmt) is None:
            return slug
        n += 1
        slug = f"{base}-{n}"
