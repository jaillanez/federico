"""Public, unauthenticated endpoints."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter()


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]


@router.get("/health", response_model=HealthOut)
async def health(session: Annotated[AsyncSession, Depends(get_session)]) -> JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    body = HealthOut(status="ok" if db_ok else "degraded", database="ok" if db_ok else "error")
    return JSONResponse(body.model_dump(), status_code=200 if db_ok else 503)
