from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, true
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
