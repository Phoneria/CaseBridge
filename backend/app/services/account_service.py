"""Account-level operations shared by the auth and admin routes: choosing a
password and e-mailing one-time links."""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.user import User
from app.models.user_token import TokenPurpose
from app.services.email import EmailMessage, EmailSendError, send_email
from app.services.notification_content import build_invite_email, build_reset_email
from app.services.user_token_service import invalidate_unused_tokens, issue_token

logger = logging.getLogger("casebridge")


def next_password_set_at(previous: datetime | None) -> datetime:
    """Now in whole seconds, but always later than the previous value, so two
    password changes within the same second still end the older sessions."""
    now = utc_now().replace(microsecond=0)
    if previous is not None and now <= previous.replace(microsecond=0):
        return previous.replace(microsecond=0) + timedelta(seconds=1)
    return now


def apply_new_password(db: Session, user: User, new_password: str) -> None:
    """Stores the new password, moves password_set_at (which ends every older
    session) and invalidates the user's unused links. The caller commits."""
    user.hashed_password = hash_password(new_password)
    user.password_set_at = next_password_set_at(user.password_set_at)
    invalidate_unused_tokens(db, user.id)


def deliver(message: EmailMessage) -> bool:
    """Sends the message; False (never an exception) when sending fails. The
    log line carries the error type only - no address, link or token."""
    try:
        send_email(message)
    except EmailSendError as exc:
        logger.warning("Hesap e-postası gönderilemedi: %s", exc)
        return False
    except Exception as exc:
        logger.warning("Hesap e-postası gönderilemedi: %s", type(exc).__name__)
        return False
    return True


def prepare_reset_email(db: Session, user: User, created_by: str | None) -> EmailMessage:
    """Issues a reset token (committed) and returns the e-mail to send."""
    token = issue_token(db, user, TokenPurpose.RESET, created_by=created_by)
    db.commit()
    return build_reset_email(user=user, token=token)


def prepare_invite_email(db: Session, user: User, inviter: User | None) -> EmailMessage:
    """Issues an invite token, stamps invited_at (both committed) and returns
    the e-mail to send."""
    token = issue_token(db, user, TokenPurpose.INVITE, created_by=inviter.id if inviter else None)
    user.invited_at = utc_now()
    firm_name = user.law_firm.name
    db.commit()
    return build_invite_email(
        user=user,
        firm_name=" ".join(firm_name.split()),
        inviter_name=inviter.full_name if inviter else None,
        token=token,
    )
