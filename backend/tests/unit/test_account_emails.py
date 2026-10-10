from app.core.config import settings
from app.models.user import User
from app.services.notification_content import build_invite_email, build_reset_email, password_link, validity_phrase
from datetime import timedelta


def _user():
    return User(email="yeni@example.com", full_name="Ayşe <Demir>", hashed_password="x", law_firm_id="f")


def test_password_link_uses_the_frontend_base_url(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", "https://app.example.test/")
    assert password_link("tok") == "https://app.example.test/sifre-belirle?token=tok"


def test_validity_phrase():
    assert validity_phrase(timedelta(hours=72)) == "72 saat"
    assert validity_phrase(timedelta(minutes=60)) == "1 saat"
    assert validity_phrase(timedelta(minutes=45)) == "45 dakika"


def test_invite_email_names_the_inviter_firm_link_and_validity(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:3000")
    message = build_invite_email(user=_user(), firm_name="Demir Hukuk", inviter_name="Mehmet Kaya", token="TOKEN123")

    assert message.to == "yeni@example.com"
    assert message.subject == "CaseBridge davetiniz — Demir Hukuk"
    assert "Mehmet Kaya sizi Demir Hukuk bürosunun CaseBridge çalışma alanına davet etti." in message.text
    assert "Şifrenizi belirleyin: http://localhost:3000/sifre-belirle?token=TOKEN123" in message.text
    assert "72 saat geçerlidir" in message.text
    assert 'href="http://localhost:3000/sifre-belirle?token=TOKEN123"' in message.html
    assert "Ayşe &lt;Demir&gt;" in message.html and "<Demir>" not in message.html
    assert message.show_body_in_dev_console is True


def test_invite_email_without_an_inviter_is_still_complete():
    message = build_invite_email(user=_user(), firm_name="Demir Hukuk", inviter_name=None, token="T")
    assert "Demir Hukuk bürosunun CaseBridge çalışma alanına davet edildiniz." in message.text


def test_reset_email_has_the_link_validity_and_the_ignore_notice():
    message = build_reset_email(user=_user(), token="RESETTOKEN")

    assert message.subject == "CaseBridge şifre sıfırlama"
    assert "/sifre-belirle?token=RESETTOKEN" in message.text
    assert "1 saat geçerlidir" in message.text
    assert "Bu isteği siz yapmadıysanız dikkate almayın." in message.text
    assert message.show_body_in_dev_console is True
