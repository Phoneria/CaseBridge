from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.case_access import NOT_NOTE_CHANGER, can_change_note, require_case_manager, require_case_writable
from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.case import CaseEventType, CaseOutcome, CaseStatus, CaseType
from app.models.user import User, UserRole
from app.schemas.case import CaseClose, CaseCreate, CaseDetailOut, CaseEventCreate, CaseEventOut, CaseNoteUpdate, CaseOut, CaseUpdate
from app.repositories.case_event_repository import CaseEventRepository
from app.services.case_events import CaseEventInputError, clean_note_text, note_title
from app.services.case_lifecycle import CaseLifecycleService, CaseStateError
from app.services.case_parties import InvalidPartiesError
from app.services.case_service import CaseService, DuplicateCaseNumberError

router = APIRouter(prefix="/cases", tags=["cases"])


def _get_owned_case_or_404(service: CaseService, case_id: str, law_firm_id: str, lock: bool = False):
    case = (service.get_case_for_update if lock else service.get_case)(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _managed_case(db: Session, case_id: str, current_user: User):
    """The firm's case (404 otherwise) that the user may change (403 otherwise)."""
    case = _get_owned_case_or_404(CaseService(db), case_id, current_user.law_firm_id, lock=True)
    require_case_manager(current_user, case)
    return case


def _lifecycle(action):
    """Runs a lifecycle action and turns a broken rule into its HTTP response."""
    try:
        return action()
    except CaseStateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


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
            User.password_set_at.isnot(None),
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
    except InvalidPartiesError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if "assigned_lawyer_id" in payload.model_fields_set:
        raise HTTPException(status_code=403, detail="Use admin case assignment to change the lawyer")
    case = _managed_case(db, case_id, current_user)
    require_case_writable(case)
    _lifecycle(lambda: CaseLifecycleService.ensure_patch_allowed(case, payload))
    try:
        return CaseService(db).update_case(case, payload)
    except InvalidPartiesError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/{case_id}/close", response_model=CaseOut)
def close_case(
    case_id: str,
    payload: CaseClose,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _managed_case(db, case_id, current_user)
    require_case_writable(case)
    return _lifecycle(lambda: CaseLifecycleService(db).close(case, payload, current_user.id, local_today()))


@router.post("/{case_id}/reopen", response_model=CaseOut)
def reopen_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _managed_case(db, case_id, current_user)
    require_case_writable(case)
    return _lifecycle(lambda: CaseLifecycleService(db).reopen(case, current_user.id, local_today()))


@router.post("/{case_id}/archive", response_model=CaseOut)
def archive_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _managed_case(db, case_id, current_user)
    return _lifecycle(lambda: CaseLifecycleService(db).archive(case))


@router.post("/{case_id}/unarchive", response_model=CaseOut)
def unarchive_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _managed_case(db, case_id, current_user)
    return CaseLifecycleService(db).unarchive(case)


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
    require_case_writable(case)
    try:
        return service.add_event(case, payload, created_by=current_user.id)
    except CaseEventInputError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail) from exc


NOTE_NOT_FOUND = "Kayıt bulunamadı."
ONLY_NOTES = "Yalnızca notlar düzenlenebilir veya silinebilir."


def _changeable_note(db: Session, case_id: str, event_id: str, current_user: User):
    """404 (no such case/entry in this firm), 409 (archived), 409 (not a note), 403 (not allowed), in that order."""
    case = CaseService(db).get_case(case_id, current_user.law_firm_id)
    events = CaseEventRepository(db)
    event = events.get_in_case(event_id, case_id, current_user.law_firm_id) if case is not None else None
    if case is None or event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOTE_NOT_FOUND)
    require_case_writable(case)
    if event.event_type != CaseEventType.NOTE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ONLY_NOTES)
    if not can_change_note(current_user, case, event):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_NOTE_CHANGER)
    return events, event


@router.patch("/{case_id}/events/{event_id}", response_model=CaseEventOut)
def update_case_note(
    case_id: str,
    event_id: str,
    payload: CaseNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events, event = _changeable_note(db, case_id, event_id, current_user)
    if payload.description is not None:
        try:
            text = clean_note_text(payload.description)
        except CaseEventInputError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail) from exc
        event.description = text
        event.title = note_title(text)
    if payload.event_date is not None:
        event.event_date = payload.event_date
    return events.save(event)


@router.delete("/{case_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case_note(
    case_id: str,
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events, event = _changeable_note(db, case_id, event_id, current_user)
    events.delete(event)
