"""Admin: projects (obras) and their photos."""

import logging
import uuid
from typing import Annotated, Any

import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from sqlalchemy import Select, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import Editor
from app.db import SessionLocal, get_session
from app.errors import ApiError
from app.models import Project, ProjectImage, Sector, ServiceCategory
from app.pagination import PageNum, PerPage, paginate
from app.schemas.admin import (
    AdminImage,
    AdminProject,
    AdminProjectSummary,
    Catalog,
    CatalogItem,
    ImageOrder,
    ImagePatch,
    Page,
    ProjectCreate,
    ProjectFields,
)
from app.services import storage
from app.services.filetypes import JPEG, PNG, WEBP, sniff
from app.services.images import ImageError, process
from app.services.media import image_out
from app.services.rebuild import request_rebuild
from app.services.slugs import slugify, unique_slug

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin")
Session = Annotated[AsyncSession, Depends(get_session)]

MAX_PHOTO_BYTES = 25 * 1024 * 1024
MAX_PHOTOS_PER_UPLOAD = 20


def _query() -> Select[tuple[Project]]:
    return select(Project).options(
        selectinload(Project.images), selectinload(Project.category), selectinload(Project.sector)
    )


def _cover(p: Project) -> ProjectImage | None:
    ready = [i for i in p.images if i.ancho is not None]
    return next((i for i in ready if i.es_portada), ready[0] if ready else None)


def _summary(p: Project) -> AdminProjectSummary:
    cover = _cover(p)
    return AdminProjectSummary(
        id=p.id,
        slug=p.slug,
        titulo=p.titulo,
        provincia=p.provincia,
        categoria=CatalogItem.model_validate(p.category) if p.category else None,
        publicado=p.publicado,
        destacado=p.destacado,
        cantidad_fotos=len(p.images),
        portada=image_out(cover) if cover else None,
        updated_at=p.updated_at,
    )


def _admin_image(i: ProjectImage) -> AdminImage:
    return AdminImage(**image_out(i).model_dump(), orden=i.orden, procesando=i.ancho is None)


def _detail(p: Project) -> AdminProject:
    return AdminProject(
        **_summary(p).model_dump(),
        resumen=p.resumen,
        problema=p.problema,
        solucion=p.solucion,
        resultado=p.resultado,
        localidad=p.localidad,
        lat=float(p.lat) if p.lat is not None else None,
        lng=float(p.lng) if p.lng is not None else None,
        sector=CatalogItem.model_validate(p.sector) if p.sector else None,
        fecha_obra=p.fecha_obra,
        potencia_kw=float(p.potencia_kw) if p.potencia_kw is not None else None,
        seo_title=p.seo_title,
        seo_description=p.seo_description,
        imagenes=[_admin_image(i) for i in p.images],
    )


async def _get(session: AsyncSession, project_id: uuid.UUID) -> Project:
    project = await session.scalar(_query().where(Project.id == project_id))
    if project is None:
        raise ApiError(404, message="No encontramos esa obra.")
    return project


async def _apply(session: AsyncSession, project: Project, data: ProjectFields) -> None:
    fields = data.model_dump(exclude_unset=True)
    if "categoria" in fields:
        slug = fields.pop("categoria")
        project.category_id = (
            await session.scalar(select(ServiceCategory.id).where(ServiceCategory.slug == slug))
            if slug
            else None
        )
        if slug and project.category_id is None:
            raise ApiError(422, fields={"categoria": "Categoría inexistente."})
    if "sector" in fields:
        slug = fields.pop("sector")
        project.sector_id = (
            await session.scalar(select(Sector.id).where(Sector.slug == slug)) if slug else None
        )
        if slug and project.sector_id is None:
            raise ApiError(422, fields={"sector": "Sector inexistente."})
    for key, value in fields.items():
        if key == "slug" and value is None:
            continue
        if key in ("titulo",) and value is None:
            continue
        setattr(project, key, value.strip() if isinstance(value, str) else value)
    if fields.get("slug"):
        project.slug = await unique_slug(session, Project, fields["slug"], exclude_id=project.id)


@router.get("/catalog", response_model=Catalog)
async def catalog(_: Editor, session: Session) -> Catalog:
    cats = await session.scalars(select(ServiceCategory).order_by(ServiceCategory.orden))
    secs = await session.scalars(select(Sector).order_by(Sector.nombre))
    return Catalog(
        categorias=[CatalogItem.model_validate(c) for c in cats],
        sectores=[CatalogItem.model_validate(s) for s in secs],
    )


@router.get("/projects", response_model=Page[AdminProjectSummary])
async def list_projects(
    _: Editor,
    session: Session,
    q: Annotated[str | None, Query(max_length=100)] = None,
    publicado: bool | None = None,
    page: PageNum = 1,
    per_page: PerPage = 20,
) -> Page[AdminProjectSummary]:
    stmt = _query()
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Project.titulo.ilike(like), Project.localidad.ilike(like)))
    if publicado is not None:
        stmt = stmt.where(Project.publicado.is_(publicado))
    stmt = stmt.order_by(Project.updated_at.desc())
    rows, total = await paginate(session, stmt, page, per_page)
    return Page(items=[_summary(p) for p in rows], total=total, page=page, per_page=per_page)


@router.post("/projects", status_code=201, response_model=AdminProject)
async def create_project(body: ProjectCreate, _: Editor, session: Session) -> AdminProject:
    project = Project(id=uuid.uuid4(), titulo=body.titulo.strip(), slug="")
    project.slug = await unique_slug(session, Project, body.slug or slugify(body.titulo))
    await _apply(session, project, body.model_copy(update={"slug": None}))
    session.add(project)
    await session.commit()
    if project.publicado:
        request_rebuild()
    return _detail(await _get(session, project.id))


@router.get("/projects/{project_id}", response_model=AdminProject)
async def get_project(project_id: uuid.UUID, _: Editor, session: Session) -> AdminProject:
    return _detail(await _get(session, project_id))


@router.patch("/projects/{project_id}", response_model=AdminProject)
async def update_project(
    project_id: uuid.UUID, body: ProjectFields, _: Editor, session: Session
) -> AdminProject:
    project = await _get(session, project_id)
    was_public = project.publicado
    await _apply(session, project, body)
    await session.commit()
    if was_public or project.publicado:
        request_rebuild()
    session.expire_all()
    return _detail(await _get(session, project_id))


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: uuid.UUID, _: Editor, session: Session) -> None:
    project = await _get(session, project_id)
    was_public = project.publicado
    await session.delete(project)
    await session.commit()
    await storage.delete_public_prefix(f"projects/{project_id}/")
    if was_public:
        request_rebuild()


# --- Photos ---


async def _process_photo(image_id: uuid.UUID, data: bytes) -> None:
    """Background task: encode variants, upload them, then store the dimensions."""
    try:
        result = await anyio.to_thread.run_sync(process, data)
    except ImageError:
        log.warning("image %s could not be processed; removing it", image_id)
        async with SessionLocal() as s:
            img = await s.get(ProjectImage, image_id)
            if img:
                await s.delete(img)
                await s.commit()
        return
    async with SessionLocal() as s:
        img = await s.get(ProjectImage, image_id)
        if img is None:  # deleted while processing
            return
        try:
            for v in result.variants:
                await storage.put_public(f"{img.storage_key}-{v.width}.{v.ext}", v.data, v.mime)
        except Exception:
            # Never leave a photo "processing" forever: drop it and whatever was uploaded.
            log.exception("could not store variants of image %s; removing it", image_id)
            await storage.delete_public_prefix(f"{img.storage_key}-")
            await s.delete(img)
            await s.commit()
            return
        img.ancho, img.alto = result.width, result.height
        project = await s.get(Project, img.project_id)
        await s.commit()
        if project and project.publicado:
            request_rebuild()


@router.post("/projects/{project_id}/images", status_code=202, response_model=list[AdminImage])
async def upload_images(
    project_id: uuid.UUID,
    background: BackgroundTasks,
    _: Editor,
    session: Session,
    files: Annotated[list[UploadFile], File()],
) -> list[AdminImage]:
    project = await _get(session, project_id)
    if len(files) > MAX_PHOTOS_PER_UPLOAD:
        raise ApiError(422, message=f"Subí hasta {MAX_PHOTOS_PER_UPLOAD} fotos por vez.")
    payloads: list[tuple[ProjectImage, bytes]] = []
    next_order = max((i.orden for i in project.images), default=-1) + 1
    has_cover = any(i.es_portada for i in project.images)
    for upload in files:
        data = await upload.read(MAX_PHOTO_BYTES + 1)
        name = upload.filename or "foto"
        if len(data) > MAX_PHOTO_BYTES:
            raise ApiError(413, message=f"“{name}” supera los 25 MB.")
        if sniff(data[:16]) not in (JPEG, PNG, WEBP):
            raise ApiError(
                422,
                code="invalid_file_type",
                message=f"“{name}” no es una foto JPG, PNG o WebP.",
            )
        image_id = uuid.uuid4()
        img = ProjectImage(
            id=image_id,
            project_id=project.id,
            storage_key=f"projects/{project.id}/{image_id}",
            orden=next_order,
            es_portada=not has_cover,
            alt_text="",
        )
        has_cover = True
        next_order += 1
        session.add(img)
        payloads.append((img, data))
    await session.commit()
    for img, data in payloads:
        background.add_task(_process_photo, img.id, data)
    return [_admin_image(img) for img, _ in payloads]


async def _get_image(session: AsyncSession, image_id: uuid.UUID) -> ProjectImage:
    img = await session.get(ProjectImage, image_id)
    if img is None:
        raise ApiError(404, message="No encontramos esa foto.")
    return img


async def _rebuild_if_public(session: AsyncSession, project_id: uuid.UUID) -> None:
    project = await session.get(Project, project_id)
    if project and project.publicado:
        request_rebuild()


@router.patch("/images/{image_id}", response_model=AdminImage)
async def update_image(
    image_id: uuid.UUID, body: ImagePatch, _: Editor, session: Session
) -> AdminImage:
    img = await _get_image(session, image_id)
    data: dict[str, Any] = body.model_dump(exclude_unset=True)
    if data.get("es_portada"):
        # Only one cover per project (also enforced by a partial unique index).
        await session.execute(
            update(ProjectImage)
            .where(ProjectImage.project_id == img.project_id, ProjectImage.id != img.id)
            .values(es_portada=False)
        )
    for key, value in data.items():
        if value is not None:
            setattr(img, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await _rebuild_if_public(session, img.project_id)
    return _admin_image(img)


@router.post("/projects/{project_id}/images/order", response_model=list[AdminImage])
async def reorder_images(
    project_id: uuid.UUID, body: ImageOrder, _: Editor, session: Session
) -> list[AdminImage]:
    project = await _get(session, project_id)
    by_id = {i.id: i for i in project.images}
    if set(body.ids) != set(by_id):
        raise ApiError(422, message="La lista tiene que incluir todas las fotos de la obra.")
    for pos, image_id in enumerate(body.ids):
        by_id[image_id].orden = pos
    await session.commit()
    await _rebuild_if_public(session, project_id)
    return [_admin_image(by_id[i]) for i in body.ids]


@router.delete("/images/{image_id}", status_code=204)
async def delete_image(image_id: uuid.UUID, _: Editor, session: Session) -> None:
    img = await _get_image(session, image_id)
    project_id, prefix, was_cover = img.project_id, img.storage_key, img.es_portada
    await session.delete(img)
    await session.flush()
    if was_cover:  # promote the next photo
        nxt = await session.scalar(
            select(ProjectImage)
            .where(ProjectImage.project_id == project_id)
            .order_by(ProjectImage.orden)
        )
        if nxt:
            nxt.es_portada = True
    await session.commit()
    await storage.delete_public_prefix(f"{prefix}-")
    await _rebuild_if_public(session, project_id)
