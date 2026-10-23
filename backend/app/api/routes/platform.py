"""The platform panel's API: customer firms and their administrators
(platform admins only)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_platform_admin
from app.db.session import get_db
from app.models.law_firm import LawFirm
from app.models.user import User, UserStatus
from app.schemas.platform import (
    PlatformAdminCreate,
    PlatformAdminInviteOut,
    PlatformAdminOut,
    PlatformFirmCreate,
    PlatformFirmCreatedOut,
    PlatformFirmOut,
)
from app.services.platform_service import (
    add_firm_admin,
    check_can_invite,
    create_firm,
    firm_admins,
    get_customer_firm,
    get_firm_admin,
    list_customer_firms,
    send_invite,
    set_firm_active,
)
from app.services.user_admin_service import EMAIL_TAKEN, UserAdminError

router = APIRouter(prefix="/platform", tags=["platform"])


def _http(error: UserAdminError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


def _firm_out(firm: LawFirm) -> PlatformFirmOut:
    return PlatformFirmOut(
        id=firm.id,
        name=firm.name,
        created_at=firm.created_at,
        is_active=firm.is_active,
        suspended_at=firm.suspended_at,
        active_user_count=sum(1 for user in firm.users if user.status == UserStatus.ACTIVE),
        admins=[PlatformAdminOut.model_validate(user) for user in firm_admins(firm)],
    )


def _firm(db: Session, firm_id: str) -> LawFirm:
    try:
        return get_customer_firm(db, firm_id)
    except UserAdminError as error:
        raise _http(error)


@router.get("/firms", response_model=list[PlatformFirmOut])
def list_firms(_: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    return [_firm_out(firm) for firm in list_customer_firms(db)]


@router.post("/firms", response_model=PlatformFirmCreatedOut, status_code=status.HTTP_201_CREATED)
def create(payload: PlatformFirmCreate, _: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    try:
        firm, admin = create_firm(db, payload.name, payload.admin_full_name, str(payload.admin_email))
        db.commit()
    except UserAdminError as error:
        db.rollback()
        raise _http(error)
    except IntegrityError:
        # Lost a race against another request using the same e-mail address.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN)
    email_sent = send_invite(db, admin)
    db.refresh(firm)
    db.refresh(admin)
    return PlatformFirmCreatedOut(firm=_firm_out(firm), admin=PlatformAdminOut.model_validate(admin), email_sent=email_sent)


@router.post("/firms/{firm_id}/admins", response_model=PlatformAdminInviteOut, status_code=status.HTTP_201_CREATED)
def add_admin(
    firm_id: str,
    payload: PlatformAdminCreate,
    _: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    firm = _firm(db, firm_id)
    try:
        admin = add_firm_admin(db, firm, payload.full_name, str(payload.email))
        db.commit()
    except UserAdminError as error:
        db.rollback()
        raise _http(error)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN)
    # A suspended firm's admin is invited after the firm is activated again.
    email_sent = send_invite(db, admin) if firm.is_active else False
    db.refresh(admin)
    return PlatformAdminInviteOut(admin=PlatformAdminOut.model_validate(admin), email_sent=email_sent)


@router.post("/firms/{firm_id}/admins/{user_id}/invite", response_model=PlatformAdminInviteOut)
def resend_invite(
    firm_id: str,
    user_id: str,
    _: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    firm = _firm(db, firm_id)
    try:
        admin = get_firm_admin(db, firm, user_id)
        check_can_invite(firm, admin)
    except UserAdminError as error:
        raise _http(error)
    email_sent = send_invite(db, admin)
    db.refresh(admin)
    return PlatformAdminInviteOut(admin=PlatformAdminOut.model_validate(admin), email_sent=email_sent)


@router.post("/firms/{firm_id}/suspend", response_model=PlatformFirmOut)
def suspend(firm_id: str, _: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm = _firm(db, firm_id)
    set_firm_active(firm, False)
    db.commit()
    db.refresh(firm)
    return _firm_out(firm)


@router.post("/firms/{firm_id}/activate", response_model=PlatformFirmOut)
def activate(firm_id: str, _: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm = _firm(db, firm_id)
    set_firm_active(firm, True)
    db.commit()
    db.refresh(firm)
    return _firm_out(firm)
