"""Outgoing e-mail.

EMAIL_BACKEND=console only logs the recipient and subject (never the
body); EMAIL_BACKEND=smtp sends with the stdlib smtplib (STARTTLS when
SMTP_USE_TLS, login when SMTP_USERNAME is set). SMTP_PASSWORD is never
logged. Failures raise EmailSendError whose message is only the
exception type name, so it is safe to store and log.
"""
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("casebridge")


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: Optional[str] = None


class EmailSendError(Exception):
    """Sending failed. str(exc) is a short, content-free error code."""


def _build_mime(message: EmailMessage) -> MimeMessage:
    mime = MimeMessage()
    mime["From"] = settings.smtp_from
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime.set_content(message.text)
    if message.html:
        mime.add_alternative(message.html, subtype="html")
    return mime


def send_email(message: EmailMessage) -> None:
    if settings.email_backend == "console":
        logger.info("E-posta (console): alıcı=%r konu=%r", message.to, message.subject)
        return
    if not settings.smtp_host:
        raise EmailSendError("SMTPHostMissing")

    try:
        mime = _build_mime(message)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(mime)
    except ValueError as exc:
        logger.warning("E-posta gönderilemedi: InvalidHeader")
        raise EmailSendError("InvalidHeader") from exc
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("E-posta gönderilemedi: %s", type(exc).__name__)
        raise EmailSendError(type(exc).__name__) from exc
