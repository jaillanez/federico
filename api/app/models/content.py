from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, false
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class Article(TimestampedBase):
    __tablename__ = "articles"
    __table_args__ = (Index("ix_articles_publicado_at", "publicado_at"),)

    slug: Mapped[str] = mapped_column(String(160), unique=True)
    titulo: Mapped[str] = mapped_column(String(200))
    extracto: Mapped[str | None] = mapped_column(Text)
    cuerpo_md: Mapped[str] = mapped_column(Text, default="", server_default="")
    portada_key: Mapped[str | None] = mapped_column(String(300))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    # NULL means draft; a future date means scheduled.
    publicado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    seo_title: Mapped[str | None] = mapped_column(String(70))
    seo_description: Mapped[str | None] = mapped_column(String(160))


class Testimonial(TimestampedBase):
    __tablename__ = "testimonials"

    nombre: Mapped[str] = mapped_column(String(160))
    cargo: Mapped[str | None] = mapped_column(String(120))
    empresa: Mapped[str | None] = mapped_column(String(200))
    provincia: Mapped[str | None] = mapped_column(String(60))
    texto: Mapped[str] = mapped_column(Text)
    logo_key: Mapped[str | None] = mapped_column(String(300))
    publicado: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    orden: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class SiteSetting(TimestampedBase):
    __tablename__ = "site_settings"

    clave: Mapped[str] = mapped_column(String(80), unique=True)
    valor: Mapped[Any] = mapped_column(JSONB)
