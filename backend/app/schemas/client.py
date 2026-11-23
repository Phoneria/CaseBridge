from datetime import date, datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator

from app.models.case import CaseOutcome, CaseStatus, CaseType
from app.models.client import ClientType

ClientNameText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
_OPTIONAL_TEXT = ("phone", "email", "address", "notes")


def _blank_is_none(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class ClientCreate(BaseModel):
    name: ClientNameText
    client_type: ClientType = ClientType.PERSON
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(default=None, max_length=4000)
    notes: Optional[str] = Field(default=None, max_length=4000)

    @field_validator(*_OPTIONAL_TEXT, mode="before")
    @classmethod
    def _blank_text_is_none(cls, value):
        return _blank_is_none(value)


class ClientUpdate(BaseModel):
    """PATCH /clients/{id}: a missing field keeps its value; name and client_type cannot be null."""

    name: Optional[ClientNameText] = None
    client_type: Optional[ClientType] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(default=None, max_length=4000)
    notes: Optional[str] = Field(default=None, max_length=4000)

    @field_validator(*_OPTIONAL_TEXT, mode="before")
    @classmethod
    def _blank_text_is_none(cls, value):
        return _blank_is_none(value)

    @model_validator(mode="after")
    def _required_fields_are_not_null(self):
        for field in ("name", "client_type"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    law_firm_id: str
    name: str
    client_type: ClientType
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ClientListItem(ClientOut):
    case_count: int = 0
    open_case_count: int = 0


class ClientStats(BaseModel):
    total: int
    open: int
    closed: int
    archived: int
    won: int
    lost: int
    settled: int
    total_case_value: float


class ClientCaseItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_number: str
    case_name: str
    case_type: CaseType
    status: CaseStatus
    outcome: CaseOutcome
    assigned_lawyer_name: Optional[str] = None
    next_hearing_date: Optional[date] = None
    is_archived: bool


class ClientDetailOut(ClientOut):
    stats: ClientStats
    cases: list[ClientCaseItem]
