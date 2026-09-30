from pydantic import BaseModel


class ReportSummary(BaseModel):
    total_cases: int
    upcoming_hearings_30d: int
    open_tasks: int
    win_rate: float
