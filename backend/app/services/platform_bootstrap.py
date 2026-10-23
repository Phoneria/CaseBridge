"""Creates the CaseBridge team's platform administrators listed in
PLATFORM_ADMIN_EMAILS when the application starts.

Safe on every start: an address that already has an account gets no new
e-mail while its invite link is still usable; an expired invite (or one whose
e-mail could not be sent) is sent again. An address registered in a customer
firm is never touched. Nothing here may stop the application from starting.
"""
import logging

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utc_now
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.user_token import TokenPurpose, UserToken
from app.repositories.user_repository import UserRepository
from app.schemas.admin_user import AdminUserCreate
from app.services.account_service import deliver, prepare_invite_email
from app.services.platform_service import get_or_create_platform_firm
from app.services.user_admin_service import create_pending_user
from app.services.user_token_service import invalidate_unused_tokens

logger = logging.getLogger("casebridge")

PLATFORM_ADMIN_NAME = "Platform Yöneticisi"
_EMAIL = TypeAdapter(EmailStr)


def parse_platform_admin_emails(raw: str) -> list[str]:
    """Lower-cased, trimmed, without duplicates; invalid entries are logged
    (without the address) and skipped."""
    emails: list[str] = []
    for part in raw.split(","):
        email = part.strip().lower()
        if not email or email in emails:
            continue
        try:
            _EMAIL.validate_python(email)
        except ValidationError:
            logger.warning("PLATFORM_ADMIN_EMAILS içinde geçersiz bir adres atlandı.")
            continue
        emails.append(email)
    return emails


def _has_usable_invite(db: Session, user: User) -> bool:
    return db.query(UserToken).filter(
        UserToken.user_id == user.id,
        UserToken.purpose == TokenPurpose.INVITE.value,
        UserToken.used_at.is_(None),
        UserToken.expires_at > utc_now(),
    ).first() is not None


def ensure_platform_admins(db: Session, emails: list[str]) -> None:
    if not emails:
        return
    firm = get_or_create_platform_firm(db)
    users = UserRepository(db)
    to_invite: list[User] = []
    for email in emails:
        user = users.get_by_email(email)
        if user is None:
            user = create_pending_user(
                db, firm.id, AdminUserCreate(email=email, full_name=PLATFORM_ADMIN_NAME, role=UserRole.ADMIN)
            )
            user.is_platform_admin = True
            to_invite.append(user)
            continue
        if user.law_firm_id != firm.id:
            logger.warning("PLATFORM_ADMIN_EMAILS: bir adres müşteri bürosunda kayıtlı olduğu için atlandı.")
            continue
        user.is_platform_admin = True
        if user.is_active and user.password_set_at is None and not _has_usable_invite(db, user):
            to_invite.append(user)
    db.commit()

    for user in to_invite:
        if deliver(prepare_invite_email(db, user, inviter=None)):
            continue
        # Without a usable invite the next start sends a new one.
        invalidate_unused_tokens(db, user.id, TokenPurpose.INVITE)
        db.commit()
        logger.error("Platform yöneticisi davet e-postası gönderilemedi; bir sonraki açılışta yeniden denenecek.")


def run_platform_bootstrap() -> None:
    """Startup hook: a failure is logged and the application still starts."""
    emails = parse_platform_admin_emails(settings.platform_admin_emails)
    if not emails:
        return
    db = SessionLocal()
    try:
        ensure_platform_admins(db, emails)
    except Exception as exc:
        db.rollback()
        logger.error("Platform yöneticileri oluşturulamadı: %s", type(exc).__name__)
    finally:
        db.close()
