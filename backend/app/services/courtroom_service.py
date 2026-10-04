"""Application service for resumable, turn-based courtroom training."""
from datetime import datetime, timezone
import re
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.courtroom import (
    PHASE_GUIDANCE,
    PHASE_SEQUENCE,
    PROMPT_VERSION,
    JudgeFinalOutput,
    JudgeInterimOutput,
    OpponentOutput,
    build_judge_final_prompts,
    build_judge_interim_prompts,
    build_opponent_prompts,
    parse_with_one_repair,
)
from app.ai.llm_levels import provider_for
from app.ai.providers.base import LLMProvider
from app.core.config import settings
from app.models.courtroom import (
    CourtroomActor,
    CourtroomPhase,
    CourtroomRole,
    CourtroomScenario,
    CourtroomSession,
    CourtroomSessionStatus,
    CourtroomTurn,
    CourtroomTurnType,
    JudgeEvaluation,
    ScenarioEvidence,
)
from app.repositories.courtroom_repository import CourtroomRepository
from app.schemas.courtroom import (
    CourtroomMoveCreate,
    CourtroomScenarioOut,
    CourtroomSessionOut,
    CourtroomSessionSummaryOut,
    CourtroomTurnOut,
    JudgeEvaluationOut,
    ScenarioEvidenceOut,
)


class CourtroomConflictError(Exception):
    pass


class CourtroomInputError(Exception):
    pass


ALLOWED_ACTIONS = {
    CourtroomPhase.OPENING: {"opening", "argument"},
    CourtroomPhase.MAIN_ARGUMENTS: {"argument", "rebuttal"},
    CourtroomPhase.EVIDENCE: {"evidence", "argument", "objection"},
    CourtroomPhase.EXAMINATION: {"answer", "argument", "objection"},
    CourtroomPhase.REBUTTAL: {"rebuttal", "argument", "objection"},
    CourtroomPhase.CLOSING: {"closing"},
}

TRAINING_DISCLAIMER = (
    "Bu sonuç yalnızca kurgusal eğitim amaçlıdır; hukuki görüş, "
    "gerçek dava sonucu tahmini veya sonuç garantisi değildir."
)


def _model_name() -> str:
    if settings.llm_provider == "ollama":
        return settings.ollama_model
    if settings.llm_provider == "qwen":
        return settings.qwen_model
    if settings.llm_provider == "openai":
        return settings.openai_model
    return "courtroom-mock"


def _legal_role(role: CourtroomRole) -> str:
    return "plaintiff_lawyer" if role == CourtroomRole.PLAINTIFF else "defendant_lawyer"


def _role_display(role: CourtroomRole) -> str:
    return "davacı vekili" if role == CourtroomRole.PLAINTIFF else "davalı vekili"


class CourtroomService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = CourtroomRepository(db)

    def list_scenarios(self) -> list[CourtroomScenario]:
        return self.repo.list_scenarios()

    def create_session(
        self, scenario: CourtroomScenario, law_firm_id: str, user_id: str, chosen_role: CourtroomRole
    ) -> CourtroomSession:
        opponent_role = (
            CourtroomRole.DEFENDANT if chosen_role == CourtroomRole.PLAINTIFF else CourtroomRole.PLAINTIFF
        )
        session = CourtroomSession(
            scenario_id=scenario.id,
            law_firm_id=law_firm_id,
            user_id=user_id,
            chosen_role=chosen_role,
            opponent_role=opponent_role,
            max_rounds=min(max(scenario.estimated_rounds, 1), len(PHASE_SEQUENCE)),
            model=_model_name(),
            prompt_version=PROMPT_VERSION,
        )
        self.db.add(session)
        self.db.flush()
        self.db.add(
            CourtroomTurn(
                session_id=session.id,
                sequence_number=1,
                actor=CourtroomActor.SYSTEM,
                legal_role="system",
                turn_type=CourtroomTurnType.INSTRUCTION,
                content=(
                    f"Simülasyon başladı. Rolünüz: {_role_display(chosen_role)}. "
                    f"İlk aşama: {PHASE_GUIDANCE[CourtroomPhase.OPENING]}"
                ),
                structured_data={"phase": CourtroomPhase.OPENING.value},
            )
        )
        self.db.commit()
        return self.repo.get_session_for_user(session.id, law_firm_id, user_id)  # type: ignore[return-value]

    def add_user_move(self, session: CourtroomSession, move: CourtroomMoveCreate) -> CourtroomSession:
        if move.client_request_id:
            duplicate = self.repo.find_request(session.id, move.client_request_id)
            if duplicate is not None:
                return session
        if session.status != CourtroomSessionStatus.ACTIVE:
            raise CourtroomConflictError("Bu simülasyon artık aktif değil.")
        if session.current_actor != CourtroomActor.USER:
            raise CourtroomConflictError("Şu anda karşı avukat ve hâkim yanıt hazırlıyor.")
        if move.action_type not in ALLOWED_ACTIONS.get(session.phase, set()):
            raise CourtroomInputError("Bu hamle türü mevcut duruşma aşamasında kullanılamaz.")

        evidence = None
        if move.evidence_code:
            evidence = self._available_evidence_by_code(session, session.chosen_role, move.evidence_code)
            if evidence is None:
                raise CourtroomInputError("Bu delil seçtiğiniz role ait değil veya kullanılamıyor.")
            if move.action_type != "evidence":
                raise CourtroomInputError("Bir delil seçtiğinizde hamle türü 'delil sun' olmalıdır.")

        sequence = self.repo.next_sequence(session.id)
        structured = {"phase": session.phase.value}
        if evidence:
            structured["evidence_code"] = evidence.code
            structured["evidence_content"] = evidence.content
            session.presented_evidence_codes = self._append_unique(
                session.presented_evidence_codes, evidence.code
            )
            if evidence.authenticity_status in {"undisputed", "admitted"}:
                session.admitted_evidence_codes = self._append_unique(
                    session.admitted_evidence_codes, evidence.code
                )

        self.db.add(
            CourtroomTurn(
                session_id=session.id,
                sequence_number=sequence,
                actor=CourtroomActor.USER,
                legal_role=_legal_role(session.chosen_role),
                turn_type=CourtroomTurnType(move.action_type),
                content=move.content.strip(),
                evidence_id=evidence.id if evidence else None,
                client_request_id=move.client_request_id,
                structured_data=structured,
            )
        )
        session.current_actor = CourtroomActor.OPPONENT
        session.pending_judge_question = None
        session.error_message = None
        session.failure_category = None
        self.db.add(session)
        self.db.commit()
        return self.repo.get_session_for_user(session.id, session.law_firm_id, session.user_id)  # type: ignore[return-value]

    def process_pending_turn(self, session: CourtroomSession, provider: LLMProvider) -> CourtroomSession:
        if session.status != CourtroomSessionStatus.ACTIVE or session.current_actor != CourtroomActor.OPPONENT:
            raise CourtroomConflictError("İşlenecek bekleyen kullanıcı hamlesi yok.")

        sequence = self.repo.next_sequence(session.id)
        transcript = self._transcript(session)
        opponent_context = self._opponent_context(session)
        system_prompt, user_prompt = build_opponent_prompts(
            scenario_payload=opponent_context,
            opponent_role=session.opponent_role,
            transcript=transcript,
            phase=session.phase,
        )
        opponent_raw = provider_for(provider, "courtroom.opponent").complete(
            system_prompt, user_prompt, response_format="json_object"
        )
        opponent = parse_with_one_repair(provider, opponent_raw, OpponentOutput)
        # Referring to a document is not the same as formally presenting it.
        # Only accept the model's evidence_code during the evidence phase and
        # when it explicitly chose an evidence action.
        may_present_evidence = (
            session.phase == CourtroomPhase.EVIDENCE
            and opponent.action_type == "evidence"
            and opponent.evidence_code
        )
        opponent_evidence = (
            self._available_evidence_by_code(session, session.opponent_role, opponent.evidence_code)
            if may_present_evidence
            else None
        )

        if opponent_evidence:
            session.presented_evidence_codes = self._append_unique(
                session.presented_evidence_codes, opponent_evidence.code
            )
            if opponent_evidence.authenticity_status in {"undisputed", "admitted"}:
                session.admitted_evidence_codes = self._append_unique(
                    session.admitted_evidence_codes, opponent_evidence.code
                )

        opponent_turn = CourtroomTurn(
            session_id=session.id,
            sequence_number=sequence,
            actor=CourtroomActor.OPPONENT,
            legal_role=_legal_role(session.opponent_role),
            turn_type=CourtroomTurnType(opponent.action_type),
            content=self._clean_model_content(session, opponent.content),
            evidence_id=opponent_evidence.id if opponent_evidence else None,
            structured_data={
                "addressed_points": opponent.addressed_points,
                "requires_verification": True,
                "evidence_code_rejected": bool(opponent.evidence_code and not opponent_evidence),
            },
        )
        self.db.add(opponent_turn)
        self.db.flush()

        judge_transcript = transcript + [self._turn_prompt_row(opponent_turn)]
        public_context = self._public_context(session.scenario)
        evidence_record = self._evidence_record(
            session, admitted_only=session.phase == CourtroomPhase.CLOSING
        )

        if session.phase == CourtroomPhase.CLOSING:
            judge_system, judge_user = build_judge_final_prompts(
                scenario_payload=public_context,
                transcript=judge_transcript,
                evidence_record=evidence_record,
                chosen_role=session.chosen_role,
            )
            final_raw = provider_for(provider, "courtroom.judge_final").complete(
                judge_system, judge_user, response_format="json_object"
            )
            final = parse_with_one_repair(provider, final_raw, JudgeFinalOutput)
            total = (
                final.relevance_score
                + final.evidence_score
                + final.rebuttal_score
                + final.courtroom_strategy_score
            )
            evaluation = JudgeEvaluation(
                session_id=session.id,
                verdict=final.verdict,
                summary=self._clean_model_content(session, final.summary),
                reasoning=self._clean_model_content(session, final.reasoning),
                evidence_assessment=self._clean_model_list(session, final.evidence_assessment),
                unanswered_questions=self._clean_model_list(session, final.unanswered_questions),
                user_strengths=self._clean_model_list(session, final.user_strengths),
                user_weaknesses=self._clean_model_list(session, final.user_weaknesses),
                learning_notes=self._clean_model_list(session, final.learning_notes),
                relevance_score=final.relevance_score,
                evidence_score=final.evidence_score,
                rebuttal_score=final.rebuttal_score,
                courtroom_strategy_score=final.courtroom_strategy_score,
                total_score=total,
                confidence=final.confidence,
                requires_verification=True,
                disclaimer=TRAINING_DISCLAIMER,
            )
            self.db.add(evaluation)
            self.db.add(
                CourtroomTurn(
                    session_id=session.id,
                    sequence_number=sequence + 1,
                    actor=CourtroomActor.JUDGE,
                    legal_role="judge",
                    turn_type=CourtroomTurnType.VERDICT,
                    content=(
                        f"{self._clean_model_content(session, final.summary)}\n\n"
                        f"{self._clean_model_content(session, final.reasoning)}"
                    ),
                    structured_data={"verdict": final.verdict, "training_score": total},
                )
            )
            session.status = CourtroomSessionStatus.COMPLETED
            session.phase = CourtroomPhase.VERDICT
            session.current_actor = CourtroomActor.SYSTEM
            session.completed_at = datetime.now(timezone.utc)
        else:
            judge_system, judge_user = build_judge_interim_prompts(
                scenario_payload=public_context,
                transcript=judge_transcript,
                evidence_record=evidence_record,
                phase=session.phase,
            )
            judge_raw = provider_for(provider, "courtroom.judge_interim").complete(
                judge_system, judge_user, response_format="json_object"
            )
            judge = parse_with_one_repair(provider, judge_raw, JudgeInterimOutput)
            valid_codes = set(session.presented_evidence_codes)
            admitted = [code for code in judge.admitted_evidence_codes if code in valid_codes]
            rejected = [
                code for code in judge.rejected_evidence_codes if code in valid_codes and code not in admitted
            ]
            for code in admitted:
                session.admitted_evidence_codes = self._append_unique(session.admitted_evidence_codes, code)
                session.rejected_evidence_codes = [x for x in session.rejected_evidence_codes if x != code]
            for code in rejected:
                session.rejected_evidence_codes = self._append_unique(session.rejected_evidence_codes, code)
                session.admitted_evidence_codes = [x for x in session.admitted_evidence_codes if x != code]
            self.db.add(
                CourtroomTurn(
                    session_id=session.id,
                    sequence_number=sequence + 1,
                    actor=CourtroomActor.JUDGE,
                    legal_role="judge",
                    turn_type=self._judge_turn_type(judge),
                    content=self._clean_model_content(session, judge.content),
                    structured_data={
                        "action_type": judge.action_type,
                        "addressed_to": judge.addressed_to,
                        "admitted_evidence_codes": admitted,
                        "rejected_evidence_codes": rejected,
                        "requires_verification": True,
                    },
                )
            )
            session.pending_judge_question = (
                judge.content
                if judge.action_type == "question" and session.phase == CourtroomPhase.EVIDENCE
                else None
            )
            current_index = PHASE_SEQUENCE.index(session.phase)
            session.phase = PHASE_SEQUENCE[min(current_index + 1, len(PHASE_SEQUENCE) - 1)]
            session.round_number = min(session.round_number + 1, session.max_rounds)
            session.current_actor = CourtroomActor.USER

        self.db.add(session)
        self.db.commit()
        return self.repo.get_session_in_firm(session.id)  # type: ignore[return-value]

    def mark_failed(self, session: CourtroomSession, category: str, message: str) -> None:
        self.db.rollback()
        session = self.db.query(CourtroomSession).filter(CourtroomSession.id == session.id).first()
        if session is None:
            return
        session.status = CourtroomSessionStatus.FAILED
        session.current_actor = CourtroomActor.SYSTEM
        session.failure_category = category
        session.error_message = message
        self.db.add(
            CourtroomTurn(
                session_id=session.id,
                sequence_number=self.repo.next_sequence(session.id),
                actor=CourtroomActor.SYSTEM,
                legal_role="system",
                turn_type=CourtroomTurnType.ERROR,
                content="AI yanıtı üretilemedi. Oturum geçmişi korundu; tekrar deneyebilirsiniz.",
                structured_data={"failure_category": category},
            )
        )
        self.db.commit()

    def retry(self, session: CourtroomSession) -> CourtroomSession:
        if session.status != CourtroomSessionStatus.FAILED:
            raise CourtroomConflictError("Yalnızca başarısız bir tur tekrar denenebilir.")
        session.status = CourtroomSessionStatus.ACTIVE
        session.current_actor = CourtroomActor.OPPONENT
        session.failure_category = None
        session.error_message = None
        self.db.add(
            CourtroomTurn(
                session_id=session.id,
                sequence_number=self.repo.next_sequence(session.id),
                actor=CourtroomActor.SYSTEM,
                legal_role="system",
                turn_type=CourtroomTurnType.INSTRUCTION,
                content="Başarısız AI turu yeniden kuyruğa alındı.",
                structured_data={"retry": True},
            )
        )
        self.db.commit()
        return session

    def abandon(self, session: CourtroomSession) -> CourtroomSession:
        if session.status == CourtroomSessionStatus.COMPLETED:
            raise CourtroomConflictError("Tamamlanmış bir simülasyon terk edilemez.")
        session.status = CourtroomSessionStatus.ABANDONED
        session.current_actor = CourtroomActor.SYSTEM
        self.db.add(session)
        self.db.commit()
        return session

    def _available_evidence_by_code(
        self, session: CourtroomSession, role: CourtroomRole, code: Optional[str]
    ) -> Optional[ScenarioEvidence]:
        if not code:
            return None
        return next(
            (
                item
                for item in session.scenario.evidence
                if item.code == code
                and item.initially_available
                and item.owner_role in {role.value, "both"}
            ),
            None,
        )

    @staticmethod
    def _append_unique(values: list, value: str) -> list:
        return values if value in values else [*values, value]

    @staticmethod
    def _clean_model_content(session: CourtroomSession, content: str) -> str:
        """Keep backend markers and non-Turkish jury phrasing out of the UI."""
        cleaned = re.sub(
            r"Sayın\s+H[\u00e2a]kim\s*,\s*Sayın\s+Jüri\s*[,.]?",
            "Sayın Hâkim,",
            content,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"Sayın\s+Jüri\s*[,.]?", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.replace("<TRUSTED_EVIDENCE_RECORD>", "resmî delil")
        cleaned = cleaned.replace("</TRUSTED_EVIDENCE_RECORD>", "")
        cleaned = re.sub(r"</?(?:TRUSTED|UNTRUSTED)_[A-Z_]+>", "", cleaned)
        for item in session.scenario.evidence:
            cleaned = re.sub(rf"\b{re.escape(item.code)}\b", item.title, cleaned)
        return re.sub(r"[ \t]{2,}", " ", cleaned).strip()

    @classmethod
    def _clean_model_list(cls, session: CourtroomSession, values: list[str]) -> list[str]:
        return [cls._clean_model_content(session, value) for value in values]

    @staticmethod
    def _public_context(scenario: CourtroomScenario) -> dict:
        return {
            "title": scenario.title,
            "summary": scenario.summary,
            "plaintiff_name": scenario.plaintiff_name,
            "defendant_name": scenario.defendant_name,
            "public_facts": scenario.public_facts,
            "disputed_issues": scenario.disputed_issues,
            "legal_context": scenario.legal_context,
        }

    def _opponent_context(self, session: CourtroomSession) -> dict:
        private_brief = (
            session.scenario.plaintiff_private_brief
            if session.opponent_role == CourtroomRole.PLAINTIFF
            else session.scenario.defendant_private_brief
        )
        evidence = [
            {
                "code": item.code,
                "title": item.title,
                "description": item.description,
                "content": item.content,
                "authenticity_status": item.authenticity_status,
            }
            for item in session.scenario.evidence
            if item.initially_available and item.owner_role in {session.opponent_role.value, "both"}
        ]
        return {**self._public_context(session.scenario), "private_brief": private_brief, "available_evidence": evidence}

    def _evidence_record(self, session: CourtroomSession, admitted_only: bool = False) -> dict:
        presented = set(session.presented_evidence_codes)
        visible = set(session.admitted_evidence_codes) if admitted_only else presented
        return {
            "presented": [
                {
                    "code": item.code,
                    "title": item.title,
                    "content": item.content,
                    "authenticity_status": item.authenticity_status,
                }
                for item in session.scenario.evidence
                if item.code in visible
            ],
            "admitted_codes": session.admitted_evidence_codes,
            "rejected_codes": session.rejected_evidence_codes,
        }

    def _transcript(self, session: CourtroomSession) -> list[dict]:
        return [self._turn_prompt_row(turn) for turn in session.turns[-24:]]

    @staticmethod
    def _turn_prompt_row(turn: CourtroomTurn) -> dict:
        return {
            "sequence": turn.sequence_number,
            "actor": turn.actor.value,
            "role": turn.legal_role,
            "type": turn.turn_type.value,
            "content": turn.content,
            "evidence_code": turn.evidence.code if turn.evidence else None,
        }

    @staticmethod
    def _judge_turn_type(judge: JudgeInterimOutput) -> CourtroomTurnType:
        if judge.action_type == "question":
            return CourtroomTurnType.QUESTION
        if judge.action_type == "ruling":
            return CourtroomTurnType.RULING
        return CourtroomTurnType.FEEDBACK

    @staticmethod
    def scenario_out(scenario: CourtroomScenario) -> CourtroomScenarioOut:
        return CourtroomScenarioOut.model_validate(scenario)

    @staticmethod
    def summary_out(session: CourtroomSession) -> CourtroomSessionSummaryOut:
        return CourtroomSessionSummaryOut(
            id=session.id,
            scenario_id=session.scenario_id,
            scenario_title=session.scenario.title,
            chosen_role=session.chosen_role,
            status=session.status,
            phase=session.phase,
            current_actor=session.current_actor,
            round_number=session.round_number,
            max_rounds=session.max_rounds,
            total_score=session.evaluation.total_score if session.evaluation else None,
            is_demo=session.prompt_version == "showcase-v1",
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

    @classmethod
    def detail_out(cls, session: CourtroomSession) -> CourtroomSessionOut:
        private_brief = (
            session.scenario.plaintiff_private_brief
            if session.chosen_role == CourtroomRole.PLAINTIFF
            else session.scenario.defendant_private_brief
        )
        available = [
            ScenarioEvidenceOut(
                id=item.id,
                code=item.code,
                title=item.title,
                description=item.description,
                evidence_type=item.evidence_type,
                content=item.content,
                authenticity_status=item.authenticity_status,
            )
            for item in session.scenario.evidence
            if item.initially_available and item.owner_role in {session.chosen_role.value, "both"}
        ]
        turns = [
            CourtroomTurnOut(
                id=turn.id,
                sequence_number=turn.sequence_number,
                actor=turn.actor,
                legal_role=turn.legal_role,
                turn_type=turn.turn_type,
                content=turn.content,
                evidence_code=turn.evidence.code if turn.evidence else None,
                evidence_title=turn.evidence.title if turn.evidence else None,
                structured_data=turn.structured_data,
                created_at=turn.created_at,
            )
            for turn in session.turns
        ]
        return CourtroomSessionOut(
            **cls.summary_out(session).model_dump(),
            scenario=cls.scenario_out(session.scenario),
            role_brief=private_brief,
            available_evidence=available,
            turns=turns,
            pending_judge_question=session.pending_judge_question,
            presented_evidence_codes=session.presented_evidence_codes,
            admitted_evidence_codes=session.admitted_evidence_codes,
            rejected_evidence_codes=session.rejected_evidence_codes,
            error_message=session.error_message,
            failure_category=session.failure_category,
            model=session.model,
            prompt_version=session.prompt_version,
            evaluation=JudgeEvaluationOut.model_validate(session.evaluation) if session.evaluation else None,
        )
