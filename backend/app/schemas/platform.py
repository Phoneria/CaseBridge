from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.user import UserStatus
from app.schemas.text_rules import clean_full_name, clean_single_line


def _clean_firm_name(value: str) -> str:
    value = clean_single_line(value)
    if not value or len(value) > 255:
        raise ValueError("Büro adı 1-255 karakter olmalı.")
    return value


class PlatformAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    status: UserStatus
    invited_at: datetime | None = None


class PlatformFirmOut(BaseModel):
    id: str
    name: str
    created_at: datetime | None = None
    is_active: bool
    suspended_at: datetime | None = None
    active_user_count: int
    admins: list[PlatformAdminOut]


class PlatformFirmCreate(BaseModel):
    name: str
    admin_full_name: str
    admin_email: EmailStr

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_firm_name(value)

    @field_validator("admin_full_name")
    @classmethod
    def _admin_full_name(cls, value: str) -> str:
        return clean_full_name(value)


class PlatformAdminCreate(BaseModel):
    full_name: str
    email: EmailStr

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        return clean_full_name(value)


class PlatformFirmCreatedOut(BaseModel):
    firm: PlatformFirmOut
    admin: PlatformAdminOut
    email_sent: bool


class PlatformAdminInviteOut(BaseModel):
    admin: PlatformAdminOut
    email_sent: bool
