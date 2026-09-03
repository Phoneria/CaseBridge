import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class SimulationStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisType(str, enum.Enum):
    CASE_SUMMARY = "case_summary"
    SIMULATION_REPORT = "simulation_report"
    HANDOVER_SUMMARY = "handover_summary"


class AssessmentConfidence(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Simulation(Base):
    __tablename__ = "simulations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    status: Mapped[SimulationStatus] = mapped_column(
        str_enum(SimulationStatus), default=SimulationStatus.PENDING, nullable=False
    )
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    requested_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    # Run metadata (Phase 2, section 12) - auditability: which provider/
    # model/prompt/context version produced (or failed to produce) this
    # result, how long it took, and token usage when the provider
    # reports it. Never a chain-of-thought/reasoning field - providers
    # (see app/ai/providers/qwen_provider.py) never expose that.
    provider: Mapped[str] = mapped_column(String(50), nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(20), nullable=True)
    context_version: Mapped[str] = mapped_column(String(20), nullable=True)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=True)
    # Safe, coarse failure category (e.g. "timeout", "provider_error",
    # "validation_error", "config_error") - never the raw exception
    # message (that stays in error_message, which is already a
    # provider-supplied safe string, never SDK internals - see
    # app/ai/providers/*.py).
    failure_category: Mapped[str] = mapped_column(String(30), nullable=True)

    # Phase 3 - non-blocking job progress. One of "research", "plaintiff",
    # "defendant", "judge", "validation" while status=RUNNING; None
    # otherwise (PENDING/COMPLETED/FAILED).
    current_stage: Mapped[str] = mapped_column(String(20), nullable=True)

    result: Mapped["AIAnalysis"] = relationship(
        back_populates="simulation", uselist=False, cascade="all, delete-orphan"
    )


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id"), nullable=True, unique=True
    )
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)

    analysis_type: Mapped[AnalysisType] = mapped_column(str_enum(AnalysisType), nullable=False)

    summary: Mapped[str] = mapped_column(Text, nullable=False)
    strong_points: Mapped[list] = mapped_column(JSON, default=list)
    weak_points: Mapped[list] = mapped_column(JSON, default=list)
    opposing_arguments: Mapped[list] = mapped_column(JSON, default=list)
    missing_information: Mapped[list] = mapped_column(JSON, default=list)
    possible_scenarios: Mapped[list] = mapped_column(JSON, default=list)
    questions: Mapped[list] = mapped_column(JSON, default=list)
    recommended_actions: Mapped[list] = mapped_column(JSON, default=list)

    assessment_score: Mapped[int] = mapped_column(Integer, nullable=False)
    assessment_confidence: Mapped[AssessmentConfidence] = mapped_column(
        str_enum(AssessmentConfidence), nullable=False
    )
    ai_disclaimer: Mapped[str] = mapped_column(Text, nullable=False)
    requires_verification: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    simulation: Mapped["Simulation"] = relationship(back_populates="result")
