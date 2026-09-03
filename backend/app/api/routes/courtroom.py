"""Interactive courtroom training endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.courtroom_repository import CourtroomRepository
from app.schemas.courtroom import (
    CourtroomMoveCreate,
    CourtroomScenarioOut,
    CourtroomSessionCreate,
    CourtroomSessionOut,
    CourtroomSessionSummaryOut,
)
from app.services.courtroom_service import (
    CourtroomConflictError,
    CourtroomInputError,
    CourtroomService,
)

router = APIRouter(tags=["courtroom"])


def _owned_session_or_404(
    db: Session, session_id: str, law_firm_id: str, user_id: str
):
    session = CourtroomRepository(db).get_session_for_user(session_id, law_firm_id, user_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Courtroom session not found")
    return session


@router.get("/courtroom-scenarios", response_model=list[CourtroomScenarioOut])
def list_scenarios(
    _: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return [CourtroomService.scenario_out(row) for row in CourtroomService(db).list_scenarios()]


@router.get("/courtroom-scenarios/{scenario_id}", response_model=CourtroomScenarioOut)
def get_scenario(
    scenario_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = CourtroomRepository(db).get_scenario(scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    return CourtroomService.scenario_out(scenario)


@router.post(
    "/courtroom-sessions",
    response_model=CourtroomSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    payload: CourtroomSessionCreate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = CourtroomRepository(db).get_scenario(payload.scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    session = CourtroomService(db).create_session(
        scenario, law_firm_id, current_user.id, payload.chosen_role
    )
    return CourtroomService.detail_out(session)


@router.get("/courtroom-sessions", response_model=list[CourtroomSessionSummaryOut])
def list_sessions(
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = CourtroomRepository(db).list_sessions_for_user(law_firm_id, current_user.id)
    return [CourtroomService.summary_out(row) for row in rows]


@router.get("/courtroom-sessions/{session_id}", response_model=CourtroomSessionOut)
def get_session(
    session_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return CourtroomService.detail_out(
        _owned_session_or_404(db, session_id, law_firm_id, current_user.id)
    )


@router.get("/courtroom-sessions/{session_id}/status", response_model=CourtroomSessionOut)
def get_session_status(
    session_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return CourtroomService.detail_out(
        _owned_session_or_404(db, session_id, law_firm_id, current_user.id)
    )


@router.post(
    "/courtroom-sessions/{session_id}/moves",
    response_model=CourtroomSessionOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def add_move(
    session_id: str,
    payload: CourtroomMoveCreate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _owned_session_or_404(db, session_id, law_firm_id, current_user.id)
    try:
        result = CourtroomService(db).add_user_move(session, payload)
    except CourtroomConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except CourtroomInputError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return CourtroomService.detail_out(result)


@router.post(
    "/courtroom-sessions/{session_id}/retry",
    response_model=CourtroomSessionOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def retry_session(
    session_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _owned_session_or_404(db, session_id, law_firm_id, current_user.id)
    try:
        result = CourtroomService(db).retry(session)
    except CourtroomConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    refreshed = _owned_session_or_404(db, result.id, law_firm_id, current_user.id)
    return CourtroomService.detail_out(refreshed)


@router.post("/courtroom-sessions/{session_id}/abandon", response_model=CourtroomSessionOut)
def abandon_session(
    session_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _owned_session_or_404(db, session_id, law_firm_id, current_user.id)
    try:
        CourtroomService(db).abandon(session)
    except CourtroomConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    refreshed = _owned_session_or_404(db, session_id, law_firm_id, current_user.id)
    return CourtroomService.detail_out(refreshed)
