from datetime import date
from typing import Annotated, Optional

from pydantic import BaseModel, Field, StringConstraints

from app.models.case import CaseOutcome, CaseStatus, CaseType

SearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]


class SimilarCaseOut(BaseModel):
    case_id: str
    case_number: str
    case_name: str
    case_type: CaseType
    status: CaseStatus
    outcome: CaseOutcome
    decision_date: Optional[date] = None
    duration_days: Optional[int] = None
    duration_ongoing: bool = False
    assigned_lawyer_name: Optional[str] = None
    is_precedent: bool
    score: int = Field(ge=0, le=100)
    reasons: list[str]


class SimilarCaseSearch(BaseModel):
    text: SearchText
    case_type: Optional[CaseType] = None
    limit: int = Field(default=5, ge=1, le=20)


class HighlightOut(BaseModel):
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class PassagePairOut(BaseModel):
    case_label: str
    case_text: str
    case_highlights: list[HighlightOut]
    precedent_label: str
    precedent_text: str
    precedent_highlights: list[HighlightOut]


class SimilarityExplanationOut(BaseModel):
    shared_terms: list[str]
    shared_statutes: list[str]
    matching_fields: list[str]
    passages: list[PassagePairOut]


class SimilarPrecedentOut(BaseModel):
    precedent_id: str
    case_number: str
    case_name: str
    case_type: CaseType
    court: Optional[str] = None
    outcome: CaseOutcome
    decision_date: Optional[date] = None
    score: int = Field(ge=0, le=100)
    text_score: int = Field(ge=0, le=100)
    linked_to_case: bool = False
    explanation: SimilarityExplanationOut
