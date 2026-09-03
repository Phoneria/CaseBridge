"""Persistent state for interactive, turn-based courtroom training.

This is intentionally separate from ``Simulation``: the existing model
represents a one-shot case analysis job, while these records represent a
multi-turn training session that can be resumed and audited.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class ScenarioDifficulty(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class CourtroomRole(str, enum.Enum):
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"


class CourtroomSessionStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"
    ABANDONED = "abandoned"


class CourtroomPhase(str, enum.Enum):
    OPENING = "opening"
    MAIN_ARGUMENTS = "main_arguments"
    EVIDENCE = "evidence"
    EXAMINATION = "examination"
    REBUTTAL = "rebuttal"
    CLOSING = "closing"
    VERDICT = "verdict"


class CourtroomActor(str, enum.Enum):
    USER = "user"
    OPPONENT = "opponent"
    JUDGE = "judge"
    SYSTEM = "system"


class CourtroomTurnType(str, enum.Enum):
    INSTRUCTION = "instruction"
    OPENING = "opening"
    ARGUMENT = "argument"
    REBUTTAL = "rebuttal"
    EVIDENCE = "evidence"
    OBJECTION = "objection"
    QUESTION = "question"
    ANSWER = "answer"
    RULING = "ruling"
    CLOSING = "closing"
    VERDICT = "verdict"
    FEEDBACK = "feedback"
    ERROR = "error"


class CourtroomScenario(Base):
    __tablename__ = "courtroom_scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    plaintiff_name: Mapped[str] = mapped_column(String(255), nullable=False)
    defendant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    difficulty: Mapped[ScenarioDifficulty] = mapped_column(str_enum(ScenarioDifficulty), nullable=False)
    estimated_rounds: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    learning_objectives: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    public_facts: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    disputed_issues: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    plaintiff_private_brief: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    defendant_private_brief: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    judge_instructions: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    legal_context: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    evidence: Mapped[list["ScenarioEvidence"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan", order_by="ScenarioEvidence.sort_order"
    )


class ScenarioEvidence(Base):
    __tablename__ = "scenario_evidence"
    __table_args__ = (UniqueConstraint("scenario_id", "code", name="uq_scenario_evidence_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courtroom_scenarios.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(80), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    owner_role: Mapped[str] = mapped_column(String(20), nullable=False)
    initially_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    authenticity_status: Mapped[str] = mapped_column(String(40), default="undisputed", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    scenario: Mapped["CourtroomScenario"] = relationship(back_populates="evidence")


class CourtroomSession(Base):
    __tablename__ = "courtroom_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courtroom_scenarios.id"), nullable=False, index=True
    )
    law_firm_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("law_firms.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    chosen_role: Mapped[CourtroomRole] = mapped_column(str_enum(CourtroomRole), nullable=False)
    opponent_role: Mapped[CourtroomRole] = mapped_column(str_enum(CourtroomRole), nullable=False)
    status: Mapped[CourtroomSessionStatus] = mapped_column(
        str_enum(CourtroomSessionStatus), default=CourtroomSessionStatus.ACTIVE, nullable=False
    )
    phase: Mapped[CourtroomPhase] = mapped_column(
        str_enum(CourtroomPhase), default=CourtroomPhase.OPENING, nullable=False
    )
    current_actor: Mapped[CourtroomActor] = mapped_column(
        str_enum(CourtroomActor), default=CourtroomActor.USER, nullable=False
    )
    round_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_rounds: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    pending_judge_question: Mapped[str] = mapped_column(Text, nullable=True)
    presented_evidence_codes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    admitted_evidence_codes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    rejected_evidence_codes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    failure_category: Mapped[str] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(20), nullable=False, default="courtroom-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    scenario: Mapped["CourtroomScenario"] = relationship()
    turns: Mapped[list["CourtroomTurn"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="CourtroomTurn.sequence_number"
    )
    evaluation: Mapped["JudgeEvaluation"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class CourtroomTurn(Base):
    __tablename__ = "courtroom_turns"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence_number", name="uq_courtroom_turn_sequence"),
        UniqueConstraint("session_id", "client_request_id", name="uq_courtroom_turn_request"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courtroom_sessions.id"), nullable=False, index=True
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    actor: Mapped[CourtroomActor] = mapped_column(str_enum(CourtroomActor), nullable=False)
    legal_role: Mapped[str] = mapped_column(String(40), nullable=False)
    turn_type: Mapped[CourtroomTurnType] = mapped_column(str_enum(CourtroomTurnType), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_id: Mapped[str] = mapped_column(String(36), ForeignKey("scenario_evidence.id"), nullable=True)
    client_request_id: Mapped[str] = mapped_column(String(64), nullable=True)
    structured_data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    session: Mapped["CourtroomSession"] = relationship(back_populates="turns")
    evidence: Mapped["ScenarioEvidence"] = relationship()


class JudgeEvaluation(Base):
    __tablename__ = "judge_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courtroom_sessions.id"), nullable=False, unique=True, index=True
    )
    verdict: Mapped[str] = mapped_column(String(30), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_assessment: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    unanswered_questions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    user_strengths: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    user_weaknesses: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    learning_notes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    relevance_score: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence_score: Mapped[int] = mapped_column(Integer, nullable=False)
    rebuttal_score: Mapped[int] = mapped_column(Integer, nullable=False)
    courtroom_strategy_score: Mapped[int] = mapped_column(Integer, nullable=False)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False)
    requires_verification: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    disclaimer: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    session: Mapped["CourtroomSession"] = relationship(back_populates="evaluation")
