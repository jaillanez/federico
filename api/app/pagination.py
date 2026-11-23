from typing import Annotated, Any

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

PageNum = Annotated[int, Query(ge=1)]
PerPage = Annotated[int, Query(ge=1, le=50)]


async def paginate(
    session: AsyncSession, stmt: Select[Any], page: int, per_page: int
) -> tuple[list[Any], int]:
    total = await session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = (await session.scalars(stmt.limit(per_page).offset((page - 1) * per_page))).all()
    return list(rows), total or 0
