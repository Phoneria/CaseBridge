from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.case import CaseOutcome, CaseStatus, CaseType
from app.models.user import User, UserRole
from app.schemas.case import CaseCreate, CaseDetailOut, CaseEventCreate, CaseEventOut, CaseOut, CaseUpdate
from app.services.case_service import CaseService, DuplicateCaseNumberError

router = APIRouter(prefix="/cases", tags=["cases"])


def _get_owned_case_or_404(service: CaseService, case_id: str, law_firm_id: str):
    case = service.get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lawyer_id = payload.assigned_lawyer_id
    if lawyer_id is not None:
        if current_user.role != UserRole.ADMIN and lawyer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only admins can assign another lawyer")
        lawyer = db.query(User).filter(
            User.id == lawyer_id, User.law_firm_id == current_user.law_firm_id,
            User.role == UserRole.LAWYER, User.is_active.is_(True),
        ).first()
        if lawyer is None:
            raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
    elif current_user.role == UserRole.LAWYER:
        lawyer_id = current_user.id
    else:
        raise HTTPException(status_code=422, detail="Choose a responsible lawyer")
    payload = payload.model_copy(update={"assigned_lawyer_id": lawyer_id})
    try:
        return CaseService(db).create_case(current_user.law_firm_id, payload)
    except DuplicateCaseNumberError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get("", response_model=list[CaseOut])
def list_cases(
    search: Optional[str] = None,
    status_filter: Optional[CaseStatus] = Query(default=None, alias="status"),
    case_type: Optional[CaseType] = None,
    assigned_lawyer_id: Optional[str] = None,
    include_archived: bool = False,
    outcome: Optional[CaseOutcome] = None,
    active: Optional[bool] = None,
    hearing_within_days: Optional[int] = Query(default=None, ge=1, le=365),
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    offset: Optional[int] = Query(default=None, ge=0),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return CaseService(db).list_cases(
        law_firm_id,
        search=search,
        status=status_filter,
        case_type=case_type,
        assigned_lawyer_id=assigned_lawyer_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
        outcome=outcome,
        active=active,
        hearing_within_days=hearing_within_days,
    )


@router.get("/{case_id}", response_model=CaseDetailOut)
def get_case(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CaseService(db)
    case = _get_owned_case_or_404(service, case_id, law_firm_id)
    timeline = service.get_timeline(case_id, law_firm_id)
    return CaseDetailOut.model_validate(case, from_attributes=True).model_copy(
        update={"timeline": [CaseEventOut.model_validate(e) for e in timeline]}
    )


@router.patch("/{case_id}", response_model=CaseOut)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    if "assigned_lawyer_id" in payload.model_fields_set:
        raise HTTPException(status_code=403, detail="Use admin case assignment to change the lawyer")
    service = CaseService(db)
    case = _get_owned_case_or_404(service, case_id, law_firm_id)
    return service.update_case(case, payload)


@router.post("/{case_id}/archive", response_model=CaseOut)
def archive_case(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = CaseService(db)
    case = _get_owned_case_or_404(service, case_id, law_firm_id)
    return service.archive_case(case)


@router.post("/{case_id}/events", response_model=CaseEventOut, status_code=status.HTTP_201_CREATED)
def add_case_event(
    case_id: str,
    payload: CaseEventCreate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CaseService(db)
    case = _get_owned_case_or_404(service, case_id, law_firm_id)
    return service.add_event(case, payload, created_by=current_user.id)
