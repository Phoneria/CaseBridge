"""E-mail notification endpoints: delivery status (no secrets) and a test
e-mail to the signed-in user."""
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.notification import NotificationStatusOut, EmailTestOut
from app.services.email import EmailSendError, send_email
from app.services.notification_content import build_test_email

router = APIRouter(prefix="/notifications", tags=["notifications"])

SEND_FAILED_DETAIL = "E-posta gönderilemedi. SMTP ayarlarını kontrol edin."


@router.get("/status", response_model=NotificationStatusOut)
def notification_status(current_user: User = Depends(get_current_user)):
    return NotificationStatusOut(
        email_backend=settings.email_backend,
        reminders_enabled=settings.reminders_enabled,
        reminder_send_hour=settings.reminder_send_hour,
        timezone=settings.app_timezone,
    )


@router.post("/test-email", response_model=EmailTestOut)
def send_test_email(current_user: User = Depends(get_current_user)):
    try:
        send_email(build_test_email(current_user))
    except EmailSendError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=SEND_FAILED_DETAIL)
    return EmailTestOut(sent=True, backend=settings.email_backend)
