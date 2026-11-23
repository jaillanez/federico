"""Admin panel authentication: server-side sessions in an HttpOnly cookie, CSRF origin check
and role-based access."""

import hashlib
import secrets
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import urlsplit

from fastapi import Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import AdminSession, AdminUser

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(session: AsyncSession, user: AdminUser, response: Response) -> None:
    s = get_settings()
    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(hours=s.session_hours)
    # Opportunistic cleanup of expired sessions.
    await session.execute(delete(AdminSession).where(AdminSession.expires_at < datetime.now(UTC)))
    session.add(AdminSession(token_hash=_hash_token(token), user_id=user.id, expires_at=expires))
    response.set_cookie(
        s.session_cookie_name,
        token,
        max_age=s.session_hours * 3600,
        httponly=True,
        secure=s.session_cookie_secure,
        samesite="strict",
        path="/api",
    )


async def destroy_session(session: AsyncSession, request: Request, response: Response) -> None:
    s = get_settings()
    token = request.cookies.get(s.session_cookie_name)
    if token:
        await session.execute(
            delete(AdminSession).where(AdminSession.token_hash == _hash_token(token))
        )
    response.delete_cookie(s.session_cookie_name, path="/api", samesite="strict")


def check_origin(request: Request) -> None:
    """CSRF defence for cookie-authenticated requests: unsafe methods must come from our own
    origin. SameSite=Strict already blocks most cases; this covers older browsers."""
    if request.method not in UNSAFE_METHODS:
        return
    origin = request.headers.get("origin") or None  # an empty header counts as missing
    if origin is None and (referer := request.headers.get("referer")):
        parts = urlsplit(referer)
        origin = f"{parts.scheme}://{parts.netloc}"
    if not origin or origin.rstrip("/") not in get_settings().trusted_origins:
        raise ApiError(403, code="csrf", message="Origen no permitido.")


async def current_user(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> AdminUser:
    check_origin(request)
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        raise ApiError(401)
    row = await session.execute(
        select(AdminUser)
        .join(AdminSession, AdminSession.user_id == AdminUser.id)
        .where(
            AdminSession.token_hash == _hash_token(token),
            AdminSession.expires_at > datetime.now(UTC),
            AdminUser.activo.is_(True),
        )
    )
    user = row.scalar_one_or_none()
    if user is None:
        raise ApiError(401, message="Tu sesión venció. Ingresá de nuevo.")
    return user


CurrentUser = Annotated[AdminUser, Depends(current_user)]


def require_role(*roles: str) -> Callable[..., Coroutine[Any, Any, AdminUser]]:
    async def checker(user: CurrentUser) -> AdminUser:
        if user.rol not in roles:
            raise ApiError(403)
        return user

    return checker


# Content (projects, articles, testimonials): admins and editors.
Editor = Annotated[AdminUser, Depends(require_role("admin", "editor"))]
# Leads (client documents) and site settings: admins only.
Admin = Annotated[AdminUser, Depends(require_role("admin"))]
