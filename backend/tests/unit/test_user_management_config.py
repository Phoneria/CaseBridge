import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_user_management_defaults(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    for name in ("INVITE_TOKEN_HOURS", "RESET_TOKEN_MINUTES", "FRONTEND_BASE_URL", "EMAIL_BACKEND", "EMAIL_FILE_DIR"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)
    assert settings.invite_token_hours == 72
    assert settings.reset_token_minutes == 60
    assert settings.frontend_base_url == "http://localhost:3000"
    assert settings.email_file_dir == "./var/mail"
    assert settings.email_backend == "console"


def test_file_is_an_email_backend(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv("EMAIL_BACKEND", "file")
    assert Settings(_env_file=None).email_backend == "file"


@pytest.mark.parametrize("name", ["INVITE_TOKEN_HOURS", "RESET_TOKEN_MINUTES"])
def test_token_lifetimes_must_be_positive(monkeypatch, name):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv(name, "0")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
