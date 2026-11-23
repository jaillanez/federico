"""Admin: leads (consultas). Admins only: they contain client documents."""

import csv
import io
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import Admin
from app.db import get_session
from app.errors import ApiError
from app.models import AdminUser, Lead, LeadFile, LeadNote, Project
from app.pagination import PageNum, PerPage, paginate
from app.routers.admin_projects import _query as project_query
from app.routers.admin_projects import _summary
from app.schemas.admin import (
    Dashboard,
    Estado,
    LeadDetail,
    LeadFileOut,
    LeadNoteOut,
    LeadPatch,
    LeadSummary,
    NoteIn,
    Page,
)
from app.services import storage

router = APIRouter(prefix="/admin")
Session = Annotated[AsyncSession, Depends(get_session)]
TZ_OFFSET = timedelta(hours=-3)  # Argentina (no DST)


def _query() -> Select[tuple[Lead]]:
    return select(Lead).options(selectinload(Lead.files))


def _filtered(
    estado: Estado | None,
    provincia: str | None,
    desde: date | None,
    hasta: date | None,
    q: str | None,
) -> Select[tuple[Lead]]:
    stmt = _query()
    if estado:
        stmt = stmt.where(Lead.estado == estado)
    if provincia:
        stmt = stmt.where(Lead.provincia == provincia)
    if desde:
        stmt = stmt.where(Lead.created_at >= datetime.combine(desde, time(), UTC) - TZ_OFFSET)
    if hasta:
        end = datetime.combine(hasta + timedelta(days=1), time(), UTC) - TZ_OFFSET
        stmt = stmt.where(Lead.created_at < end)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Lead.empresa.ilike(like),
                Lead.contacto_nombre.ilike(like),
                Lead.email.ilike(like),
                Lead.localidad.ilike(like),
            )
        )
    return stmt.order_by(Lead.created_at.desc())


def _summary_out(lead: Lead) -> LeadSummary:
    return LeadSummary(
        id=lead.id,
        created_at=lead.created_at,
        empresa=lead.empresa,
        contacto_nombre=lead.contacto_nombre,
        email=lead.email,
        whatsapp=lead.whatsapp,
        provincia=lead.provincia,
        origen=lead.origen,
        estado=lead.estado,
        objetivos=lead.objetivos,
        cantidad_archivos=len(lead.files),
    )


Filters = Annotated[str | None, Query(max_length=100)]


@router.get("/leads", response_model=Page[LeadSummary])
async def list_leads(
    _: Admin,
    session: Session,
    estado: Estado | None = None,
    provincia: Filters = None,
    desde: date | None = None,
    hasta: date | None = None,
    q: Filters = None,
    page: PageNum = 1,
    per_page: PerPage = 20,
) -> Page[LeadSummary]:
    rows, total = await paginate(
        session, _filtered(estado, provincia, desde, hasta, q), page, per_page
    )
    return Page(items=[_summary_out(x) for x in rows], total=total, page=page, per_page=per_page)


def _csv_safe(value: object) -> str:
    """Neutralize spreadsheet formulas (CSV injection)."""
    text = "" if value is None else str(value)
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/leads.csv")
async def export_leads(
    _: Admin,
    session: Session,
    estado: Estado | None = None,
    provincia: Filters = None,
    desde: date | None = None,
    hasta: date | None = None,
    q: Filters = None,
) -> Response:
    rows = (await session.scalars(_filtered(estado, provincia, desde, hasta, q))).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["fecha", "estado", "origen", "empresa", "contacto", "cargo", "email", "whatsapp",
         "provincia", "localidad", "objetivos", "mensaje", "archivos",
         "utm_source", "utm_medium", "utm_campaign"]
    )  # fmt: skip
    for x in rows:
        local = (x.created_at + TZ_OFFSET).strftime("%Y-%m-%d %H:%M")
        writer.writerow(
            [_csv_safe(v) for v in (
                local, x.estado, x.origen, x.empresa, x.contacto_nombre, x.cargo, x.email,
                x.whatsapp, x.provincia, x.localidad, " | ".join(x.objetivos), x.mensaje,
                len(x.files), x.utm_source, x.utm_medium, x.utm_campaign,
            )]
        )  # fmt: skip
    filename = f"consultas-{datetime.now(UTC).date().isoformat()}.csv"
    # BOM so Excel opens accents correctly.
    return Response(
        "﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _get(session: AsyncSession, lead_id: uuid.UUID) -> Lead:
    lead = await session.scalar(
        _query().options(selectinload(Lead.notes)).where(Lead.id == lead_id)
    )
    if lead is None:
        raise ApiError(404, message="No encontramos esa consulta.")
    return lead


async def _detail(session: AsyncSession, lead: Lead) -> LeadDetail:
    author_ids = {n.autor_id for n in lead.notes if n.autor_id}
    names = {
        u.id: u.nombre
        for u in await session.scalars(select(AdminUser).where(AdminUser.id.in_(author_ids)))
    }
    return LeadDetail(
        **_summary_out(lead).model_dump(),
        cargo=lead.cargo,
        localidad=lead.localidad,
        mensaje=lead.mensaje,
        utm_source=lead.utm_source,
        utm_medium=lead.utm_medium,
        utm_campaign=lead.utm_campaign,
        consentimiento_at=lead.consentimiento_at,
        archivos=[
            LeadFileOut(
                id=f.id, tipo=f.tipo, nombre_original=f.nombre_original, mime=f.mime, bytes=f.bytes
            )
            for f in lead.files
        ],
        notas=[
            LeadNoteOut(
                id=n.id,
                created_at=n.created_at,
                autor=names.get(n.autor_id) if n.autor_id else None,
                texto=n.texto,
                estado_anterior=n.estado_anterior,
                estado_nuevo=n.estado_nuevo,
            )
            for n in sorted(lead.notes, key=lambda n: n.created_at, reverse=True)
        ],
    )


@router.get("/leads/{lead_id}", response_model=LeadDetail)
async def get_lead(lead_id: uuid.UUID, _: Admin, session: Session) -> LeadDetail:
    return await _detail(session, await _get(session, lead_id))


@router.patch("/leads/{lead_id}", response_model=LeadDetail)
async def update_lead(
    lead_id: uuid.UUID, body: LeadPatch, user: Admin, session: Session
) -> LeadDetail:
    lead = await _get(session, lead_id)
    if body.estado != lead.estado or body.nota:
        # Every status change leaves a trace in the history.
        session.add(
            LeadNote(
                lead_id=lead.id,
                autor_id=user.id,
                texto=(body.nota or "").strip() or None,
                estado_anterior=lead.estado if body.estado != lead.estado else None,
                estado_nuevo=body.estado if body.estado != lead.estado else None,
            )
        )
        lead.estado = body.estado
        await session.commit()
        session.expire_all()
    return await _detail(session, await _get(session, lead_id))


@router.post("/leads/{lead_id}/notes", status_code=201, response_model=LeadDetail)
async def add_note(lead_id: uuid.UUID, body: NoteIn, user: Admin, session: Session) -> LeadDetail:
    lead = await _get(session, lead_id)
    session.add(LeadNote(lead_id=lead.id, autor_id=user.id, texto=body.texto.strip()))
    await session.commit()
    session.expire_all()
    return await _detail(session, await _get(session, lead_id))


@router.get("/leads/{lead_id}/files/{file_id}")
async def download_file(
    lead_id: uuid.UUID, file_id: uuid.UUID, _: Admin, session: Session
) -> RedirectResponse:
    f = await session.scalar(
        select(LeadFile).where(LeadFile.id == file_id, LeadFile.lead_id == lead_id)
    )
    if f is None:
        raise ApiError(404, message="No encontramos ese archivo.")
    url = storage.signed_private_url(f.storage_key, f.nombre_original)
    return RedirectResponse(url, status_code=307, headers={"Cache-Control": "no-store"})


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(_: Admin, session: Session) -> Dashboard:
    week_ago = datetime.now(UTC) - timedelta(days=7)
    nuevas = await session.scalar(select(func.count()).where(Lead.estado == "nuevo"))
    semana = await session.scalar(select(func.count()).where(Lead.created_at >= week_ago))
    province = func.coalesce(Lead.provincia, "Sin provincia")
    por_provincia = await session.execute(
        select(province, func.count())
        .where(Lead.created_at >= week_ago)
        .group_by(province)
        .order_by(func.count().desc())
    )
    obras = await session.scalars(project_query().order_by(Project.updated_at.desc()).limit(5))
    return Dashboard(
        consultas_nuevas=nuevas or 0,
        consultas_semana=semana or 0,
        semana_por_provincia={str(p): int(n) for p, n in por_provincia.all()},
        ultimas_obras=[_summary(p) for p in obras],
    )
