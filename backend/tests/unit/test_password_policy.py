import pytest

from app.services.password_policy import PasswordPolicyError, validate_password

EMAIL = "Avukat@Example.com"


def test_accepts_passwords_between_10_characters_and_72_bytes():
    validate_password("a" * 10, EMAIL)
    validate_password("ğüşiöç-1234", EMAIL)


def test_rejects_short_passwords():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre en az 10 karakter olmalı\.$"):
        validate_password("a" * 9, EMAIL)


def test_rejects_the_email_address_ignoring_case():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre e-posta adresinizle aynı olamaz\.$"):
        validate_password("avukat@example.COM", EMAIL)
    with pytest.raises(PasswordPolicyError, match="e-posta adresinizle aynı"):
        validate_password("avukat@example.com", "avukat@example.com")


TOO_LONG_BYTES = r"^Şifre en fazla 72 bayt olabilir \(Türkçe karakterler 2 bayt sayılır\)\.$"


def test_accepts_exactly_72_bytes():
    validate_password("x" * 72, EMAIL)
    validate_password("ş" * 36, EMAIL)  # 36 characters, 72 bytes


def test_rejects_passwords_over_72_bytes_in_utf8():
    with pytest.raises(PasswordPolicyError, match=TOO_LONG_BYTES):
        validate_password("x" * 73, EMAIL)
    with pytest.raises(PasswordPolicyError, match=TOO_LONG_BYTES):
        validate_password("ş" * 36 + "a", EMAIL)  # 37 characters, 73 bytes
