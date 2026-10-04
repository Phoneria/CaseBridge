from sqlalchemy.orm import Session

from app.models.case import CaseEvent


class CaseEventRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, event: CaseEvent) -> CaseEvent:
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[CaseEvent]:
        return (
            self.db.query(CaseEvent)
            .filter(CaseEvent.case_id == case_id, CaseEvent.law_firm_id == law_firm_id)
            .order_by(CaseEvent.event_date.asc())
            .all()
        )

    def list_recent_for_firm(self, law_firm_id: str, limit: int = 10) -> list[tuple[CaseEvent, str, str]]:
        """Most recently CREATED events across every case in the firm
        (not sorted by event_date) - powers the Dashboard's activity
        feed, which is about "what just happened", not the case
        timeline's chronological order."""
        from app.models.case import Case

        return (
            self.db.query(CaseEvent, Case.case_name, Case.id)
            .join(Case, CaseEvent.case_id == Case.id)
            .filter(CaseEvent.law_firm_id == law_firm_id, Case.is_precedent.is_(False))
            .order_by(CaseEvent.created_at.desc())
            .limit(limit)
            .all()
        )
