import pytest

from app.services.password_policy import PasswordPolicyError, validate_password

EMAIL = "Avukat@Example.com"


def test_accepts_passwords_between_10_and_128_characters():
    validate_password("a" * 10, EMAIL)
    validate_password("ğüşiöç-1234", EMAIL)
    validate_password("x" * 128, EMAIL)


def test_rejects_short_passwords():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre en az 10 karakter olmalı\.$"):
        validate_password("a" * 9, EMAIL)


def test_rejects_passwords_over_128_characters():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre en fazla 128 karakter olabilir\.$"):
        validate_password("x" * 129, EMAIL)


def test_rejects_the_email_address_ignoring_case():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre e-posta adresinizle aynı olamaz\.$"):
        validate_password("avukat@example.COM", EMAIL)
    with pytest.raises(PasswordPolicyError, match="e-posta adresinizle aynı"):
        validate_password("avukat@example.com", "avukat@example.com")
