from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class ServiceCategory(TimestampedBase):
    __tablename__ = "service_categories"

    slug: Mapped[str] = mapped_column(String(80), unique=True)
    nombre: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str | None] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Sector(TimestampedBase):
    __tablename__ = "sectors"

    slug: Mapped[str] = mapped_column(String(80), unique=True)
    nombre: Mapped[str] = mapped_column(String(120))
    icono: Mapped[str | None] = mapped_column(String(60))
