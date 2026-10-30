"""One-time invite / password reset tokens.

The token itself (secrets.token_urlsafe(32)) is only ever returned to the
caller that e-mails it; the database keeps its SHA-256 hex digest. Never log
a token.
"""
import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utc_now
from app.models.user import User
from app.models.user_token import TokenPurpose, UserToken

_MAX_RAW_LENGTH = 200


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def token_lifetime(purpose: TokenPurpose) -> timedelta:
    if purpose == TokenPurpose.INVITE:
        return timedelta(hours=settings.invite_token_hours)
    return timedelta(minutes=settings.reset_token_minutes)


def invalidate_unused_tokens(db: Session, user_id: str, purpose: TokenPurpose | None = None) -> None:
    """Marks the user's unused tokens (of one purpose, or all) as used."""
    statement = update(UserToken).where(UserToken.user_id == user_id, UserToken.used_at.is_(None))
    if purpose is not None:
        statement = statement.where(UserToken.purpose == purpose.value)
    db.execute(statement.values(used_at=utc_now()).execution_options(synchronize_session=False))


def issue_token(db: Session, user: User, purpose: TokenPurpose, created_by: str | None = None) -> str:
    """Creates a token for the user and invalidates the earlier unused ones of
    the same purpose. Flushes; the caller commits."""
    invalidate_unused_tokens(db, user.id, purpose)
    raw_token = secrets.token_urlsafe(32)
    now = utc_now()
    db.add(UserToken(
        user_id=user.id,
        law_firm_id=user.law_firm_id,
        purpose=purpose.value,
        token_hash=hash_token(raw_token),
        expires_at=now + token_lifetime(purpose),
        created_by=created_by,
        created_at=now,
    ))
    db.flush()
    return raw_token


def find_usable_token(db: Session, raw_token: str) -> tuple[UserToken, User] | None:
    """The token row and its user when the token exists, is unused, is not
    expired and its user is active in a firm that is not suspended; otherwise None (callers answer 410)."""
    if not raw_token or len(raw_token) > _MAX_RAW_LENGTH:
        return None
    token = db.query(UserToken).filter(UserToken.token_hash == hash_token(raw_token)).first()
    if token is None or token.used_at is not None or token.expires_at <= utc_now():
        return None
    user = db.query(User).filter(User.id == token.user_id, User.law_firm_id == token.law_firm_id).first()
    if user is None or not user.is_active or not user.law_firm.is_active:
        return None
    return token, user


def consume_token(db: Session, token: UserToken) -> bool:
    """Marks the token used. False when it was used in the meantime (two
    requests with the same link); the caller then answers 410."""
    result = db.execute(
        update(UserToken)
        .where(UserToken.id == token.id, UserToken.used_at.is_(None))
        .values(used_at=utc_now())
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1
