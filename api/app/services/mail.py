"""Outgoing email. Never attaches lead files: notifications only link to the admin panel."""

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

import anyio

from app.config import get_settings

log = logging.getLogger(__name__)


@dataclass
class Mail:
    to: str
    subject: str
    text: str
    reply_to: str | None = None


# Used by MAIL_BACKEND=memory (tests).
outbox: list[Mail] = []


def _send_smtp(mail: Mail) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.mail_from
    msg["To"] = mail.to
    msg["Subject"] = mail.subject
    if mail.reply_to:
        msg["Reply-To"] = mail.reply_to
    msg.set_content(mail.text)
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user and s.smtp_password:
            smtp.login(s.smtp_user, s.smtp_password.get_secret_value())
        smtp.send_message(msg)


async def send(mail: Mail) -> None:
    backend = get_settings().mail_backend
    if backend == "memory":
        outbox.append(mail)
    elif backend == "console":
        log.info("mail (console backend) subject=%r", mail.subject)
    else:
        await anyio.to_thread.run_sync(_send_smtp, mail)
