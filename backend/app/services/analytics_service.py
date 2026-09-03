"""Law firm analytics (section 16, 22 - Analytics).

All calculations are tenant-scoped and must degrade gracefully to
zero on an empty dataset - never divide by zero, never 500.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.case import Case, CaseOutcome, CaseStatus, CaseType
from app.schemas.analytics import AnalyticsOverview, CategoryBreakdown

_CLOSED_OUTCOMES = (CaseOutcome.WON, CaseOutcome.LOST, CaseOutcome.SETTLED)


def _win_rate(won: int, lost: int) -> float:
    decided = won + lost
    if decided == 0:
        return 0.0
    return round((won / decided) * 100, 2)


class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def _base_query(self, law_firm_id: str, months: Optional[int], case_type: Optional[CaseType]):
        query = self.db.query(Case).filter(Case.law_firm_id == law_firm_id)
        if months is not None:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=months * 30)).date()
            query = query.filter(Case.opening_date >= cutoff)
        if case_type is not None:
            query = query.filter(Case.case_type == case_type)
        return query

    def compute_overview(
        self,
        law_firm_id: str,
        months: Optional[int] = None,
        case_type: Optional[CaseType] = None,
    ) -> AnalyticsOverview:
        cases = self._base_query(law_firm_id, months, case_type).all()

        total_cases = len(cases)
        active_cases = sum(1 for c in cases if c.status != CaseStatus.KAPALI)
        won_cases = sum(1 for c in cases if c.outcome == CaseOutcome.WON)
        lost_cases = sum(1 for c in cases if c.outcome == CaseOutcome.LOST)
        win_rate = _win_rate(won_cases, lost_cases)

        closed_durations = [
            (c.updated_at.date() - c.opening_date).days
            for c in cases
            if c.outcome in _CLOSED_OUTCOMES
        ]
        average_duration = (
            round(sum(closed_durations) / len(closed_durations), 2) if closed_durations else 0.0
        )

        by_type: dict[CaseType, list[Case]] = {}
        for c in cases:
            by_type.setdefault(c.case_type, []).append(c)

        by_category = [
            CategoryBreakdown(
                case_type=case_type_key,
                total=len(group),
                won=sum(1 for c in group if c.outcome == CaseOutcome.WON),
                lost=sum(1 for c in group if c.outcome == CaseOutcome.LOST),
                win_rate=_win_rate(
                    sum(1 for c in group if c.outcome == CaseOutcome.WON),
                    sum(1 for c in group if c.outcome == CaseOutcome.LOST),
                ),
            )
            for case_type_key, group in by_type.items()
        ]

        return AnalyticsOverview(
            total_cases=total_cases,
            active_cases=active_cases,
            won_cases=won_cases,
            lost_cases=lost_cases,
            win_rate=win_rate,
            average_case_duration_days=average_duration,
            by_category=by_category,
        )
