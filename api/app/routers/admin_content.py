"""Admin: articles, testimonials, site settings and site rebuild."""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

import anyio
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import Admin, Editor
from app.db import get_session
from app.errors import ApiError
from app.models import Article, SiteSetting, Testimonial
from app.pagination import PageNum, PerPage, paginate
from app.schemas.admin import (
    AdminArticle,
    AdminTestimonial,
    ArticleCreate,
    ArticleFields,
    Page,
    RebuildOut,
    SettingsIn,
    TestimonialCreate,
    TestimonialFields,
)
from app.services import storage
from app.services.images import ImageError, process
from app.services.media import public_url
from app.services.rebuild import rebuilder, request_rebuild
from app.services.slugs import slugify, unique_slug

router = APIRouter(prefix="/admin")
Session = Annotated[AsyncSession, Depends(get_session)]
MAX_IMAGE_BYTES = 15 * 1024 * 1024


async def _store_image(upload: UploadFile, prefix: str, width: int) -> str:
    """Process a single image (cover/logo) and return the WebP key stored in the public bucket."""
    data = await upload.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(413, message="La imagen supera los 15 MB.")
    try:
        result = await anyio.to_thread.run_sync(lambda: process(data, widths=(width,)))
    except ImageError as exc:
        raise ApiError(422, code="invalid_file_type", message=str(exc)) from exc
    stem = f"{prefix}/{uuid.uuid4()}"
    webp_key = ""
    for v in result.variants:
        key = f"{stem}-{v.width}.{v.ext}"
        await storage.put_public(key, v.data, v.mime)
        if v.ext == "webp":
            webp_key = key
    return webp_key


# --- Articles ---


def _is_live(published_at: datetime | None) -> bool:
    return published_at is not None and published_at <= datetime.now(UTC)


def _article_out(a: Article) -> AdminArticle:
    if a.publicado_at is None:
        estado = "borrador"
    elif a.publicado_at > datetime.now(UTC):
        estado = "programado"
    else:
        estado = "publicado"
    return AdminArticle(
        id=a.id,
        slug=a.slug,
        titulo=a.titulo,
        extracto=a.extracto,
        cuerpo_md=a.cuerpo_md,
        tags=a.tags,
        publicado_at=a.publicado_at,
        estado=estado,
        portada_url=public_url(a.portada_key) if a.portada_key else None,
        seo_title=a.seo_title,
        seo_description=a.seo_description,
        updated_at=a.updated_at,
    )


async def _get_article(session: AsyncSession, article_id: uuid.UUID) -> Article:
    a = await session.get(Article, article_id)
    if a is None:
        raise ApiError(404, message="No encontramos ese artículo.")
    return a


def _clean_tags(tags: list[str]) -> list[str]:
    seen: list[str] = []
    for t in tags:
        tag = slugify(t, 40)
        if tag and tag != "sin-titulo" and tag not in seen:
            seen.append(tag)
    return seen


async def _apply_article(session: AsyncSession, a: Article, body: ArticleFields) -> None:
    data: dict[str, Any] = body.model_dump(exclude_unset=True)
    if "slug" in data:
        slug = data.pop("slug")
        if slug:
            a.slug = await unique_slug(session, Article, slug, exclude_id=a.id)
    if "tags" in data:
        a.tags = _clean_tags(data.pop("tags") or [])
    for key, value in data.items():
        if key in ("titulo", "cuerpo_md") and value is None:
            continue
        setattr(a, key, value.strip() if isinstance(value, str) else value)


@router.get("/articles", response_model=Page[AdminArticle])
async def list_articles(
    _: Editor,
    session: Session,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: PageNum = 1,
    per_page: PerPage = 20,
) -> Page[AdminArticle]:
    stmt = select(Article)
    if q:
        stmt = stmt.where(or_(Article.titulo.ilike(f"%{q}%"), Article.extracto.ilike(f"%{q}%")))
    stmt = stmt.order_by(Article.publicado_at.desc().nulls_first(), Article.updated_at.desc())
    rows, total = await paginate(session, stmt, page, per_page)
    return Page(items=[_article_out(a) for a in rows], total=total, page=page, per_page=per_page)


@router.post("/articles", status_code=201, response_model=AdminArticle)
async def create_article(body: ArticleCreate, _: Editor, session: Session) -> AdminArticle:
    a = Article(id=uuid.uuid4(), titulo=body.titulo.strip(), slug="", cuerpo_md="", tags=[])
    a.slug = await unique_slug(session, Article, body.slug or slugify(body.titulo))
    await _apply_article(session, a, body.model_copy(update={"slug": None}))
    session.add(a)
    await session.commit()
    await session.refresh(a)
    if _is_live(a.publicado_at):
        request_rebuild()
    return _article_out(a)


@router.get("/articles/{article_id}", response_model=AdminArticle)
async def get_article(article_id: uuid.UUID, _: Editor, session: Session) -> AdminArticle:
    return _article_out(await _get_article(session, article_id))


@router.patch("/articles/{article_id}", response_model=AdminArticle)
async def update_article(
    article_id: uuid.UUID, body: ArticleFields, _: Editor, session: Session
) -> AdminArticle:
    a = await _get_article(session, article_id)
    was_live = _is_live(a.publicado_at)
    await _apply_article(session, a, body)
    await session.commit()
    await session.refresh(a)
    if was_live or _is_live(a.publicado_at):
        request_rebuild()
    return _article_out(a)


@router.delete("/articles/{article_id}", status_code=204)
async def delete_article(article_id: uuid.UUID, _: Editor, session: Session) -> None:
    a = await _get_article(session, article_id)
    was_live = _is_live(a.publicado_at)
    await session.delete(a)
    await session.commit()
    await storage.delete_public_prefix(f"articles/{article_id}/")
    if was_live:
        request_rebuild()


@router.post("/articles/{article_id}/cover", response_model=AdminArticle)
async def upload_cover(
    article_id: uuid.UUID, _: Editor, session: Session, file: Annotated[UploadFile, File()]
) -> AdminArticle:
    a = await _get_article(session, article_id)
    old = a.portada_key
    a.portada_key = await _store_image(file, f"articles/{a.id}", 1600)
    await session.commit()
    await session.refresh(a)
    if old:
        await storage.delete_public_prefix(old.rsplit("-", 1)[0])
    if _is_live(a.publicado_at):
        request_rebuild()
    return _article_out(a)


# --- Testimonials ---


def _testimonial_out(t: Testimonial) -> AdminTestimonial:
    return AdminTestimonial(
        id=t.id,
        nombre=t.nombre,
        cargo=t.cargo,
        empresa=t.empresa,
        provincia=t.provincia,
        texto=t.texto,
        publicado=t.publicado,
        orden=t.orden,
        logo_url=public_url(t.logo_key) if t.logo_key else None,
    )


async def _get_testimonial(session: AsyncSession, tid: uuid.UUID) -> Testimonial:
    t = await session.get(Testimonial, tid)
    if t is None:
        raise ApiError(404, message="No encontramos ese testimonio.")
    return t


@router.get("/testimonials", response_model=list[AdminTestimonial])
async def list_testimonials(_: Editor, session: Session) -> list[AdminTestimonial]:
    rows = await session.scalars(
        select(Testimonial).order_by(Testimonial.orden, Testimonial.nombre)
    )
    return [_testimonial_out(t) for t in rows]


@router.post("/testimonials", status_code=201, response_model=AdminTestimonial)
async def create_testimonial(
    body: TestimonialCreate, _: Editor, session: Session
) -> AdminTestimonial:
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    t = Testimonial(**data)
    session.add(t)
    await session.commit()
    if t.publicado:
        request_rebuild()
    return _testimonial_out(t)


@router.patch("/testimonials/{tid}", response_model=AdminTestimonial)
async def update_testimonial(
    tid: uuid.UUID, body: TestimonialFields, _: Editor, session: Session
) -> AdminTestimonial:
    t = await _get_testimonial(session, tid)
    was_public = t.publicado
    for key, value in body.model_dump(exclude_unset=True).items():
        if key in ("nombre", "texto", "publicado", "orden") and value is None:
            continue
        setattr(t, key, value)
    await session.commit()
    if was_public or t.publicado:
        request_rebuild()
    return _testimonial_out(t)


@router.delete("/testimonials/{tid}", status_code=204)
async def delete_testimonial(tid: uuid.UUID, _: Editor, session: Session) -> None:
    t = await _get_testimonial(session, tid)
    was_public = t.publicado
    await session.delete(t)
    await session.commit()
    await storage.delete_public_prefix(f"testimonials/{tid}/")
    if was_public:
        request_rebuild()


@router.post("/testimonials/{tid}/logo", response_model=AdminTestimonial)
async def upload_logo(
    tid: uuid.UUID, _: Editor, session: Session, file: Annotated[UploadFile, File()]
) -> AdminTestimonial:
    t = await _get_testimonial(session, tid)
    t.logo_key = await _store_image(file, f"testimonials/{t.id}", 400)
    await session.commit()
    if t.publicado:
        request_rebuild()
    return _testimonial_out(t)


# --- Settings (admins only) ---

SETTING_KEYS = ("contacto", "whatsapp", "metricas", "tg_phi_limite")


@router.get("/settings", response_model=SettingsIn)
async def get_settings_(_: Admin, session: Session) -> SettingsIn:
    rows = await session.scalars(select(SiteSetting).where(SiteSetting.clave.in_(SETTING_KEYS)))
    values = {s.clave: s.valor for s in rows}
    try:
        return SettingsIn.model_validate(values)
    except ValueError as exc:
        raise ApiError(500, message="La configuración guardada está incompleta.") from exc


@router.put("/settings", response_model=SettingsIn)
async def put_settings(body: SettingsIn, _: Admin, session: Session) -> SettingsIn:
    data = body.model_dump(mode="json")
    existing = {
        s.clave: s
        for s in await session.scalars(select(SiteSetting).where(SiteSetting.clave.in_(data)))
    }
    for key, value in data.items():
        if key in existing:
            existing[key].valor = value
        else:
            session.add(SiteSetting(clave=key, valor=value))
    await session.commit()
    request_rebuild()
    return body


# --- Rebuild ---


@router.get("/rebuild", response_model=RebuildOut)
async def rebuild_status(_: Editor) -> RebuildOut:
    return RebuildOut(**vars(rebuilder.status()))


@router.post("/rebuild", status_code=202, response_model=RebuildOut)
async def rebuild_now(_: Editor) -> RebuildOut:
    return RebuildOut(**vars(request_rebuild()))
