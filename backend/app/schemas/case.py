from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.case import CaseEventType, CaseOutcome, CaseStatus, CaseType


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


class CaseCreate(BaseModel):
    case_number: str
    case_name: str
    client_name: str
    opposing_party: Optional[str] = None
    case_type: CaseType
    court: Optional[str] = None
    assigned_lawyer_id: Optional[str] = None
    opening_date: Optional[date] = None
    next_hearing_date: Optional[date] = None
    status: CaseStatus = CaseStatus.DEVAM_EDEN
    case_value: Optional[float] = None
    description: Optional[str] = None


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
    opening_date: date
    next_hearing_date: Optional[date] = None
    status: CaseStatus
    outcome: CaseOutcome
    case_value: Optional[float] = None
    description: Optional[str] = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class CaseDetailOut(CaseOut):
    timeline: list[CaseEventOut] = []
