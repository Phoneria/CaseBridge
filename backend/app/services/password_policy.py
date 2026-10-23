"""Password rules for choosing or changing a password."""

MIN_PASSWORD_LENGTH = 10
# bcrypt only looks at the first 72 bytes of a password (UTF-8): a longer
# one would be silently truncated, so it is refused. This replaces the earlier
# 128-character cap, which can no longer be reached (72 bytes <= 72 characters).
MAX_PASSWORD_BYTES = 72


class PasswordPolicyError(ValueError):
    """str(exc) is the Turkish message shown to the user."""


def validate_password(password: str, email: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Şifre en az {MIN_PASSWORD_LENGTH} karakter olmalı.")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise PasswordPolicyError(
            f"Şifre en fazla {MAX_PASSWORD_BYTES} bayt olabilir (Türkçe karakterler 2 bayt sayılır)."
        )
    if password.casefold() == email.strip().casefold():
        raise PasswordPolicyError("Şifre e-posta adresinizle aynı olamaz.")
