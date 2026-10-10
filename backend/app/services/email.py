"""Outgoing e-mail.

EMAIL_BACKEND=console only logs the recipient and subject (never the
body, except for messages that set show_body_in_dev_console - the invite
and password reset e-mails, whose link a developer needs); EMAIL_BACKEND=smtp
sends with the stdlib smtplib (STARTTLS when SMTP_USE_TLS, login when
SMTP_USERNAME is set); EMAIL_BACKEND=file writes each message as its own .eml
file into EMAIL_FILE_DIR (E2E tests read their links from there).
SMTP_PASSWORD is never logged. Failures raise EmailSendError whose message is
only the exception type name, so it is safe to store and log.
"""
import logging
import os
import smtplib
import ssl
import time
import uuid
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("casebridge")


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: Optional[str] = None
    #: Console backend only: also log the body (invite / reset e-mails).
    show_body_in_dev_console: bool = False


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


def _write_eml(message: EmailMessage) -> None:
    logger.info("E-posta (file): alıcı=%r konu=%r", message.to, message.subject)
    try:
        mime = _build_mime(message)
        directory = Path(settings.email_file_dir)
        # Each file holds a live invite / reset link: owner-only access, and
        # O_EXCL so a pre-planted file or symlink is never followed.
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        # Nanosecond timestamp first so the newest message sorts last.
        path = directory / f"{time.time_ns():020d}-{uuid.uuid4().hex[:8]}.eml"
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(bytes(mime))
    except ValueError as exc:
        logger.warning("E-posta gönderilemedi: InvalidHeader")
        raise EmailSendError("InvalidHeader") from exc
    except OSError as exc:
        logger.warning("E-posta gönderilemedi: %s", type(exc).__name__)
        raise EmailSendError(type(exc).__name__) from exc


def send_email(message: EmailMessage) -> None:
    if settings.email_backend == "console":
        logger.info("E-posta (console): alıcı=%r konu=%r", message.to, message.subject)
        if message.show_body_in_dev_console:
            logger.info("E-posta içeriği (yalnızca konsol modu):\n%s", message.text)
        return
    if settings.email_backend == "file":
        _write_eml(message)
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
