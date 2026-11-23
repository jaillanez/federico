import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase, check_in

ADMIN_ROLES = ("admin", "editor")


class AdminUser(TimestampedBase):
    __tablename__ = "admin_users"
    __table_args__ = (CheckConstraint(check_in("rol", ADMIN_ROLES), name="rol"),)

    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nombre: Mapped[str] = mapped_column(String(120))
    rol: Mapped[str] = mapped_column(String(20), default="editor", server_default="editor")
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Brute-force protection: 5 failed logins lock the account for 15 minutes.
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSession(TimestampedBase):
    """Server-side session: the cookie holds a random token, the DB only its SHA-256."""

    __tablename__ = "admin_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
