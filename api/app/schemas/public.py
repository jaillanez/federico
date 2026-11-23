"""Response schemas for the public API."""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    per_page: int


class CatalogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    slug: str
    nombre: str


class ImageSource(BaseModel):
    width: int
    avif: str
    webp: str


class ImageOut(BaseModel):
    id: UUID
    alt_text: str
    ancho: int | None
    alto: int | None
    es_portada: bool
    tipo: Literal["general", "antes", "despues"]
    sources: list[ImageSource]


class ProjectSummary(BaseModel):
    slug: str
    titulo: str
    resumen: str | None
    provincia: str | None
    localidad: str | None
    fecha_obra: date | None
    potencia_kw: float | None
    destacado: bool
    categoria: CatalogItem | None
    sector: CatalogItem | None
    portada: ImageOut | None
    cantidad_fotos: int


class ProjectDetail(ProjectSummary):
    problema: str | None
    solucion: str | None
    resultado: str | None
    lat: float | None
    lng: float | None
    seo_title: str | None
    seo_description: str | None
    updated_at: datetime
    imagenes: list[ImageOut]


class ArticleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    slug: str
    titulo: str
    extracto: str | None
    portada_url: str | None
    tags: list[str]
    publicado_at: datetime


class ArticleDetail(ArticleSummary):
    cuerpo_md: str
    seo_title: str | None
    seo_description: str | None
    updated_at: datetime


class TestimonialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    nombre: str
    cargo: str | None
    empresa: str | None
    provincia: str | None
    texto: str
    logo_url: str | None


class PublicSettings(BaseModel):
    values: dict[str, Any]
