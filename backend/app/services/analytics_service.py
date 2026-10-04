"""Law firm analytics (section 16, 22 - Analytics).

All calculations are tenant-scoped and must degrade gracefully to
zero on an empty dataset - never divide by zero, never 500.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.case import Case, CaseOutcome, CaseStatus, CaseType
from app.models.user import User, UserRole
from app.schemas.analytics import AnalyticsOverview, CategoryBreakdown, LawyerBreakdown, StatusBreakdown

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
        query = self.db.query(Case).filter(Case.law_firm_id == law_firm_id, Case.is_precedent.is_(False))
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

        status_counts: dict[CaseStatus, int] = {}
        for c in cases:
            status_counts[c.status] = status_counts.get(c.status, 0) + 1
        by_status = [StatusBreakdown(status=s, total=status_counts[s]) for s in CaseStatus if s in status_counts]

        lawyers = self.db.query(User).filter(
            User.law_firm_id == law_firm_id, User.role == UserRole.LAWYER
        ).order_by(User.full_name).all()
        by_lawyer = []
        for lawyer in lawyers:
            owned = [case for case in cases if case.assigned_lawyer_id == lawyer.id]
            by_lawyer.append(LawyerBreakdown(
                lawyer_id=lawyer.id,
                full_name=lawyer.full_name,
                department=lawyer.department,
                total=len(owned),
                active=sum(1 for case in owned if case.status != CaseStatus.KAPALI),
                won=sum(1 for case in owned if case.outcome == CaseOutcome.WON),
                lost=sum(1 for case in owned if case.outcome == CaseOutcome.LOST),
            ))
        unassigned = [case for case in cases if case.assigned_lawyer_id is None]
        if unassigned:
            by_lawyer.append(LawyerBreakdown(
                lawyer_id=None, full_name="Atanmamış", department=None,
                total=len(unassigned),
                active=sum(1 for case in unassigned if case.status != CaseStatus.KAPALI),
                won=sum(1 for case in unassigned if case.outcome == CaseOutcome.WON),
                lost=sum(1 for case in unassigned if case.outcome == CaseOutcome.LOST),
            ))

        return AnalyticsOverview(
            total_cases=total_cases,
            active_cases=active_cases,
            won_cases=won_cases,
            lost_cases=lost_cases,
            win_rate=win_rate,
            average_case_duration_days=average_duration,
            by_category=by_category,
            by_status=by_status,
            by_lawyer=by_lawyer,
        )
