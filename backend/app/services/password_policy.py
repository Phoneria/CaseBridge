"""Password rules for choosing or changing a password."""

MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128


class PasswordPolicyError(ValueError):
    """str(exc) is the Turkish message shown to the user."""


def validate_password(password: str, email: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Şifre en az {MIN_PASSWORD_LENGTH} karakter olmalı.")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Şifre en fazla {MAX_PASSWORD_LENGTH} karakter olabilir.")
    if password.casefold() == email.strip().casefold():
        raise PasswordPolicyError("Şifre e-posta adresinizle aynı olamaz.")
