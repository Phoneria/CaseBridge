from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.schemas.handover import HandoverReport
from app.services.case_service import CaseService
from app.services.handover_service import HandoverService

router = APIRouter(prefix="/cases", tags=["handover"])


@router.post("/{case_id}/handover", response_model=HandoverReport, status_code=status.HTTP_201_CREATED)
def generate_handover(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    case = CaseService(db).get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return HandoverService(db).generate(case)
