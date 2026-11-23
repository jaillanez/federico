import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase, check_in
from app.models.catalog import Sector, ServiceCategory

IMAGE_TYPES = ("general", "antes", "despues")


class Project(TimestampedBase):
    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_publicado_category", "publicado", "category_id"),
        Index("ix_projects_provincia", "provincia"),
    )

    slug: Mapped[str] = mapped_column(String(160), unique=True)
    titulo: Mapped[str] = mapped_column(String(200))
    resumen: Mapped[str | None] = mapped_column(Text)
    problema: Mapped[str | None] = mapped_column(Text)
    solucion: Mapped[str | None] = mapped_column(Text)
    resultado: Mapped[str | None] = mapped_column(Text)
    provincia: Mapped[str | None] = mapped_column(String(60))
    localidad: Mapped[str | None] = mapped_column(String(120))
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_categories.id", ondelete="SET NULL")
    )
    sector_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sectors.id", ondelete="SET NULL")
    )
    fecha_obra: Mapped[date | None] = mapped_column(Date)
    potencia_kw: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    destacado: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    publicado: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    seo_title: Mapped[str | None] = mapped_column(String(70))
    seo_description: Mapped[str | None] = mapped_column(String(160))

    category: Mapped[ServiceCategory | None] = relationship()
    sector: Mapped[Sector | None] = relationship()
    images: Mapped[list["ProjectImage"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProjectImage.orden",
    )


class ProjectImage(TimestampedBase):
    __tablename__ = "project_images"
    __table_args__ = (
        CheckConstraint(check_in("tipo", IMAGE_TYPES), name="tipo"),
        # Only one cover image per project.
        Index(
            "uq_project_images_portada",
            "project_id",
            unique=True,
            postgresql_where=text("es_portada"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    storage_key: Mapped[str] = mapped_column(String(300))
    ancho: Mapped[int | None] = mapped_column(Integer)
    alto: Mapped[int | None] = mapped_column(Integer)
    alt_text: Mapped[str] = mapped_column(String(250), default="", server_default="")
    orden: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    es_portada: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    tipo: Mapped[str] = mapped_column(String(10), default="general", server_default="general")

    project: Mapped[Project] = relationship(back_populates="images")
