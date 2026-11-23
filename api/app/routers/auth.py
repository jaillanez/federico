"""POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, check_origin, create_session, destroy_session
from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import AdminUser
from app.security import hash_password, verify_password

router = APIRouter(prefix="/auth")
Session = Annotated[AsyncSession, Depends(get_session)]

# Verified against when the email does not exist, so both paths take the same time.
_DUMMY_HASH = hash_password("no-es-una-clave-real")


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    nombre: str
    rol: str


def _out(user: AdminUser) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, nombre=user.nombre, rol=user.rol)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, request: Request, response: Response, session: Session) -> UserOut:
    check_origin(request)
    s = get_settings()
    bad = ApiError(401, code="invalid_credentials", message="Email o contraseña incorrectos.")
    user = await session.scalar(
        select(AdminUser).where(func.lower(AdminUser.email) == body.email.strip().lower())
    )
    now = datetime.now(UTC)
    if user is None or not user.activo:
        verify_password(_DUMMY_HASH, body.password)
        raise bad
    if user.bloqueado_hasta and user.bloqueado_hasta > now:
        minutes = max(1, round((user.bloqueado_hasta - now).total_seconds() / 60))
        raise ApiError(
            429,
            code="locked",
            message=f"Demasiados intentos fallidos. Probá de nuevo en {minutes} minutos.",
        )
    if not verify_password(user.password_hash, body.password):
        user.intentos_fallidos += 1
        if user.intentos_fallidos >= s.login_max_attempts:
            user.bloqueado_hasta = now + timedelta(minutes=s.login_lock_minutes)
            user.intentos_fallidos = 0
        await session.commit()
        raise bad
    user.intentos_fallidos = 0
    user.bloqueado_hasta = None
    user.ultimo_acceso = now
    await create_session(session, user, response)
    await session.commit()
    return _out(user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, session: Session) -> Response:
    check_origin(request)
    await destroy_session(session, request, response)
    await session.commit()
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return _out(user)
