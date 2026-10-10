from datetime import date, datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.models.case import CaseEventType, CaseOutcome, CaseStatus, CaseType, ClientRole, PartyRole

PartyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class CaseEventCreate(BaseModel):
    event_date: date
    title: str
    description: Optional[str] = None
    event_type: CaseEventType = CaseEventType.OTHER


class CaseEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_date: date
    title: str
    description: Optional[str] = None
    event_type: CaseEventType
    created_at: datetime


class CasePartyIn(BaseModel):
    name: PartyName
    role: PartyRole
    is_client: bool = False
    counsel_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("counsel_name")
    @classmethod
    def _blank_counsel_is_none(cls, value: Optional[str]) -> Optional[str]:
        value = value.strip() if value else None
        return value or None


class CasePartyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    role: str
    is_client: bool
    counsel_name: Optional[str] = None
    sort_order: int


class CaseCreate(BaseModel):
    case_number: str = Field(max_length=50)
    case_name: str
    client_name: Optional[str] = None
    opposing_party: Optional[str] = None
    case_type: CaseType
    court: Optional[str] = None
    assigned_lawyer_id: Optional[str] = None
    opening_date: Optional[date] = None
    next_hearing_date: Optional[date] = None
    status: CaseStatus = CaseStatus.DEVAM_EDEN
    case_value: Optional[float] = None
    description: Optional[str] = None
    client_role: Optional[ClientRole] = None
    court_file_number: Optional[str] = Field(default=None, max_length=100)
    claim: Optional[str] = None
    facts_summary: Optional[str] = None
    plaintiff_position: Optional[str] = None
    defendant_position: Optional[str] = None
    parties: Optional[list[CasePartyIn]] = Field(default=None, min_length=1, max_length=20)

    @model_validator(mode="after")
    def _client_name_is_required_without_parties(self):
        if self.parties is None and not (self.client_name and self.client_name.strip()):
            raise ValueError("client_name is required when parties are not given")
        return self


class CaseUpdate(BaseModel):
    case_name: Optional[str] = None
    client_name: Optional[str] = None
    opposing_party: Optional[str] = None
    case_type: Optional[CaseType] = None
    court: Optional[str] = None
    assigned_lawyer_id: Optional[str] = None
    next_hearing_date: Optional[date] = None
    status: Optional[CaseStatus] = None
    outcome: Optional[CaseOutcome] = None
    case_value: Optional[float] = None
    description: Optional[str] = None
    client_role: Optional[ClientRole] = None
    court_file_number: Optional[str] = Field(default=None, max_length=100)
    claim: Optional[str] = None
    facts_summary: Optional[str] = None
    plaintiff_position: Optional[str] = None
    defendant_position: Optional[str] = None
    parties: Optional[list[CasePartyIn]] = Field(default=None, min_length=1, max_length=20)


class CaseAssignment(BaseModel):
    assigned_lawyer_id: str


class PrecedentReviewAssignment(BaseModel):
    reviewer_lawyer_id: str


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    law_firm_id: str
    case_number: str
    case_name: str
    client_name: str
    opposing_party: Optional[str] = None
    case_type: CaseType
    court: Optional[str] = None
    assigned_lawyer_id: Optional[str] = None
    reviewer_lawyer_id: Optional[str] = None
    opening_date: date
    next_hearing_date: Optional[date] = None
    status: CaseStatus
    outcome: CaseOutcome
    case_value: Optional[float] = None
    description: Optional[str] = None
    client_role: Optional[str] = None
    court_file_number: Optional[str] = None
    claim: Optional[str] = None
    facts_summary: Optional[str] = None
    plaintiff_position: Optional[str] = None
    defendant_position: Optional[str] = None
    parties: list[CasePartyOut] = []
    is_archived: bool
    is_precedent: bool
    created_at: datetime
    updated_at: datetime


class CaseDetailOut(CaseOut):
    timeline: list[CaseEventOut] = []
