"""Creates the first administrator (and the firm) of a real installation.

Run with:
    python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"

The administrator is created in the invited state and receives the "set your
password" e-mail. With EMAIL_BACKEND=console the e-mail, link included, is
printed to the console. Exit code 0 on success, 1 on any error (message in
Turkish). If the e-mail cannot be sent nothing is created, so the command can
simply be run again once the mail settings are fixed.

Run again for an administrator of the same firm who has not chosen a password
yet, it sends a new invite (the older links stop working) and prints
"Davet yeniden gönderildi."; any other registered e-mail is an error.
"""
import argparse
import logging
import sys

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.timeutil import utc_now
from app.db.migrate import upgrade_to_head
from app.db.session import SessionLocal, engine
import app.models  # noqa: F401  (registers all models on Base.metadata)
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.models.user_token import TokenPurpose
from app.schemas.admin_user import AdminUserCreate
from app.schemas.text_rules import clean_single_line
from app.services.email import EmailSendError, send_email
from app.services.notification_content import build_invite_email
from app.services.user_admin_service import UserAdminError, create_pending_user
from app.services.user_token_service import issue_token

USAGE = 'python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"'


class CreateAdminError(Exception):
    """str(exc) is the Turkish message printed to the user."""


class _Parser(argparse.ArgumentParser):
    def error(self, message):  # argparse would print English text and exit 2
        print(f"Hata: Eksik veya geçersiz bağımsız değişken. Kullanım: {USAGE}", file=sys.stderr)
        raise SystemExit(1)


RESENT = "Davet yeniden gönderildi."


def _pending_admin_of_firm(db: Session, firm_name: str, email: str) -> User | None:
    """The existing, active administrator of the firm with this e-mail who has
    not chosen a password yet (the invite can be sent again), else None."""
    user = UserRepository(db).get_by_email(email)
    if (
        user is None
        or user.role != UserRole.ADMIN
        or not user.is_active
        or user.password_set_at is not None
        or user.law_firm.name != firm_name
    ):
        return None
    return user


def create_admin(db: Session, firm_name: str, email: str, full_name: str) -> tuple[User, bool]:
    """Creates (or reuses by name) the firm, the invited admin and sends the
    invite; for a pending admin of the same firm only a new invite is sent.
    Commits only after the e-mail went out. Returns (user, resent)."""
    firm_name = clean_single_line(firm_name)
    if not firm_name or len(firm_name) > 255:
        raise CreateAdminError("Büro adı 1-255 karakter olmalı.")
    try:
        data = AdminUserCreate(email=email, full_name=full_name, role=UserRole.ADMIN)
    except ValidationError as exc:
        fields = {str(error["loc"][0]) for error in exc.errors()}
        if "email" in fields:
            raise CreateAdminError("Geçersiz e-posta adresi.") from exc
        raise CreateAdminError("Ad soyad 1-255 karakter olmalı.") from exc

    try:
        user = _pending_admin_of_firm(db, firm_name, str(data.email))
        resent = user is not None
        if user is not None:
            firm = user.law_firm
        else:
            firm = db.query(LawFirm).filter(LawFirm.name == firm_name).first()
            if firm is None:
                firm = LawFirm(name=firm_name)
                db.add(firm)
                db.flush()
            try:
                user = create_pending_user(db, firm.id, data)
            except UserAdminError as exc:
                raise CreateAdminError(exc.detail) from exc
        # Issuing invalidates the earlier unused invites of the user.
        token = issue_token(db, user, TokenPurpose.INVITE, created_by=None)
        user.invited_at = utc_now()
        try:
            send_email(build_invite_email(user=user, firm_name=firm.name, inviter_name=None, token=token))
        except EmailSendError as exc:
            raise CreateAdminError(
                f"Davet e-postası gönderilemedi ({exc}). E-posta ayarlarını denetleyip komutu yeniden çalıştırın; hiçbir kayıt oluşturulmadı."
            ) from exc
        db.commit()
    except Exception:
        db.rollback()
        raise
    return user, resent


def main(argv: list[str] | None = None) -> int:
    parser = _Parser(description="İlk yöneticiyi (ve gerekirse büroyu) oluşturur ve davet e-postasını gönderir.")
    parser.add_argument("--firm", required=True, help="Büro adı")
    parser.add_argument("--email", required=True, help="Yöneticinin e-posta adresi")
    parser.add_argument("--name", required=True, help="Yöneticinin adı soyadı")
    args = parser.parse_args(argv)

    # The console e-mail backend prints through the logger.
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    upgrade_to_head(engine)
    db = SessionLocal()
    try:
        user, resent = create_admin(db, args.firm, args.email, args.name)
        if resent:
            print(RESENT)
        else:
            print(f"Yönetici oluşturuldu: {user.email}. Davet e-postası gönderildi.")
        return 0
    except CreateAdminError as exc:
        print(f"Hata: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
