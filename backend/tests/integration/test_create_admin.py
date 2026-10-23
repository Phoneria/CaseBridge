"""python -m app.db.create_admin: first firm + first administrator."""
import logging

import pytest

from app.core.config import settings
from app.db import create_admin as cli
from app.db.create_admin import CreateAdminError, create_admin
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.models.user_token import UserToken

ARGS = ["--firm", "  Demir   Hukuk ", "--email", "Yonetici@Example.com", "--name", "Ayşe Demir"]


@pytest.fixture()
def run(db_session, monkeypatch):
    """run(argv) -> exit code, with the command wired to the test database."""
    monkeypatch.setattr(cli, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(cli, "upgrade_to_head", lambda engine: None)
    return cli.main


def test_creates_the_firm_and_an_invited_admin_and_e_mails_the_link(run, client, db_session, mail_outbox, capsys):
    assert run(ARGS) == 0

    firm = db_session.query(LawFirm).one()
    user = db_session.query(User).one()
    assert firm.name == "Demir Hukuk"
    assert (user.email, user.full_name, user.role, user.law_firm_id) == (
        "yonetici@example.com", "Ayşe Demir", UserRole.ADMIN, firm.id,
    )
    assert user.password_set_at is None and user.invited_at is not None and user.status.value == "pending"
    assert capsys.readouterr().out.strip() == "Yönetici oluşturuldu: yonetici@example.com. Davet e-postası gönderildi."
    [message] = mail_outbox.messages("yonetici@example.com")
    assert message["Subject"] == "CaseBridge davetiniz — Demir Hukuk"

    token = mail_outbox.latest_token("yonetici@example.com")
    assert client.post("/auth/login", json={"email": "yonetici@example.com", "password": "bilinmiyor-123"}).status_code == 401
    chosen = client.post("/auth/set-password", json={"token": token, "password": "ilk-yonetici-sifresi"})
    assert chosen.status_code == 200
    me = client.get("/users/me", headers={"Authorization": f"Bearer {chosen.json()['access_token']}"}).json()
    assert me["role"] == "admin" and me["email"] == "yonetici@example.com"


def test_an_existing_firm_of_the_same_name_is_reused(run, db_session, mail_outbox):
    firm = LawFirm(name="Demir Hukuk")
    db_session.add(firm)
    db_session.commit()
    firm_id = firm.id

    assert run(ARGS) == 0

    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(User).one().law_firm_id == firm_id


def test_a_registered_email_is_an_error_and_changes_nothing(run, db_session, mail_outbox, capsys):
    assert run(ARGS) == 0
    capsys.readouterr()

    assert run(["--firm", "Başka Büro", "--email", "YONETICI@example.com", "--name", "Başka Kişi"]) == 1

    assert capsys.readouterr().err.strip() == "Hata: Bu e-posta adresi zaten kayıtlı."
    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(User).count() == 1
    assert len(mail_outbox.messages()) == 1


@pytest.mark.parametrize(
    "args,message",
    [
        (["--firm", "Büro", "--email", "gecersiz", "--name", "Ad Soyad"], "Geçersiz e-posta adresi."),
        (["--firm", "Büro", "--email", "a@example.com", "--name", "   "], "Ad soyad 1-255 karakter olmalı."),
        (["--firm", "   ", "--email", "a@example.com", "--name", "Ad Soyad"], "Büro adı 1-255 karakter olmalı."),
    ],
)
def test_invalid_input_is_a_turkish_error(run, db_session, mail_outbox, capsys, args, message):
    assert run(args) == 1

    assert capsys.readouterr().err.strip() == f"Hata: {message}"
    assert db_session.query(LawFirm).count() == 0 and db_session.query(User).count() == 0


def test_missing_arguments_exit_with_code_1_and_a_turkish_usage_message(run, capsys):
    with pytest.raises(SystemExit) as exit_info:
        run(["--firm", "Büro"])

    assert exit_info.value.code == 1
    assert capsys.readouterr().err.startswith("Hata: Eksik veya geçersiz bağımsız değişken. Kullanım: python -m app.db.create_admin")


def test_nothing_is_created_when_the_invite_e_mail_cannot_be_sent(run, db_session, monkeypatch, tmp_path, capsys):
    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))

    assert run(ARGS) == 1

    error = capsys.readouterr().err
    assert error.startswith("Hata: Davet e-postası gönderilemedi (")
    assert "hiçbir kayıt oluşturulmadı" in error
    assert db_session.query(LawFirm).count() == 0
    assert db_session.query(User).count() == 0
    assert db_session.query(UserToken).count() == 0


def test_console_backend_prints_the_invite_with_its_link(run, monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_backend", "console")
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:3000")
    with caplog.at_level(logging.INFO, logger="casebridge"):
        assert run(ARGS) == 0

    assert "http://localhost:3000/sifre-belirle?token=" in caplog.text


def test_create_admin_function_rolls_back_on_failure(db_session, monkeypatch):
    def boom(message):
        raise cli.EmailSendError("SMTPServerDisconnected")

    monkeypatch.setattr(cli, "send_email", boom)
    with pytest.raises(CreateAdminError):
        create_admin(db_session, "Büro", "a@example.com", "Ad Soyad")
    assert db_session.query(LawFirm).count() == 0


# --- resend for a pending administrator -------------------------------------------------

def test_running_again_for_a_pending_admin_of_the_same_firm_resends_the_invite(run, client, db_session, mail_outbox, capsys):
    assert run(ARGS) == 0
    first = mail_outbox.latest_token("yonetici@example.com")
    capsys.readouterr()

    assert run(["--firm", "Demir Hukuk", "--email", "YONETICI@example.com", "--name", "Ayşe Demir"]) == 0

    assert capsys.readouterr().out.strip() == "Davet yeniden gönderildi."
    assert db_session.query(LawFirm).count() == 1 and db_session.query(User).count() == 1
    assert len(mail_outbox.messages("yonetici@example.com")) == 2
    second = mail_outbox.latest_token("yonetici@example.com")
    assert second != first
    assert client.get("/auth/token-info", params={"token": first}).status_code == 410
    assert client.get("/auth/token-info", params={"token": second}).status_code == 200


def test_an_admin_who_already_set_a_password_is_not_re_invited(run, db_session, mail_outbox, capsys):
    from app.core.timeutil import utc_now

    assert run(ARGS) == 0
    db_session.query(User).one().password_set_at = utc_now().replace(microsecond=0)
    db_session.commit()
    capsys.readouterr()

    assert run(ARGS) == 1
    assert capsys.readouterr().err.strip() == "Hata: Bu e-posta adresi zaten kayıtlı."
    assert len(mail_outbox.messages()) == 1


def test_a_pending_lawyer_with_that_email_is_not_re_invited_as_admin(run, db_session, mail_outbox, capsys):
    from sqlalchemy import null

    from app.core.security import hash_password

    firm = LawFirm(name="Demir Hukuk")
    db_session.add(firm)
    db_session.flush()
    db_session.add(User(law_firm_id=firm.id, email="yonetici@example.com", hashed_password=hash_password("x" * 12),
                        full_name="Avukat", role=UserRole.LAWYER, password_set_at=null()))
    db_session.commit()

    assert run(ARGS) == 1
    assert capsys.readouterr().err.strip() == "Hata: Bu e-posta adresi zaten kayıtlı."
    assert mail_outbox.messages() == []
