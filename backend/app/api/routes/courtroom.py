"""Interactive courtroom training endpoints."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.case import Case
from app.models.courtroom import CourtroomActor, CourtroomSessionStatus
from app.repositories.courtroom_repository import CourtroomRepository
from app.schemas.courtroom import (
    CourtroomMoveCreate,
    CourtroomScenarioOut,
    CourtroomSessionCreate,
    CourtroomCaseSessionCreate,
    CourtroomSessionOut,
    CourtroomSessionSummaryOut,
)
from app.services.courtroom_service import (
    CourtroomConflictError,
    CourtroomInputError,
    CourtroomService,
)
from app.services import voice_service
from app.services.case_courtroom import scenario_from_case

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = CourtroomRepository(db).get_scenario(scenario_id, current_user.law_firm_id)
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
    scenario = CourtroomRepository(db).get_scenario(payload.scenario_id, law_firm_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    session = CourtroomService(db).create_session(
        scenario, law_firm_id, current_user.id, payload.chosen_role
    )
    return CourtroomService.detail_out(session)


@router.post("/courtroom-sessions/from-case", response_model=CourtroomSessionOut, status_code=status.HTTP_201_CREATED)
def create_session_from_case(
    payload: CourtroomCaseSessionCreate,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = db.query(Case).filter(
        Case.id == payload.case_id,
        Case.law_firm_id == law_firm_id,
        Case.is_precedent.is_(False),
    ).first()
    if case is None:
        raise HTTPException(status_code=404, detail="Dava bulunamadı")
    scenario = scenario_from_case(db, case, payload.chosen_role)
    session = CourtroomService(db).create_session(scenario, law_firm_id, current_user.id, payload.chosen_role)
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


@router.post("/courtroom-sessions/{session_id}/voice/transcribe")
async def transcribe_move(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _owned_session_or_404(db, session_id, current_user.law_firm_id, current_user.id)
    if session.status != CourtroomSessionStatus.ACTIVE or session.current_actor != CourtroomActor.USER:
        raise HTTPException(status_code=409, detail="It is not your turn")
    content_type = (file.content_type or "").split(";")[0]
    extension = ".webm" if content_type == "audio/webm" else ".mp4" if content_type == "audio/mp4" else None
    if extension is None:
        raise HTTPException(status_code=422, detail="Use WebM or MP4 audio")
    data = await file.read(10 * 1024 * 1024 + 1)
    if not data or len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio must be between 1 byte and 10 MB")
    try:
        text = voice_service.transcribe(f"courtroom{extension}", content_type, data)
    except voice_service.VoiceUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not text:
        raise HTTPException(status_code=422, detail="No speech was recognized")
    return {"text": text[:4000]}


@router.get("/courtroom-sessions/{session_id}/voice/turns/{turn_id}")
def speak_turn(
    session_id: str,
    turn_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _owned_session_or_404(db, session_id, current_user.law_firm_id, current_user.id)
    turn = next((row for row in session.turns if row.id == turn_id), None)
    if turn is None or turn.actor not in (CourtroomActor.OPPONENT, CourtroomActor.JUDGE):
        raise HTTPException(status_code=404, detail="Spoken turn not found")
    try:
        audio = voice_service.synthesize(turn.content, turn.actor.value)
    except voice_service.VoiceUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/mpeg")


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
