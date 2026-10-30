from app.models.user import UserRole
from app.schemas.text_rules import clean_department, clean_full_name
from pydantic import BaseModel, ConfigDict, field_validator


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    department: str | None = None
    gender: str | None = None
    role: UserRole
    law_firm_id: str
    is_active: bool
    is_platform_admin: bool = False


class ProfileUpdate(BaseModel):
    """What a user may change about themselves (PATCH /users/me)."""

    full_name: str | None = None
    department: str | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str | None) -> str:
        return clean_full_name(value)

    @field_validator("department")
    @classmethod
    def _department(cls, value: str | None) -> str | None:
        return clean_department(value)
