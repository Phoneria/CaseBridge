"""Turkish e-mail content for notifications (test e-mail, reminders)."""
from html import escape

from app.models.user import User
from app.services.email import EmailMessage

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
