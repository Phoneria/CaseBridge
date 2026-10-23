"""Turkish e-mail content for notifications (test e-mail, reminders)."""
from __future__ import annotations

from datetime import date, timedelta
from html import escape
from typing import TYPE_CHECKING

from app.core.config import settings
from app.models.user import User
from app.services.email import EmailMessage

if TYPE_CHECKING:
    from app.services.reminder_service import DueReminder

FOOTER = "Bu e-posta CaseBridge tarafından otomatik gönderildi."
TEST_EMAIL_SUBJECT = "CaseBridge test e-postası"


def build_test_email(user: User) -> EmailMessage:
    text = (
        f"Merhaba {user.full_name},\n\n"
        "Bu bir CaseBridge test e-postasıdır. Bu mesajı aldıysanız e-posta hatırlatmaları çalışıyor.\n\n"
        f"{FOOTER}\n"
    )
    html = (
        f"<p>Merhaba {escape(user.full_name)},</p>"
        "<p>Bu bir CaseBridge test e-postasıdır. Bu mesajı aldıysanız e-posta hatırlatmaları çalışıyor.</p>"
        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(to=user.email, subject=TEST_EMAIL_SUBJECT, text=text, html=html)


def day_phrase(days_until: int) -> str:
    if days_until <= 0:
        return "bugün"
    if days_until == 1:
        return "yarın"
    return f"{days_until} gün sonra"


def build_reminder_email(due: DueReminder, today: date) -> EmailMessage:
    """The day phrase uses the real distance to the occurrence (a catch-up
    reminder sent the day before says "yarın")."""
    subject = f"Hatırlatma: {day_phrase((due.occurrence_date - today).days)} {due.type_label} – {due.title}"
    base_url = settings.app_base_url.rstrip("/")

    details = [("Tür", due.type_label), ("Başlık", due.title), ("Tarih", due.occurrence_date.strftime("%d.%m.%Y"))]
    if due.starts_at is not None:
        details.append(("Saat", due.starts_at.strftime("%H:%M")))
    if due.location:
        details.append(("Konum", due.location))
    if due.case_name:
        details.append(("Dava", due.case_name))

    links = []
    if due.case_id:
        links.append(("Davayı aç", f"{base_url}/davalar/{due.case_id}"))
    links.append(("Takvimde gör", f"{base_url}/takvim?ay={due.occurrence_date:%Y-%m}"))

    text = "\n".join(
        [f"{label}: {value}" for label, value in details]
        + [""]
        + [f"{label}: {url}" for label, url in links]
        + ["", FOOTER]
    ) + "\n"
    html = (
        "<table>"
        + "".join(
            f'<tr><td style="color:#6b7280;padding-right:12px">{escape(label)}</td><td>{escape(value)}</td></tr>'
            for label, value in details
        )
        + "</table><p>"
        + " · ".join(f'<a href="{escape(url)}">{escape(label)}</a>' for label, url in links)
        + f'</p><p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(to=due.recipient_email, subject=subject, text=text, html=html)


def password_link(token: str) -> str:
    return f"{settings.frontend_base_url.rstrip('/')}/sifre-belirle?token={token}"


def validity_phrase(lifetime: timedelta) -> str:
    minutes = int(lifetime.total_seconds() // 60)
    if minutes % 60 == 0:
        return f"{minutes // 60} saat"
    return f"{minutes} dakika"


def build_invite_email(*, user: User, firm_name: str, inviter_name: str | None, token: str) -> EmailMessage:
    link = password_link(token)
    validity = validity_phrase(timedelta(hours=settings.invite_token_hours))
    if inviter_name:
        intro = f"{inviter_name} sizi {firm_name} bürosunun CaseBridge çalışma alanına davet etti."
    else:
        intro = f"{firm_name} bürosunun CaseBridge çalışma alanına davet edildiniz."
    expiry = f"Bu bağlantı {validity} geçerlidir ve yalnızca bir kez kullanılabilir."
    text = (
        f"Merhaba {user.full_name},\n\n{intro}\n\n"
        f"Şifrenizi belirleyin: {link}\n\n{expiry}\n\n{FOOTER}\n"
    )
    html = (
        f"<p>Merhaba {escape(user.full_name)},</p><p>{escape(intro)}</p>"
        f'<p><a href="{escape(link)}">Şifrenizi belirleyin</a></p><p>{escape(expiry)}</p>'
        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(
        to=user.email,
        subject=f"CaseBridge davetiniz — {firm_name}",
        text=text,
        html=html,
        show_body_in_dev_console=True,
    )


def build_reset_email(*, user: User, token: str) -> EmailMessage:
    link = password_link(token)
    validity = validity_phrase(timedelta(minutes=settings.reset_token_minutes))
    expiry = f"Bu bağlantı {validity} geçerlidir ve yalnızca bir kez kullanılabilir."
    ignore = "Bu isteği siz yapmadıysanız dikkate almayın."
    text = (
        f"Merhaba {user.full_name},\n\nCaseBridge şifrenizi sıfırlamak için bağlantıyı kullanın.\n\n"
        f"Şifrenizi belirleyin: {link}\n\n{expiry}\n{ignore}\n\n{FOOTER}\n"
    )
    html = (
        f"<p>Merhaba {escape(user.full_name)},</p>"
        "<p>CaseBridge şifrenizi sıfırlamak için bağlantıyı kullanın.</p>"
        f'<p><a href="{escape(link)}">Şifrenizi belirleyin</a></p><p>{escape(expiry)}<br>{escape(ignore)}</p>'
        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
    )
    return EmailMessage(
        to=user.email,
        subject="CaseBridge şifre sıfırlama",
        text=text,
        html=html,
        show_body_in_dev_console=True,
    )
