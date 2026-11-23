"""Public, unauthenticated endpoints (read-only content used by the static build)."""

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Select, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.errors import ApiError
from app.models import Article, Project, Sector, ServiceCategory, SiteSetting, Testimonial
from app.schemas.public import (
    ArticleDetail,
    ArticleSummary,
    CatalogItem,
    Page,
    ProjectDetail,
    ProjectSummary,
    PublicSettings,
    TestimonialOut,
)
from app.services.media import image_out, public_url

router = APIRouter()

Session = Annotated[AsyncSession, Depends(get_session)]
PageNum = Annotated[int, Query(ge=1)]
PerPage = Annotated[int, Query(ge=1, le=50)]

# Only these site_settings keys are exposed publicly.
PUBLIC_SETTING_KEYS = ("contacto", "whatsapp", "metricas", "tg_phi_limite")


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]


@router.get("/health", response_model=HealthOut)
async def health(session: Session) -> JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    body = HealthOut(status="ok" if db_ok else "degraded", database="ok" if db_ok else "error")
    return JSONResponse(body.model_dump(), status_code=200 if db_ok else 503)


async def _paginate(
    session: AsyncSession, stmt: Select[Any], page: int, per_page: int
) -> tuple[list[Any], int]:
    total = await session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = (await session.scalars(stmt.limit(per_page).offset((page - 1) * per_page))).all()
    return list(rows), total or 0


# --- Projects ---------------------------------------------------------------


def _project_query() -> Select[tuple[Project]]:
    return (
        select(Project)
        .where(Project.publicado.is_(True))
        .options(
            selectinload(Project.images),
            selectinload(Project.category),
            selectinload(Project.sector),
        )
    )


def _summary_fields(p: Project) -> dict[str, Any]:
    cover = next((i for i in p.images if i.es_portada), p.images[0] if p.images else None)
    return {
        "slug": p.slug,
        "titulo": p.titulo,
        "resumen": p.resumen,
        "provincia": p.provincia,
        "localidad": p.localidad,
        "fecha_obra": p.fecha_obra,
        "potencia_kw": float(p.potencia_kw) if p.potencia_kw is not None else None,
        "destacado": p.destacado,
        "categoria": CatalogItem.model_validate(p.category) if p.category else None,
        "sector": CatalogItem.model_validate(p.sector) if p.sector else None,
        "portada": image_out(cover) if cover else None,
        "cantidad_fotos": len(p.images),
    }


@router.get("/projects", response_model=Page[ProjectSummary])
async def list_projects(
    session: Session,
    categoria: str | None = None,
    sector: str | None = None,
    provincia: str | None = None,
    destacado: bool | None = None,
    page: PageNum = 1,
    per_page: PerPage = 20,
) -> Page[ProjectSummary]:
    stmt = _project_query()
    if categoria:
        stmt = stmt.join(Project.category).where(ServiceCategory.slug == categoria)
    if sector:
        stmt = stmt.join(Project.sector).where(Sector.slug == sector)
    if provincia:
        stmt = stmt.where(Project.provincia == provincia)
    if destacado is not None:
        stmt = stmt.where(Project.destacado.is_(destacado))
    stmt = stmt.order_by(
        Project.destacado.desc(), Project.fecha_obra.desc().nulls_last(), Project.titulo
    )
    rows, total = await _paginate(session, stmt, page, per_page)
    return Page(
        items=[ProjectSummary(**_summary_fields(p)) for p in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/projects/{slug}", response_model=ProjectDetail)
async def get_project(slug: str, session: Session) -> ProjectDetail:
    project = await session.scalar(_project_query().where(Project.slug == slug))
    if project is None:
        raise ApiError(404, message="No encontramos esa obra.")
    return ProjectDetail(
        **_summary_fields(project),
        problema=project.problema,
        solucion=project.solucion,
        resultado=project.resultado,
        lat=float(project.lat) if project.lat is not None else None,
        lng=float(project.lng) if project.lng is not None else None,
        seo_title=project.seo_title,
        seo_description=project.seo_description,
        updated_at=project.updated_at,
        imagenes=[image_out(i) for i in project.images],
    )


# --- Articles ---------------------------------------------------------------


def _published_articles() -> Select[tuple[Article]]:
    now = datetime.now(UTC)
    return select(Article).where(Article.publicado_at.is_not(None), Article.publicado_at <= now)


def _article_fields(a: Article) -> dict[str, Any]:
    return {
        "slug": a.slug,
        "titulo": a.titulo,
        "extracto": a.extracto,
        "portada_url": public_url(a.portada_key) if a.portada_key else None,
        "tags": a.tags,
        "publicado_at": a.publicado_at,
    }


@router.get("/articles", response_model=Page[ArticleSummary])
async def list_articles(
    session: Session, tag: str | None = None, page: PageNum = 1, per_page: PerPage = 20
) -> Page[ArticleSummary]:
    stmt = _published_articles()
    if tag:
        stmt = stmt.where(Article.tags.contains([tag]))
    stmt = stmt.order_by(Article.publicado_at.desc())
    rows, total = await _paginate(session, stmt, page, per_page)
    return Page(
        items=[ArticleSummary(**_article_fields(a)) for a in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/articles/{slug}", response_model=ArticleDetail)
async def get_article(slug: str, session: Session) -> ArticleDetail:
    article = await session.scalar(_published_articles().where(Article.slug == slug))
    if article is None:
        raise ApiError(404, message="No encontramos ese artículo.")
    return ArticleDetail(
        **_article_fields(article),
        cuerpo_md=article.cuerpo_md,
        seo_title=article.seo_title,
        seo_description=article.seo_description,
        updated_at=article.updated_at,
    )


# --- Testimonials and settings ---------------------------------------------


@router.get("/testimonials", response_model=list[TestimonialOut])
async def list_testimonials(session: Session) -> list[TestimonialOut]:
    rows = await session.scalars(
        select(Testimonial).where(Testimonial.publicado.is_(True)).order_by(Testimonial.orden)
    )
    return [
        TestimonialOut(
            nombre=t.nombre,
            cargo=t.cargo,
            empresa=t.empresa,
            provincia=t.provincia,
            texto=t.texto,
            logo_url=public_url(t.logo_key) if t.logo_key else None,
        )
        for t in rows
    ]


@router.get("/settings/public", response_model=PublicSettings)
async def public_settings(session: Session) -> PublicSettings:
    rows = await session.scalars(
        select(SiteSetting).where(SiteSetting.clave.in_(PUBLIC_SETTING_KEYS))
    )
    return PublicSettings(values={s.clave: s.valor for s in rows})
