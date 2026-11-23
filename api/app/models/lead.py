import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase, check_in

LEAD_STATES = ("nuevo", "en_analisis", "respondido", "cliente", "descartado")
LEAD_ORIGINS = ("diagnostico", "contacto")
LEAD_GOALS = ("reducir_costo_fijo", "eliminar_penalizaciones", "evaluar_solar", "revisar_categoria")
LEAD_FILE_TYPES = ("factura", "presupuesto_solar", "otro")


class Lead(TimestampedBase):
    __tablename__ = "leads"
    __table_args__ = (
        CheckConstraint(check_in("estado", LEAD_STATES), name="estado"),
        CheckConstraint(check_in("origen", LEAD_ORIGINS), name="origen"),
        CheckConstraint(
            "objetivos <@ ARRAY[" + ", ".join(f"'{g}'" for g in LEAD_GOALS) + "]::text[]",
            name="objetivos",
        ),
        Index("ix_leads_estado_created_at", "estado", "created_at"),
        Index("ix_leads_provincia", "provincia"),
    )

    empresa: Mapped[str | None] = mapped_column(String(200))
    contacto_nombre: Mapped[str] = mapped_column(String(160))
    cargo: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    whatsapp: Mapped[str | None] = mapped_column(String(30))
    provincia: Mapped[str | None] = mapped_column(String(60))
    localidad: Mapped[str | None] = mapped_column(String(120))
    objetivos: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    mensaje: Mapped[str | None] = mapped_column(Text)
    origen: Mapped[str] = mapped_column(String(20), default="diagnostico")
    utm_source: Mapped[str | None] = mapped_column(String(100))
    utm_medium: Mapped[str | None] = mapped_column(String(100))
    utm_campaign: Mapped[str | None] = mapped_column(String(100))
    estado: Mapped[str] = mapped_column(String(20), default="nuevo", server_default="nuevo")
    consentimiento_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_hash: Mapped[str | None] = mapped_column(String(64))

    files: Mapped[list["LeadFile"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan", passive_deletes=True
    )
    notes: Mapped[list["LeadNote"]] = relationship(
        back_populates="lead",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="LeadNote.created_at",
    )


class LeadFile(TimestampedBase):
    __tablename__ = "lead_files"
    __table_args__ = (CheckConstraint(check_in("tipo", LEAD_FILE_TYPES), name="tipo"),)

    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    tipo: Mapped[str] = mapped_column(String(20))
    storage_key: Mapped[str] = mapped_column(String(300))
    nombre_original: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))

    lead: Mapped[Lead] = relationship(back_populates="files")


class LeadNote(TimestampedBase):
    __tablename__ = "lead_notes"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    autor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )
    texto: Mapped[str | None] = mapped_column(Text)
    estado_anterior: Mapped[str | None] = mapped_column(String(20))
    estado_nuevo: Mapped[str | None] = mapped_column(String(20))

    lead: Mapped[Lead] = relationship(back_populates="notes")
