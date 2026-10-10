"""Administration of a firm's users. Every lookup is scoped to the admin's
firm: a user of another firm does not exist (404)."""
import secrets

from sqlalchemy import null
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.admin_user import AdminUserCreate, AdminUserUpdate
from app.services.user_token_service import invalidate_unused_tokens

EMAIL_TAKEN = "Bu e-posta adresi zaten kayıtlı."
OWN_ROLE = "Kendi rolünüzü değiştiremezsiniz."
LAST_ADMIN = "Büroda en az bir aktif yönetici kalmalı."
USER_NOT_FOUND = "Kullanıcı bulunamadı"


class UserAdminError(Exception):
    """A rule violation with the HTTP status and the Turkish message to return."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def get_user_in_firm(db: Session, law_firm_id: str, user_id: str) -> User:
    user = UserRepository(db).get_by_id_in_firm(user_id, law_firm_id)
    if user is None:
        raise UserAdminError(404, USER_NOT_FOUND)
    return user


def list_firm_users(db: Session, law_firm_id: str) -> list[User]:
    return db.query(User).filter(User.law_firm_id == law_firm_id).order_by(User.full_name, User.email).all()


def count_other_active_admins(db: Session, law_firm_id: str, excluding_user_id: str) -> int:
    """Admins who can act: active and past the invitation (password set)."""
    return db.query(User).filter(
        User.law_firm_id == law_firm_id,
        User.role == UserRole.ADMIN,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
        User.id != excluding_user_id,
    ).count()


def ensure_not_last_admin(db: Session, user: User) -> None:
    """Raises when `user` is an active admin and nobody else could act as one."""
    if user.role == UserRole.ADMIN and count_other_active_admins(db, user.law_firm_id, user.id) == 0:
        raise UserAdminError(409, LAST_ADMIN)


def _email_in_use(db: Session, email: str, except_user_id: str | None = None) -> bool:
    existing = UserRepository(db).get_by_email(email)
    return existing is not None and existing.id != except_user_id


def create_pending_user(db: Session, law_firm_id: str, data: AdminUserCreate) -> User:
    """A user who has to choose a password through the invite link. The stored
    hash is random and never revealed; login is refused while password_set_at
    is NULL anyway. Flushes; the caller commits."""
    email = str(data.email).lower()
    if _email_in_use(db, email):
        raise UserAdminError(409, EMAIL_TAKEN)
    user = User(
        law_firm_id=law_firm_id,
        email=email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        full_name=data.full_name,
        department=data.department,
        role=data.role,
        is_active=True,
        password_set_at=null(),
    )
    db.add(user)
    db.flush()
    return user


def update_user(db: Session, admin: User, user: User, data: AdminUserUpdate) -> User:
    fields = data.model_fields_set
    if "role" in fields and data.role != user.role:
        if user.id == admin.id:
            raise UserAdminError(409, OWN_ROLE)
        if user.role == UserRole.ADMIN:
            ensure_not_last_admin(db, user)
    if "email" in fields:
        email = str(data.email).lower()
        if email != user.email.lower():
            if _email_in_use(db, email, except_user_id=user.id):
                raise UserAdminError(409, EMAIL_TAKEN)
            user.email = email
            # Links already e-mailed went to the old address.
            invalidate_unused_tokens(db, user.id)
    if "full_name" in fields:
        user.full_name = data.full_name
    if "department" in fields:
        user.department = data.department
    if "role" in fields:
        user.role = data.role
    db.flush()
    return user
