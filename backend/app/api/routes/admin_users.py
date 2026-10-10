"""Firm-scoped user administration (admins only)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User, UserStatus
from app.schemas.admin_user import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    AdminUserWithEmailOut,
    EmailSentOut,
)
from app.services.account_service import deliver, prepare_invite_email, prepare_reset_email
from app.services.user_admin_service import (
    UserAdminError,
    create_pending_user,
    get_user_in_firm,
    list_firm_users,
    update_user,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])

ALREADY_SET = "Kullanıcı şifresini zaten belirlemiş."
INACTIVE_INVITE = "Pasif kullanıcıya davet gönderilemez. Önce kullanıcıyı aktifleştirin."
RESET_NOT_POSSIBLE = "Şifre sıfırlama bağlantısı yalnızca aktif ve şifresini belirlemiş kullanıcılara gönderilebilir."


def _http(error: UserAdminError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


def _with_email(user: User, email_sent: bool) -> AdminUserWithEmailOut:
    return AdminUserWithEmailOut(**AdminUserOut.model_validate(user).model_dump(), email_sent=email_sent)


def _invite(db: Session, user: User, admin: User) -> AdminUserWithEmailOut:
    message = prepare_invite_email(db, user, admin)
    email_sent = deliver(message)
    db.refresh(user)
    return _with_email(user, email_sent)


@router.get("", response_model=list[AdminUserOut])
def list_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return list_firm_users(db, admin.law_firm_id)


@router.post("", response_model=AdminUserWithEmailOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    try:
        user = create_pending_user(db, admin.law_firm_id, payload)
    except UserAdminError as error:
        raise _http(error)
    db.commit()
    return _invite(db, user, admin)


@router.patch("/{user_id}", response_model=AdminUserOut)
def patch_user(
    user_id: str,
    payload: AdminUserUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        user = get_user_in_firm(db, admin.law_firm_id, user_id)
        update_user(db, admin, user, payload)
    except UserAdminError as error:
        db.rollback()
        raise _http(error)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/invite", response_model=AdminUserWithEmailOut)
def resend_invite(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    try:
        user = get_user_in_firm(db, admin.law_firm_id, user_id)
    except UserAdminError as error:
        raise _http(error)
    if user.password_set_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_SET)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=INACTIVE_INVITE)
    return _invite(db, user, admin)


@router.post("/{user_id}/password-reset", response_model=EmailSentOut)
def send_password_reset(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    try:
        user = get_user_in_firm(db, admin.law_firm_id, user_id)
    except UserAdminError as error:
        raise _http(error)
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=RESET_NOT_POSSIBLE)
    message = prepare_reset_email(db, user, created_by=admin.id)
    return EmailSentOut(email_sent=deliver(message))
