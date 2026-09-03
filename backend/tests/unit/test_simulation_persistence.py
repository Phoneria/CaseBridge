"""Simulation run metadata persistence (Phase 2): every simulation must
record which provider/model/prompt-version/context-version produced
it, how long it took, token usage when the provider reports it, and -
on failure - a safe failure category. Never persists chain-of-thought
(there is no such column/field anywhere on Simulation/AIAnalysis)."""
from datetime import date

import pytest


def _make_firm_and_case(db_session):
    from app.models.case import Case, CaseStatus, CaseType
    from app.models.law_firm import LawFirm

    firm = LawFirm(name="Firm A")
    db_session.add(firm)
    db_session.flush()
    case = Case(
        law_firm_id=firm.id,
        case_number="2026/1",
        case_name="Test Davası",
        client_name="Test Müşteri",
        case_type=CaseType.DIGER,
        status=CaseStatus.DEVAM_EDEN,
    )
    db_session.add(case)
    db_session.flush()
    return firm, case


def _run_sync(service, case):
    """Phase 3 split SimulationService into create_pending_simulation +
    execute_pending_simulation; this test file predates that split and
    exercises persistence behavior synchronously, so drive both phases
    back-to-back here rather than duplicating the split across every
    test."""
    pending = service.create_pending_simulation(case, requested_by=None)
    return service.execute_pending_simulation(pending, case)


def _valid_judge_json():
    import json

    return json.dumps(
        {
            "summary": "ok",
            "assessment": {"score": 50, "confidence": "medium"},
        }
    )


def test_completed_simulation_persists_provider_and_model(db_session, monkeypatch):
    from app.ai.providers.mock_provider import MockProvider
    from app.core.config import settings
    from app.services.simulation_service import SimulationService

    monkeypatch.setattr(settings, "llm_provider", "mock")
    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", _valid_judge_json()])

    simulation = _run_sync(SimulationService(db_session, provider), case)

    assert simulation.provider == "mock"
    assert simulation.model == "mock"


def test_completed_simulation_persists_prompt_and_context_version(db_session):
    from app.ai.context_builder import CONTEXT_BUILDER_VERSION
    from app.ai.engine import PROMPT_VERSION
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", _valid_judge_json()])

    simulation = _run_sync(SimulationService(db_session, provider), case)

    assert simulation.context_version == CONTEXT_BUILDER_VERSION
    assert simulation.prompt_version == PROMPT_VERSION


def test_completed_simulation_persists_duration_ms(db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", _valid_judge_json()])

    simulation = _run_sync(SimulationService(db_session, provider), case)

    assert simulation.duration_ms is not None
    assert simulation.duration_ms >= 0


def test_completed_simulation_persists_token_usage_when_reported(db_session):
    from app.ai.providers.base import LLMProvider
    from app.services.simulation_service import SimulationService

    class UsageReportingProvider(LLMProvider):
        def __init__(self, responses):
            self._responses = responses
            self._i = -1
            self.last_usage = None
            self.last_latency_ms = 12.5

        def complete(self, system_prompt, user_prompt, *, response_format=None):
            self._i += 1
            self.last_usage = {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
            return self._responses[self._i]

    firm, case = _make_firm_and_case(db_session)
    provider = UsageReportingProvider(["r", "p", "d", _valid_judge_json()])

    simulation = _run_sync(SimulationService(db_session, provider), case)

    assert simulation.prompt_tokens == 100
    assert simulation.completion_tokens == 50
    assert simulation.total_tokens == 150


def test_completed_simulation_token_usage_is_none_when_not_reported(db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", _valid_judge_json()])

    simulation = _run_sync(SimulationService(db_session, provider), case)

    assert simulation.prompt_tokens is None
    assert simulation.total_tokens is None


def test_failed_simulation_persists_timeout_failure_category(db_session):
    from app.ai.errors import AIProviderTimeoutError
    from app.ai.providers.base import LLMProvider
    from app.services.simulation_service import SimulationFailedError, SimulationService

    class TimeoutProvider(LLMProvider):
        def complete(self, system_prompt, user_prompt, *, response_format=None):
            raise AIProviderTimeoutError("simulated timeout")

    firm, case = _make_firm_and_case(db_session)
    service = SimulationService(db_session, TimeoutProvider())

    with pytest.raises(SimulationFailedError):
        _run_sync(service, case)

    from app.repositories.simulation_repository import SimulationRepository

    stored = SimulationRepository(db_session).list_for_case(case.id, firm.id)[0]
    assert stored.failure_category == "timeout"


def test_failed_simulation_persists_validation_error_failure_category(db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationFailedError, SimulationService

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", "not valid json"])
    service = SimulationService(db_session, provider)

    with pytest.raises(SimulationFailedError):
        _run_sync(service, case)

    from app.repositories.simulation_repository import SimulationRepository

    stored = SimulationRepository(db_session).list_for_case(case.id, firm.id)[0]
    assert stored.failure_category == "validation_error"


def test_case_context_builder_is_actually_used_by_simulation(db_session):
    """Guards against CaseContextBuilder being built-but-unwired: seed a
    case event with a marker title and confirm it reaches the
    researcher agent's prompt via MockProvider.calls."""
    from app.models.case import CaseEvent, CaseEventType
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    event = CaseEvent(
        case_id=case.id,
        law_firm_id=firm.id,
        event_date=date(2026, 1, 1),
        title="MARKER_OLAY_XYZ",
        event_type=CaseEventType.OTHER,
    )
    db_session.add(event)
    db_session.flush()

    provider = MockProvider(responses=["r", "p", "d", _valid_judge_json()])
    _run_sync(SimulationService(db_session, provider), case)

    assert "MARKER_OLAY_XYZ" in provider.calls[0]["user_prompt"]
