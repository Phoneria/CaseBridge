from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.case import Case, CaseEvent, CaseOutcome, CaseStatus, CaseType
from app.repositories.case_event_repository import CaseEventRepository
from app.repositories.case_repository import CaseRepository
from app.schemas.case import CaseCreate, CaseEventCreate, CaseUpdate


class DuplicateCaseNumberError(Exception):
    """Raised when a case_number already exists for this law firm.
    Caught at the route layer and turned into a 409 - kept as a plain
    domain exception here so the service/repository layers stay
    HTTP-agnostic."""


class CaseService:
    def __init__(self, db: Session):
        self.db = db
        self.cases = CaseRepository(db)
        self.events = CaseEventRepository(db)

    def create_case(self, law_firm_id: str, payload: CaseCreate) -> Case:
        case = Case(law_firm_id=law_firm_id, **payload.model_dump(exclude_unset=True))
        try:
            return self.cases.create(case)
        except IntegrityError as exc:
            self.db.rollback()
            raise DuplicateCaseNumberError(
                f"Case number '{payload.case_number}' already exists for this firm."
            ) from exc

    def get_case(self, case_id: str, law_firm_id: str) -> Optional[Case]:
        return self.cases.get_by_id_in_firm(case_id, law_firm_id)

    def list_cases(
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
        return self.cases.list_in_firm(
            law_firm_id,
            search=search,
            status=status,
            case_type=case_type,
            assigned_lawyer_id=assigned_lawyer_id,
            include_archived=include_archived,
            limit=limit,
            offset=offset,
            outcome=outcome,
            active=active,
            hearing_within_days=hearing_within_days,
        )

    def update_case(self, case: Case, payload: CaseUpdate) -> Case:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(case, field, value)
        return self.cases.save(case)

    def archive_case(self, case: Case) -> Case:
        case.is_archived = True
        return self.cases.save(case)

    def get_timeline(self, case_id: str, law_firm_id: str) -> list[CaseEvent]:
        return self.events.list_for_case(case_id, law_firm_id)

    def add_event(self, case: Case, payload: CaseEventCreate, created_by: Optional[str] = None) -> CaseEvent:
        event = CaseEvent(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            created_by=created_by,
            **payload.model_dump(),
        )
        return self.events.create(event)
