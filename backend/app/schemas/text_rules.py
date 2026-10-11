"""Shared cleaning rules for names typed by users."""


def clean_single_line(value: str) -> str:
    """Trims and collapses whitespace, newlines included, so a name can never
    inject a header into an e-mail."""
    return " ".join(value.split())


def clean_full_name(value: str | None) -> str:
    if value is None:
        raise ValueError("Ad soyad boş olamaz.")
    value = clean_single_line(value)
    if not value or len(value) > 255:
        raise ValueError("Ad soyad 1-255 karakter olmalı.")
    return value


def clean_department(value: str | None) -> str | None:
    if value is None:
        return None
    value = clean_single_line(value)
    if len(value) > 100:
        raise ValueError("Departman en fazla 100 karakter olabilir.")
    return value or None
