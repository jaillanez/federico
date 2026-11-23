"""Emails sent when a lead arrives: a notification to Federico and a confirmation to the client."""

import logging

from app.config import get_settings
from app.models import Lead
from app.services.mail import Mail, send

log = logging.getLogger(__name__)

GOAL_LABELS = {
    "reducir_costo_fijo": "Reducir costos fijos",
    "eliminar_penalizaciones": "Eliminar penalizaciones por potencia o reactiva",
    "evaluar_solar": "Evaluar si conviene instalar paneles y su repago real",
    "revisar_categoria": "Revisar la categoría tarifaria",
}


def notification(lead: Lead, file_count: int) -> Mail:
    s = get_settings()
    kind = "Diagnóstico Exprés" if lead.origen == "diagnostico" else "Contacto"
    who = lead.empresa or lead.contacto_nombre
    lines = [
        f"Nueva consulta ({kind}) desde la web.",
        "",
        f"Empresa: {lead.empresa or '-'}",
        f"Contacto: {lead.contacto_nombre}" + (f" ({lead.cargo})" if lead.cargo else ""),
        f"Email: {lead.email}",
        f"WhatsApp: {lead.whatsapp or '-'}",
        f"Ubicación: {', '.join(p for p in (lead.localidad, lead.provincia) if p) or '-'}",
    ]
    if lead.objetivos:
        lines += ["", "Objetivos:"] + [f"- {GOAL_LABELS.get(g, g)}" for g in lead.objetivos]
    if lead.mensaje:
        lines += ["", "Mensaje:", lead.mensaje]
    lines += [
        "",
        f"Archivos adjuntos en la consulta: {file_count} (no se envían por email).",
        f"Ver la consulta en el panel: {s.public_site_url.rstrip('/')}/admin#/consultas/{lead.id}",
    ]
    return Mail(
        to=s.mail_leads_to,
        subject=f"Nueva consulta: {who}",
        text="\n".join(lines),
        reply_to=lead.email,
    )


def confirmation(lead: Lead) -> Mail:
    first_name = lead.contacto_nombre.split()[0] if lead.contacto_nombre.strip() else ""
    if lead.origen == "diagnostico":
        body = (
            "Recibimos tu documentación. Federico la va a revisar personalmente y en 24 a 48 horas "
            "hábiles te contactamos por email o WhatsApp con un primer diagnóstico."
        )
        subject = "Recibimos tu documentación"
    else:
        body = "Recibimos tu mensaje. Te respondemos a la brevedad."
        subject = "Recibimos tu consulta"
    text = "\n".join(
        [
            f"Hola {first_name},".replace(" ,", ","),
            "",
            body,
            "",
            "Tu documentación se usa solo para el diagnóstico: no se comercializa ni se transfiere "
            "a terceros ni a distribuidoras.",
            "",
            "Saludos,",
            "Ing. Federico Delgado",
            "S.E.I. Servicio Eléctrico Integral",
        ]
    )
    return Mail(to=lead.email, subject=subject, text=text)


async def send_lead_emails(lead: Lead, file_count: int) -> None:
    """Runs after the response; a mail failure must never lose the lead (it is already saved)."""
    for mail in (notification(lead, file_count), confirmation(lead)):
        try:
            await send(mail)
        except Exception:
            log.exception("could not send email for lead %s", lead.id)
