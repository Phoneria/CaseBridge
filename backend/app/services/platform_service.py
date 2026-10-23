"""The CaseBridge team's administration of customer firms (platform admins
only). The internal platform firm is never listed, changed or reachable here:
every lookup answers it with 404."""
from sqlalchemy.orm import Session

from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.schemas.admin_user import AdminUserCreate
from app.services.account_service import deliver, prepare_invite_email
from app.services.user_admin_service import UserAdminError, create_pending_user

PLATFORM_FIRM_NAME = "CaseBridge Platform"
FIRM_NOT_FOUND = "Büro bulunamadı."
ADMIN_NOT_FOUND = "Yönetici bulunamadı."
FIRM_NAME_TAKEN = "Bu adla bir büro zaten var."
SUSPENDED_INVITE = "Askıdaki büroya davet gönderilemez."
ALREADY_SET = "Kullanıcı şifresini zaten belirlemiş."
INACTIVE_INVITE = "Pasif kullanıcıya davet gönderilemez. Önce kullanıcıyı aktifleştirin."


def get_or_create_platform_firm(db: Session) -> LawFirm:
    """The internal firm of the platform admins. Flushes; the caller commits."""
    firm = db.query(LawFirm).filter(LawFirm.is_platform.is_(True)).first()
    if firm is None:
        firm = LawFirm(name=PLATFORM_FIRM_NAME, is_platform=True)
        db.add(firm)
        db.flush()
    return firm


def list_customer_firms(db: Session) -> list[LawFirm]:
    return db.query(LawFirm).filter(LawFirm.is_platform.is_(False)).order_by(LawFirm.name).all()


def get_customer_firm(db: Session, firm_id: str) -> LawFirm:
    firm = db.query(LawFirm).filter(LawFirm.id == firm_id, LawFirm.is_platform.is_(False)).first()
    if firm is None:
        raise UserAdminError(404, FIRM_NOT_FOUND)
    return firm


def firm_admins(firm: LawFirm) -> list[User]:
    return sorted((user for user in firm.users if user.role == UserRole.ADMIN), key=lambda u: (u.full_name, u.email))


def _name_taken(db: Session, name: str) -> bool:
    # casefold in Python: SQLite's lower() only folds ASCII (İ, Ş, Ç ...).
    wanted = name.casefold()
    return any(existing.casefold() == wanted for (existing,) in db.query(LawFirm.name).all())


def _new_admin(db: Session, firm: LawFirm, full_name: str, email: str) -> User:
    return create_pending_user(db, firm.id, AdminUserCreate(email=email, full_name=full_name, role=UserRole.ADMIN))


def create_firm(db: Session, name: str, admin_full_name: str, admin_email: str) -> tuple[LawFirm, User]:
    """The firm and its invited first admin. Flushes; the caller commits, then
    sends the invite."""
    if _name_taken(db, name):
        raise UserAdminError(409, FIRM_NAME_TAKEN)
    firm = LawFirm(name=name)
    db.add(firm)
    db.flush()
    return firm, _new_admin(db, firm, admin_full_name, admin_email)


def add_firm_admin(db: Session, firm: LawFirm, full_name: str, email: str) -> User:
    """Flushes; the caller commits."""
    return _new_admin(db, firm, full_name, email)


def get_firm_admin(db: Session, firm: LawFirm, user_id: str) -> User:
    user = db.query(User).filter(
        User.id == user_id, User.law_firm_id == firm.id, User.role == UserRole.ADMIN,
    ).first()
    if user is None:
        raise UserAdminError(404, ADMIN_NOT_FOUND)
    return user


def check_can_invite(firm: LawFirm, user: User) -> None:
    if not firm.is_active:
        raise UserAdminError(409, SUSPENDED_INVITE)
    if user.password_set_at is not None:
        raise UserAdminError(409, ALREADY_SET)
    if not user.is_active:
        raise UserAdminError(409, INACTIVE_INVITE)


def send_invite(db: Session, user: User) -> bool:
    """Issues the invite (committed) and sends it; False when sending failed.
    No inviter name: the e-mail comes from CaseBridge, not from a person."""
    return deliver(prepare_invite_email(db, user, inviter=None))


def set_firm_active(firm: LawFirm, active: bool) -> None:
    """Idempotent: suspending a suspended firm keeps its suspended_at."""
    if firm.is_active == active:
        return
    firm.is_active = active
    firm.suspended_at = None if active else utc_now()
