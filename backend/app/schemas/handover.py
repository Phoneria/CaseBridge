from datetime import date
from typing import Optional

from pydantic import BaseModel

from app.schemas.case import CaseEventOut
from app.schemas.document import DocumentOut


class CaseOverview(BaseModel):
    case_number: str
    case_name: str
    client_name: str
    opposing_party: Optional[str] = None
    case_type: str
    court: Optional[str] = None
    status: str
    opening_date: date


class HandoverReport(BaseModel):
    case_id: str
    case_overview: CaseOverview
    timeline: list[CaseEventOut]
    current_situation: str
    key_documents: list[DocumentOut]
    important_arguments: list[str]
    risks: list[str]
    pending_tasks: list[str]
    upcoming_dates: list[str]
    recommended_next_steps: list[str]
