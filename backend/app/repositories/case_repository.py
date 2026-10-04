"""Case data access.

Every method takes law_firm_id as a mandatory filter, mirroring
UserRepository. This is the pattern all future tenant-scoped
repositories (Document, Simulation, ...) must follow.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.case import Case, CaseOutcome, CaseStatus, CaseType


class CaseRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, case: Case) -> Case:
        self.db.add(case)
        self.db.commit()
        self.db.refresh(case)
        return case

    def get_by_id_in_firm(self, case_id: str, law_firm_id: str) -> Optional[Case]:
        return (
            self.db.query(Case)
            .filter(Case.id == case_id, Case.law_firm_id == law_firm_id, Case.is_precedent.is_(False))
            .first()
        )

    def list_in_firm(
        self,
        law_firm_id: str,
        search: Optional[str] = None,
        status: Optional[CaseStatus] = None,
        case_type: Optional[CaseType] = None,
        assigned_lawyer_id: Optional[str] = None,
        include_archived: bool = False,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        outcome: Optional[CaseOutcome] = None,
        active: Optional[bool] = None,
        hearing_within_days: Optional[int] = None,
    ) -> list[Case]:
        """The single search entry point for both everyday case list
        filtering and institutional-memory historical search (section
        17) - same query, `include_archived=True` is what makes closed/
        archived cases searchable again.

        `active` and `outcome` use exactly the definitions in
        AnalyticsService so a dashboard number and the list it links to
        always agree."""
        query = self.db.query(Case).filter(Case.law_firm_id == law_firm_id, Case.is_precedent.is_(False))

        if not include_archived:
            query = query.filter(Case.is_archived.is_(False))

        if status is not None:
            query = query.filter(Case.status == status)

        if case_type is not None:
            query = query.filter(Case.case_type == case_type)

        if assigned_lawyer_id is not None:
            query = query.filter(Case.assigned_lawyer_id == assigned_lawyer_id)

        if outcome is not None:
            query = query.filter(Case.outcome == outcome)

        if active is True:
            query = query.filter(Case.status != CaseStatus.KAPALI)
        elif active is False:
            query = query.filter(Case.status == CaseStatus.KAPALI)

        if hearing_within_days is not None:
            today = date.today()
            query = query.filter(
                Case.next_hearing_date.isnot(None),
                Case.next_hearing_date >= today,
                Case.next_hearing_date <= today + timedelta(days=hearing_within_days),
            )

        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Case.case_name.ilike(pattern),
                    Case.client_name.ilike(pattern),
                    Case.opposing_party.ilike(pattern),
                    Case.case_number.ilike(pattern),
                    Case.description.ilike(pattern),
                )
            )

        query = query.order_by(Case.created_at.desc())
        if offset is not None:
            query = query.offset(offset)
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def save(self, case: Case) -> Case:
        self.db.add(case)
        self.db.commit()
        self.db.refresh(case)
        return case
