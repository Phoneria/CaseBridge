from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.user import UserRole, UserStatus


def _single_line(value: str) -> str:
    """Trims and collapses whitespace (also newlines, so a name can never
    inject a header into an e-mail)."""
    return " ".join(value.split())


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    department: str | None = None
    role: UserRole
    is_active: bool
    status: UserStatus
    invited_at: datetime | None = None
    password_set_at: datetime | None = None
    created_at: datetime | None = None


class AdminUserWithEmailOut(AdminUserOut):
    """Returned when an e-mail was attempted: email_sent is false when sending
    failed (the user and the link exist; the invite can be sent again)."""

    email_sent: bool


class EmailSentOut(BaseModel):
    email_sent: bool


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    department: str | None = None
    role: UserRole

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        value = _single_line(value)
        if not value or len(value) > 255:
            raise ValueError("Ad soyad 1-255 karakter olmalı.")
        return value

    @field_validator("department")
    @classmethod
    def _department(cls, value: str | None) -> str | None:
        return _clean_department(value)


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    department: str | None = None
    role: UserRole | None = None
    email: EmailStr | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Ad soyad boş olamaz.")
        value = _single_line(value)
        if not value or len(value) > 255:
            raise ValueError("Ad soyad 1-255 karakter olmalı.")
        return value

    @field_validator("department")
    @classmethod
    def _department(cls, value: str | None) -> str | None:
        return _clean_department(value)

    @field_validator("role", "email")
    @classmethod
    def _not_null(cls, value):
        if value is None:
            raise ValueError("Bu alan boş olamaz.")
        return value


def _clean_department(value: str | None) -> str | None:
    if value is None:
        return None
    value = _single_line(value)
    if len(value) > 100:
        raise ValueError("Departman en fazla 100 karakter olabilir.")
    return value or None
