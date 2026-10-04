from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.models.courtroom import (
    CourtroomActor,
    CourtroomScenario,
    CourtroomSession,
    CourtroomSessionStatus,
    CourtroomTurn,
)


class CourtroomRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_scenarios(self) -> list[CourtroomScenario]:
        return (
            self.db.query(CourtroomScenario)
            .filter(CourtroomScenario.is_active.is_(True), CourtroomScenario.law_firm_id.is_(None))
            .order_by(CourtroomScenario.difficulty.asc(), CourtroomScenario.title.asc())
            .all()
        )

    def get_scenario(self, scenario_id: str, law_firm_id: str | None = None) -> Optional[CourtroomScenario]:
        scope = (CourtroomScenario.law_firm_id.is_(None) if law_firm_id is None
                 else or_(CourtroomScenario.law_firm_id.is_(None), CourtroomScenario.law_firm_id == law_firm_id))
        return (
            self.db.query(CourtroomScenario)
            .options(joinedload(CourtroomScenario.evidence))
            .filter(CourtroomScenario.id == scenario_id, CourtroomScenario.is_active.is_(True), scope)
            .first()
        )

    def get_session_for_user(
        self, session_id: str, law_firm_id: str, user_id: str
    ) -> Optional[CourtroomSession]:
        return (
            self.db.query(CourtroomSession)
            .options(
                joinedload(CourtroomSession.scenario).joinedload(CourtroomScenario.evidence),
                joinedload(CourtroomSession.turns).joinedload(CourtroomTurn.evidence),
                joinedload(CourtroomSession.evaluation),
            )
            .filter(
                CourtroomSession.id == session_id,
                CourtroomSession.law_firm_id == law_firm_id,
                CourtroomSession.user_id == user_id,
            )
            .first()
        )

    def get_session_in_firm(self, session_id: str) -> Optional[CourtroomSession]:
        return (
            self.db.query(CourtroomSession)
            .options(
                joinedload(CourtroomSession.scenario).joinedload(CourtroomScenario.evidence),
                joinedload(CourtroomSession.turns).joinedload(CourtroomTurn.evidence),
                joinedload(CourtroomSession.evaluation),
            )
            .filter(CourtroomSession.id == session_id)
            .first()
        )

    def list_sessions_for_user(self, law_firm_id: str, user_id: str) -> list[CourtroomSession]:
        return (
            self.db.query(CourtroomSession)
            .options(joinedload(CourtroomSession.scenario), joinedload(CourtroomSession.evaluation))
            .filter(
                CourtroomSession.law_firm_id == law_firm_id,
                CourtroomSession.user_id == user_id,
            )
            .order_by(CourtroomSession.updated_at.desc())
            .all()
        )

    def get_oldest_pending(self) -> Optional[CourtroomSession]:
        return (
            self.db.query(CourtroomSession)
            .options(
                joinedload(CourtroomSession.scenario).joinedload(CourtroomScenario.evidence),
                joinedload(CourtroomSession.turns).joinedload(CourtroomTurn.evidence),
            )
            .filter(
                CourtroomSession.status == CourtroomSessionStatus.ACTIVE,
                CourtroomSession.current_actor == CourtroomActor.OPPONENT,
            )
            .order_by(CourtroomSession.updated_at.asc())
            .first()
        )

    def next_sequence(self, session_id: str) -> int:
        current = (
            self.db.query(func.max(CourtroomTurn.sequence_number))
            .filter(CourtroomTurn.session_id == session_id)
            .scalar()
        )
        return (current or 0) + 1

    def find_request(self, session_id: str, client_request_id: str) -> Optional[CourtroomTurn]:
        return (
            self.db.query(CourtroomTurn)
            .filter(
                CourtroomTurn.session_id == session_id,
                CourtroomTurn.client_request_id == client_request_id,
            )
            .first()
        )
