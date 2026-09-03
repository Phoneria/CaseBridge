"""Simulation orchestration service (Phase 3 - non-blocking jobs).

Two-phase, queue-shaped flow instead of one blocking call:
  1. `create_pending_simulation` - fast, synchronous, NEVER calls the
     LLM provider. Creates a PENDING row and returns immediately, or
     returns the existing PENDING/RUNNING simulation for the case if
     one is already in flight (idempotent - duplicate clicks never
     create a second job). This is what the POST endpoint calls.
  2. `execute_pending_simulation` - the actual 4-agent pipeline run
     (builds case context, calls the provider, persists the terminal
     state). Called by the worker (app/services/simulation_worker.py),
     never directly from an HTTP request handler.

A simulation always ends up in a terminal, auditable state: COMPLETED
with a stored AIAnalysis, or FAILED with an error_message and a safe
failure_category - never silently lost (section 22).
"""
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.context_builder import CaseContextBuilder
from app.ai.engine import PROMPT_VERSION, run_simulation
from app.ai.errors import (
    AIProviderConfigError,
    AIProviderError,
    AIProviderTimeoutError,
    AIResponseValidationError,
)
from app.ai.providers.base import LLMProvider
from app.ai.schemas import AIAnalysisResult, Assessment
from app.core.config import settings
from app.models.case import Case
from app.models.simulation import AIAnalysis, AnalysisType, Simulation, SimulationStatus
from app.repositories.simulation_repository import SimulationRepository
from app.schemas.simulation import SimulationOut


class SimulationFailedError(Exception):
    """Raised by `execute_pending_simulation` when a simulation could
    not complete - the Simulation row is always persisted as FAILED
    (with error_message and failure_category) before this is raised,
    so the failure is never silently lost. The API layer's retry
    endpoint is the user-facing recovery path, not automatic retries
    inside this call."""


def _current_provider_and_model() -> tuple[str, str]:
    """The provider/model actually selected by configuration (section
    27) - read from settings rather than introspecting the injected
    LLMProvider instance, since MockProvider/OpenAIProvider/QwenProvider
    don't uniformly expose a public model name."""
    provider_name = settings.llm_provider
    if provider_name == "qwen":
        return provider_name, settings.qwen_model
    if provider_name == "openai":
        return provider_name, settings.openai_model
    if provider_name == "ollama":
        return provider_name, settings.ollama_model
    return provider_name, "mock"


def _categorize_failure(exc: Exception) -> str:
    """Safe, coarse failure category for the terminal row - never the
    raw exception text (that already-safe message lives in
    error_message; this is a small closed vocabulary for filtering/
    metrics)."""
    if isinstance(exc, AIProviderConfigError):
        return "config_error"
    if isinstance(exc, AIProviderTimeoutError):
        return "timeout"
    if isinstance(exc, AIResponseValidationError):
        return "validation_error"
    if isinstance(exc, AIProviderError):
        return "provider_error"
    return "unknown_error"


class SimulationService:
    def __init__(self, db: Session, provider: Optional[LLMProvider] = None):
        self.db = db
        self.provider = provider
        self.simulations = SimulationRepository(db)

    # --- phase 1: fast, synchronous, no LLM call ---------------------

    def create_pending_simulation(self, case: Case, requested_by: Optional[str]) -> Simulation:
        existing = self.simulations.get_active_for_case(case.id, case.law_firm_id)
        if existing is not None:
            return existing

        provider_name, model_name = _current_provider_and_model()
        simulation = Simulation(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            status=SimulationStatus.PENDING,
            requested_by=requested_by,
            provider=provider_name,
            model=model_name,
            prompt_version=PROMPT_VERSION,
        )
        return self.simulations.create(simulation)

    def retry_simulation(self, failed_simulation: Simulation, case: Case, requested_by: Optional[str]) -> Simulation:
        """Creates a NEW pending simulation - the failed row stays in
        place, unmodified, as an auditable record of what failed and
        why. Only allowed on a simulation currently in FAILED state."""
        if failed_simulation.status != SimulationStatus.FAILED:
            raise ValueError("Only a failed simulation can be retried.")

        provider_name, model_name = _current_provider_and_model()
        simulation = Simulation(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            status=SimulationStatus.PENDING,
            requested_by=requested_by,
            provider=provider_name,
            model=model_name,
            prompt_version=PROMPT_VERSION,
        )
        return self.simulations.create(simulation)

    # --- phase 2: the actual pipeline run - called by the worker -----

    def execute_pending_simulation(self, simulation: Simulation, case: Case) -> Simulation:
        simulation.status = SimulationStatus.RUNNING
        self.simulations.save(simulation)

        case_context = CaseContextBuilder(self.db).build(case)
        simulation.context_version = case_context.get("context_version")

        def _on_stage(stage: str) -> None:
            simulation.current_stage = stage
            self.simulations.save(simulation)

        start = time.perf_counter()
        try:
            result = run_simulation(case_context, self.provider, on_stage=_on_stage)
        except (AIProviderError, AIResponseValidationError) as exc:
            simulation.status = SimulationStatus.FAILED
            simulation.current_stage = None
            simulation.error_message = str(exc)
            simulation.failure_category = _categorize_failure(exc)
            simulation.duration_ms = (time.perf_counter() - start) * 1000
            simulation.completed_at = datetime.now(timezone.utc)
            self.simulations.save(simulation)
            raise SimulationFailedError(str(exc)) from exc

        simulation.duration_ms = (time.perf_counter() - start) * 1000
        usage = getattr(self.provider, "last_usage", None)
        if usage:
            simulation.prompt_tokens = usage.get("prompt_tokens")
            simulation.completion_tokens = usage.get("completion_tokens")
            simulation.total_tokens = usage.get("total_tokens")

        analysis = AIAnalysis(
            case_id=case.id,
            simulation_id=simulation.id,
            law_firm_id=case.law_firm_id,
            analysis_type=AnalysisType.SIMULATION_REPORT,
            summary=result.summary,
            strong_points=result.strong_points,
            weak_points=result.weak_points,
            opposing_arguments=result.opposing_arguments,
            missing_information=result.missing_information,
            possible_scenarios=result.possible_scenarios,
            questions=result.questions,
            recommended_actions=result.recommended_actions,
            assessment_score=result.assessment.score,
            assessment_confidence=result.assessment.confidence,
            ai_disclaimer=result.ai_disclaimer,
            requires_verification=result.requires_verification,
        )
        self.db.add(analysis)

        simulation.status = SimulationStatus.COMPLETED
        simulation.current_stage = None
        simulation.completed_at = datetime.now(timezone.utc)
        self.simulations.save(simulation)
        self.db.refresh(simulation)
        return simulation

    # --- reads -----------------------------------------------------------

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[Simulation]:
        return self.simulations.list_for_case(case_id, law_firm_id)

    def get(self, simulation_id: str, law_firm_id: str) -> Optional[Simulation]:
        return self.simulations.get_by_id_in_firm(simulation_id, law_firm_id)

    def list_for_firm_with_case(self, law_firm_id: str):
        return self.simulations.list_for_firm_with_case(law_firm_id)

    @staticmethod
    def to_out(simulation: Simulation) -> SimulationOut:
        result_out = None
        if simulation.result is not None:
            analysis = simulation.result
            result_out = AIAnalysisResult(
                summary=analysis.summary,
                strong_points=analysis.strong_points,
                weak_points=analysis.weak_points,
                opposing_arguments=analysis.opposing_arguments,
                missing_information=analysis.missing_information,
                possible_scenarios=analysis.possible_scenarios,
                questions=analysis.questions,
                recommended_actions=analysis.recommended_actions,
                assessment=Assessment(
                    score=analysis.assessment_score, confidence=analysis.assessment_confidence.value
                ),
                ai_disclaimer=analysis.ai_disclaimer,
                requires_verification=analysis.requires_verification,
            )
        return SimulationOut(
            id=simulation.id,
            case_id=simulation.case_id,
            status=simulation.status,
            error_message=simulation.error_message,
            started_at=simulation.started_at,
            completed_at=simulation.completed_at,
            result=result_out,
            provider=simulation.provider,
            model=simulation.model,
            prompt_version=simulation.prompt_version,
            context_version=simulation.context_version,
            duration_ms=simulation.duration_ms,
            prompt_tokens=simulation.prompt_tokens,
            completion_tokens=simulation.completion_tokens,
            total_tokens=simulation.total_tokens,
            failure_category=simulation.failure_category,
            current_stage=simulation.current_stage,
        )
