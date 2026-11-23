"""POST /api/leads: Diagnóstico Exprés and contact form.

Order of checks: honeypot → captcha → rate limit → fields → files. Files are validated by their
content (magic bytes), stored in the PRIVATE bucket and never logged; logs only carry the lead id.
"""

import hashlib
import hmac
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import Lead, LeadFile
from app.models.lead import LEAD_GOALS
from app.services import storage
from app.services.captcha import verify_turnstile
from app.services.filetypes import HEADER_SIZE, sniff
from app.services.lead_mail import send_lead_emails
from app.services.phone import normalize_ar_phone

log = logging.getLogger(__name__)
router = APIRouter()

MB = 1024 * 1024
MAX_FILE_BYTES = 15 * MB
MAX_TOTAL_BYTES = 40 * MB
MAX_FILES = 3
READ_CHUNK = 1 * MB


class LeadCreated(BaseModel):
    id: uuid.UUID
    message: str


@dataclass
class IncomingFile:
    tipo: Literal["factura", "presupuesto_solar"]
    name: str
    data: bytes
    mime: str
    ext: str


type CaptchaVerifier = Callable[[str | None, str | None], Awaitable[bool]]


def get_captcha_verifier() -> CaptchaVerifier:
    """Dependency so tests can replace the Turnstile call."""
    return verify_turnstile


def client_ip(request: Request) -> str:
    # Behind Caddy, uvicorn --proxy-headers already resolves X-Forwarded-For into client.host.
    return request.client.host if request.client else "unknown"


def hash_ip(ip: str) -> str:
    key = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(key, ip.encode(), hashlib.sha256).hexdigest()


def _clean(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value[:max_len] or None


async def _read_limited(upload: UploadFile) -> bytes:
    """Read at most MAX_FILE_BYTES + 1 so huge uploads are rejected without loading them."""
    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(READ_CHUNK):
        chunks.append(chunk)
        size += len(chunk)
        if size > MAX_FILE_BYTES:
            break
    return b"".join(chunks)


async def _validate_files(
    factura: list[UploadFile], presupuesto: list[UploadFile]
) -> list[IncomingFile]:
    uploads: list[tuple[Literal["factura", "presupuesto_solar"], UploadFile]] = [
        *(("factura", f) for f in factura if f.filename),
        *(("presupuesto_solar", f) for f in presupuesto if f.filename),
    ]
    if len(uploads) > MAX_FILES:
        raise ApiError(
            422,
            message=f"Podés adjuntar hasta {MAX_FILES} archivos.",
            fields={"archivos": f"Máximo {MAX_FILES} archivos."},
        )
    files: list[IncomingFile] = []
    total = 0
    for tipo, upload in uploads:
        name = (upload.filename or "archivo")[-200:]
        data = await _read_limited(upload)
        if len(data) > MAX_FILE_BYTES:
            raise ApiError(
                413,
                message=f"“{name}” supera los 15 MB. Probá con una foto más liviana o un PDF.",
                fields={tipo: "El archivo supera los 15 MB."},
            )
        kind = sniff(data[:HEADER_SIZE])
        if kind is None:
            raise ApiError(
                422,
                code="invalid_file_type",
                message=f"“{name}” no es un PDF ni una imagen válida (JPG, PNG, WebP o HEIC).",
                fields={tipo: "Solo se aceptan PDF, JPG, PNG, WebP o HEIC."},
            )
        total += len(data)
        if total > MAX_TOTAL_BYTES:
            raise ApiError(
                413,
                message="Entre todos los archivos superan los 40 MB.",
                fields={"archivos": "El total supera los 40 MB."},
            )
        files.append(IncomingFile(tipo, name, data, kind.mime, kind.ext))
    return files


@router.post("/leads", status_code=201, response_model=LeadCreated)
async def create_lead(
    request: Request,
    background: BackgroundTasks,
    session: Annotated[AsyncSession, Depends(get_session)],
    verify_captcha: Annotated[CaptchaVerifier, Depends(get_captcha_verifier)],
    contacto_nombre: Annotated[str, Form(max_length=160)] = "",
    email: Annotated[str, Form(max_length=254)] = "",
    origen: Annotated[Literal["diagnostico", "contacto"], Form()] = "diagnostico",
    empresa: Annotated[str | None, Form(max_length=200)] = None,
    cargo: Annotated[str | None, Form(max_length=120)] = None,
    whatsapp: Annotated[str | None, Form(max_length=40)] = None,
    provincia: Annotated[str | None, Form(max_length=60)] = None,
    localidad: Annotated[str | None, Form(max_length=120)] = None,
    objetivos: Annotated[list[str] | None, Form()] = None,
    mensaje: Annotated[str | None, Form(max_length=4000)] = None,
    consentimiento: Annotated[bool, Form()] = False,
    utm_source: Annotated[str | None, Form()] = None,
    utm_medium: Annotated[str | None, Form()] = None,
    utm_campaign: Annotated[str | None, Form()] = None,
    captcha_token: Annotated[str | None, Form(alias="cf-turnstile-response")] = None,
    # Honeypot: invisible to people; bots tend to fill every field.
    sitio_web: Annotated[str | None, Form()] = None,
    factura: Annotated[list[UploadFile] | None, File()] = None,
    presupuesto_solar: Annotated[list[UploadFile] | None, File()] = None,
) -> LeadCreated:
    ok_message = "¡Recibimos tu documentación!"
    if sitio_web:
        # Pretend success so bots learn nothing; store nothing.
        return LeadCreated(id=uuid.uuid4(), message=ok_message)

    ip = client_ip(request)
    if not await verify_captcha(captcha_token, ip):
        raise ApiError(
            400,
            code="captcha_invalid",
            message="No pudimos verificar que seas una persona. Recargá la página y reintentá.",
        )

    settings = get_settings()
    ip_hash = hash_ip(ip)
    since = datetime.now(UTC) - timedelta(hours=1)
    recent = await session.scalar(
        select(func.count()).where(Lead.ip_hash == ip_hash, Lead.created_at >= since)
    )
    if (recent or 0) >= settings.leads_per_ip_per_hour:
        raise ApiError(429)

    # --- fields ---
    errors: dict[str, str] = {}
    nombre = _clean(contacto_nombre, 160)
    if not nombre:
        errors["contacto_nombre"] = "Ingresá tu nombre."
    try:
        email_norm = validate_email(email.strip(), check_deliverability=False).normalized
    except EmailNotValidError:
        email_norm = ""
        errors["email"] = "Ingresá un email válido."
    phone = None
    if whatsapp and whatsapp.strip():
        phone = normalize_ar_phone(whatsapp)
        if phone is None:
            errors["whatsapp"] = "Ingresá un celular argentino con código de área."
    goals = [g for g in (objetivos or []) if g]
    if any(g not in LEAD_GOALS for g in goals):
        errors["objetivos"] = "Objetivo no válido."
    if not consentimiento:
        errors["consentimiento"] = "Tenés que aceptar la garantía de confidencialidad."
    if origen == "diagnostico":
        if not phone and "whatsapp" not in errors:
            errors["whatsapp"] = "Ingresá tu WhatsApp para que podamos contactarte."
        if not _clean(provincia, 60):
            errors["provincia"] = "Elegí tu provincia."
        if not goals:
            errors["objetivos"] = "Elegí al menos un objetivo."
    elif not _clean(mensaje, 4000):
        errors["mensaje"] = "Escribí tu consulta."
    if errors:
        raise ApiError(422, message="Revisá los datos marcados.", fields=errors)

    files = await _validate_files(factura or [], presupuesto_solar or [])
    if origen == "diagnostico" and not any(f.tipo == "factura" for f in files):
        raise ApiError(
            422,
            message="Adjuntá tu factura de energía eléctrica.",
            fields={"factura": "Adjuntá la última factura completa."},
        )

    # --- persist: upload to the private bucket first, then commit; clean up on failure ---
    lead = Lead(
        id=uuid.uuid4(),
        empresa=_clean(empresa, 200),
        contacto_nombre=nombre,
        cargo=_clean(cargo, 120),
        email=email_norm,
        whatsapp=phone,
        provincia=_clean(provincia, 60),
        localidad=_clean(localidad, 120),
        objetivos=goals,
        mensaje=_clean(mensaje, 4000),
        origen=origen,
        utm_source=_clean(utm_source, 100),
        utm_medium=_clean(utm_medium, 100),
        utm_campaign=_clean(utm_campaign, 100),
        consentimiento_at=datetime.now(UTC),
        ip_hash=ip_hash,
    )
    uploaded: list[str] = []
    try:
        for f in files:
            key = f"leads/{lead.id}/{uuid.uuid4()}.{f.ext}"
            await storage.put_private(key, f.data, f.mime)
            uploaded.append(key)
            lead.files.append(
                LeadFile(
                    tipo=f.tipo,
                    storage_key=key,
                    nombre_original=f.name,
                    mime=f.mime,
                    bytes=len(f.data),
                    sha256=hashlib.sha256(f.data).hexdigest(),
                )
            )
        session.add(lead)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        await storage.delete_private(uploaded)
        log.exception("could not save lead %s", lead.id)
        raise ApiError(
            503,
            code="storage_unavailable",
            message="No pudimos guardar tu documentación en este momento. "
            "Probá de nuevo en unos minutos o enviala por WhatsApp.",
        ) from exc

    log.info("lead created id=%s origen=%s files=%d", lead.id, origen, len(files))
    background.add_task(send_lead_emails, lead, len(files))
    message = ok_message if origen == "diagnostico" else "¡Recibimos tu mensaje!"
    return LeadCreated(id=lead.id, message=message)
