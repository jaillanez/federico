"""Request/response schemas for the admin panel."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.public import CatalogItem, ImageOut, Page

__all__ = ["CatalogItem", "Page"]

Estado = Literal["nuevo", "en_analisis", "respondido", "cliente", "descartado"]


class Catalog(BaseModel):
    categorias: list[CatalogItem]
    sectores: list[CatalogItem]


# --- Projects ---


class ProjectFields(BaseModel):
    titulo: str | None = Field(default=None, min_length=3, max_length=200)
    slug: str | None = Field(default=None, max_length=160, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    resumen: str | None = Field(default=None, max_length=1000)
    problema: str | None = Field(default=None, max_length=5000)
    solucion: str | None = Field(default=None, max_length=5000)
    resultado: str | None = Field(default=None, max_length=5000)
    provincia: str | None = Field(default=None, max_length=60)
    localidad: str | None = Field(default=None, max_length=120)
    lat: float | None = Field(default=None, ge=-56, le=-21)
    lng: float | None = Field(default=None, ge=-74, le=-53)
    categoria: str | None = None  # category slug
    sector: str | None = None  # sector slug
    fecha_obra: date | None = None
    potencia_kw: float | None = Field(default=None, ge=0, le=1_000_000)
    destacado: bool | None = None
    publicado: bool | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=160)


class ProjectCreate(ProjectFields):
    titulo: str = Field(min_length=3, max_length=200)


class AdminImage(ImageOut):
    orden: int
    procesando: bool


class AdminProjectSummary(BaseModel):
    id: uuid.UUID
    slug: str
    titulo: str
    provincia: str | None
    categoria: CatalogItem | None
    publicado: bool
    destacado: bool
    cantidad_fotos: int
    portada: ImageOut | None
    updated_at: datetime


class AdminProject(AdminProjectSummary):
    resumen: str | None
    problema: str | None
    solucion: str | None
    resultado: str | None
    localidad: str | None
    lat: float | None
    lng: float | None
    sector: CatalogItem | None
    fecha_obra: date | None
    potencia_kw: float | None
    seo_title: str | None
    seo_description: str | None
    imagenes: list[AdminImage]


class ImagePatch(BaseModel):
    alt_text: str | None = Field(default=None, max_length=250)
    es_portada: bool | None = None
    tipo: Literal["general", "antes", "despues"] | None = None


class ImageOrder(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


# --- Leads ---


class LeadSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime
    empresa: str | None
    contacto_nombre: str
    email: str
    whatsapp: str | None
    provincia: str | None
    origen: str
    estado: Estado
    objetivos: list[str]
    cantidad_archivos: int


class LeadFileOut(BaseModel):
    id: uuid.UUID
    tipo: str
    nombre_original: str
    mime: str
    bytes: int


class LeadNoteOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    autor: str | None
    texto: str | None
    estado_anterior: str | None
    estado_nuevo: str | None


class LeadDetail(LeadSummary):
    cargo: str | None
    localidad: str | None
    mensaje: str | None
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    consentimiento_at: datetime | None
    archivos: list[LeadFileOut]
    notas: list[LeadNoteOut]


class LeadPatch(BaseModel):
    estado: Estado
    nota: str | None = Field(default=None, max_length=4000)


class NoteIn(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)


class Dashboard(BaseModel):
    consultas_nuevas: int
    consultas_semana: int
    semana_por_provincia: dict[str, int]
    ultimas_obras: list[AdminProjectSummary]


# --- Articles ---


class ArticleFields(BaseModel):
    titulo: str | None = Field(default=None, min_length=3, max_length=200)
    slug: str | None = Field(default=None, max_length=160, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    extracto: str | None = Field(default=None, max_length=500)
    cuerpo_md: str | None = Field(default=None, max_length=100_000)
    tags: list[str] | None = Field(default=None, max_length=12)
    # None = draft; a future date schedules the publication.
    publicado_at: datetime | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=160)


class ArticleCreate(ArticleFields):
    titulo: str = Field(min_length=3, max_length=200)


class AdminArticle(BaseModel):
    id: uuid.UUID
    slug: str
    titulo: str
    extracto: str | None
    cuerpo_md: str
    tags: list[str]
    publicado_at: datetime | None
    estado: Literal["borrador", "programado", "publicado"]
    portada_url: str | None
    seo_title: str | None
    seo_description: str | None
    updated_at: datetime


# --- Testimonials ---


class TestimonialFields(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    cargo: str | None = Field(default=None, max_length=120)
    empresa: str | None = Field(default=None, max_length=200)
    provincia: str | None = Field(default=None, max_length=60)
    texto: str | None = Field(default=None, min_length=10, max_length=1500)
    publicado: bool | None = None
    orden: int | None = Field(default=None, ge=0, le=10_000)


class TestimonialCreate(TestimonialFields):
    nombre: str = Field(min_length=2, max_length=160)
    texto: str = Field(min_length=10, max_length=1500)


class AdminTestimonial(BaseModel):
    id: uuid.UUID
    nombre: str
    cargo: str | None
    empresa: str | None
    provincia: str | None
    texto: str
    publicado: bool
    orden: int
    logo_url: str | None


# --- Settings ---


class Contacto(BaseModel):
    direccion: str = Field(max_length=200)
    telefono: str = Field(max_length=40)
    celular: str = Field(max_length=40)
    email: str = Field(max_length=254)


class Whatsapp(BaseModel):
    numero: str = Field(pattern=r"^549\d{10}$", description="549 + código de área + número")


class Metrica(BaseModel):
    clave: str = Field(max_length=40)
    etiqueta: str = Field(max_length=60)
    valor: float | None = Field(default=None, ge=0)
    sufijo: str | None = Field(default=None, max_length=10)


class SettingsIn(BaseModel):
    contacto: Contacto
    whatsapp: Whatsapp
    metricas: list[Metrica] = Field(max_length=6)
    tg_phi_limite: float = Field(gt=0, le=2)


class RebuildOut(BaseModel):
    pending: bool
    scheduled_for: datetime | None
    last_run_at: datetime | None
    last_ok: bool | None
    configured: bool
