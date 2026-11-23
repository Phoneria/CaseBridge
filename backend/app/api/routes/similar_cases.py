"""Similar cases (stage 1): same-bureau cases and the bureau's precedent archive.

Access follows the existing read rules: the session's bureau is the only scope
(another bureau's case is a 404), and a user who may read the source case
through GET /cases/{id} may read these results, which come from the same set
GET /cases?include_archived=true and GET /precedents expose to them.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.core.timeutil import local_today
from app.db.session import get_db
from app.schemas.similar_case import SimilarCaseOut, SimilarCaseSearch
from app.services.case_service import CaseService
from app.services.similar_cases import Match, SimilarCaseService, duration_days

cases_router = APIRouter(prefix="/cases", tags=["similar-cases"])
search_router = APIRouter(prefix="/similar-cases", tags=["similar-cases"])


def _out(matches: list[Match]) -> list[SimilarCaseOut]:
    today = local_today()
    rows = []
    for match in matches:
        case = match.case
        days, ongoing = duration_days(case, today)
        rows.append(SimilarCaseOut(
            case_id=case.id, case_number=case.case_number, case_name=case.case_name,
            case_type=case.case_type, status=case.status, outcome=case.outcome,
            decision_date=case.decision_date, duration_days=days, duration_ongoing=ongoing,
            assigned_lawyer_name=case.assigned_lawyer_name, is_precedent=bool(case.is_precedent),
            score=match.score, reasons=match.reasons,
        ))
    return rows


@cases_router.get("/{case_id}/similar", response_model=list[SimilarCaseOut])
def similar_to_case(
    case_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    source = CaseService(db).get_case(case_id, law_firm_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return _out(SimilarCaseService(db).for_case(source, limit))


@search_router.post("/search", response_model=list[SimilarCaseOut])
def search_similar(
    payload: SimilarCaseSearch,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _out(SimilarCaseService(db).for_text(law_firm_id, payload.text, payload.case_type, payload.limit))
