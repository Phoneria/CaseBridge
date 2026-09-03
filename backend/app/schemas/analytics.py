from pydantic import BaseModel

from app.models.case import CaseType


class CategoryBreakdown(BaseModel):
    case_type: CaseType
    total: int
    won: int
    lost: int
    win_rate: float


class AnalyticsOverview(BaseModel):
    total_cases: int
    active_cases: int
    won_cases: int
    lost_cases: int
    win_rate: float
    average_case_duration_days: float
    by_category: list[CategoryBreakdown]
