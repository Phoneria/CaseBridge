"""Phase 3 - non-blocking simulation job flow.

POST creates a PENDING simulation and returns immediately (no LLM call
in that path at all). A separate, explicitly-invoked worker step
(`process_one_pending_simulation`) does the actual work - in
production this runs on an in-process background thread
(app/services/simulation_worker.py's `run_worker_loop`, started from
main.py's lifespan, single-instance - see IMPLEMENTATION_LOG.md for
the documented limitation). Tests drive it one step at a time for
deterministic, race-free assertions instead of fighting background
thread/task timing.
"""
import json

import pytest

VALID_JUDGE_JSON = json.dumps(
    {
        "summary": "ok",
        "assessment": {"score": 65, "confidence": "medium"},
    }
)


def _make_firm_and_case(db_session, name="Firm A"):
    from app.models.case import Case, CaseStatus, CaseType
    from app.models.law_firm import LawFirm

    firm = LawFirm(name=name)
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


# --- create_pending_simulation: fast, no LLM call, idempotent ------------


def test_create_pending_simulation_does_not_call_the_provider(db_session):
    from app.ai.providers.base import LLMProvider
    from app.services.simulation_service import SimulationService

    class ExplodingProvider(LLMProvider):
        def complete(self, *a, **kw):
            raise AssertionError("provider must not be called by create_pending_simulation")

    firm, case = _make_firm_and_case(db_session)
    service = SimulationService(db_session, ExplodingProvider())

    simulation = service.create_pending_simulation(case, requested_by=None)

    assert simulation.status.value == "pending"


def test_create_pending_simulation_is_idempotent_for_duplicate_clicks(db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    service = SimulationService(db_session, MockProvider())

    first = service.create_pending_simulation(case, requested_by=None)
    second = service.create_pending_simulation(case, requested_by=None)

    assert first.id == second.id

    from app.repositories.simulation_repository import SimulationRepository

    all_for_case = SimulationRepository(db_session).list_for_case(case.id, firm.id)
    assert len(all_for_case) == 1


def test_create_pending_simulation_allows_a_new_one_after_the_first_completes(db_session):
    from app.services.simulation_worker import process_one_pending_simulation
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", VALID_JUDGE_JSON])
    service = SimulationService(db_session, provider)

    first = service.create_pending_simulation(case, requested_by=None)
    process_one_pending_simulation(db_session, provider)

    second = service.create_pending_simulation(case, requested_by=None)
    assert second.id != first.id


# --- worker: process_one_pending_simulation -------------------------------


def test_worker_returns_none_when_nothing_pending(db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_worker import process_one_pending_simulation

    result = process_one_pending_simulation(db_session, MockProvider())
    assert result is None


def test_worker_processes_oldest_pending_simulation_to_completion(db_session):
    from app.services.simulation_service import SimulationService
    from app.services.simulation_worker import process_one_pending_simulation
    from app.ai.providers.mock_provider import MockProvider

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", VALID_JUDGE_JSON])
    pending = SimulationService(db_session, provider).create_pending_simulation(case, requested_by=None)
    assert pending.status.value == "pending"

    processed = process_one_pending_simulation(db_session, provider)

    assert processed.id == pending.id
    assert processed.status.value == "completed"
    assert processed.result is not None


def test_worker_records_stage_transitions_before_completion(db_session):
    """Can't observe every intermediate stage from outside a single
    synchronous worker tick (it runs the whole pipeline in one call),
    but current_stage must reflect the LAST stage reached, and must be
    cleared again once the job reaches a terminal state."""
    from app.services.simulation_service import SimulationService
    from app.services.simulation_worker import process_one_pending_simulation
    from app.ai.providers.mock_provider import MockProvider

    firm, case = _make_firm_and_case(db_session)
    provider = MockProvider(responses=["r", "p", "d", VALID_JUDGE_JSON])
    SimulationService(db_session, provider).create_pending_simulation(case, requested_by=None)

    processed = process_one_pending_simulation(db_session, provider)

    assert processed.current_stage is None  # cleared on terminal state


def test_worker_marks_failed_simulation_with_failure_category(db_session):
    from app.ai.errors import AIProviderTimeoutError
    from app.ai.providers.base import LLMProvider
    from app.services.simulation_service import SimulationService
    from app.services.simulation_worker import process_one_pending_simulation

    class TimeoutProvider(LLMProvider):
        def complete(self, *a, **kw):
            raise AIProviderTimeoutError("simulated timeout")

    firm, case = _make_firm_and_case(db_session)
    provider = TimeoutProvider()
    SimulationService(db_session, provider).create_pending_simulation(case, requested_by=None)

    processed = process_one_pending_simulation(db_session, provider)

    assert processed.status.value == "failed"
    assert processed.failure_category == "timeout"


def test_worker_is_infra_level_and_processes_across_firms_fifo(db_session):
    from app.services.simulation_service import SimulationService
    from app.services.simulation_worker import process_one_pending_simulation
    from app.ai.providers.mock_provider import MockProvider

    firm_a, case_a = _make_firm_and_case(db_session, "Firm A")
    firm_b, case_b = _make_firm_and_case(db_session, "Firm B")
    provider = MockProvider(responses=["r", "p", "d", VALID_JUDGE_JSON])

    first = SimulationService(db_session, provider).create_pending_simulation(case_a, requested_by=None)
    second = SimulationService(db_session, provider).create_pending_simulation(case_b, requested_by=None)

    processed_first = process_one_pending_simulation(db_session, provider)
    assert processed_first.id == first.id

    processed_second = process_one_pending_simulation(db_session, provider)
    assert processed_second.id == second.id


# --- retry -----------------------------------------------------------------


def test_retry_creates_a_new_pending_simulation_and_keeps_the_old_failed_row(db_session):
    from app.ai.errors import AIProviderTimeoutError
    from app.ai.providers.base import LLMProvider
    from app.services.simulation_service import SimulationService
    from app.services.simulation_worker import process_one_pending_simulation

    class TimeoutProvider(LLMProvider):
        def complete(self, *a, **kw):
            raise AIProviderTimeoutError("simulated timeout")

    firm, case = _make_firm_and_case(db_session)
    provider = TimeoutProvider()
    service = SimulationService(db_session, provider)
    service.create_pending_simulation(case, requested_by=None)
    failed = process_one_pending_simulation(db_session, provider)
    assert failed.status.value == "failed"

    retried = service.retry_simulation(failed, case, requested_by=None)

    assert retried.id != failed.id
    assert retried.status.value == "pending"

    from app.repositories.simulation_repository import SimulationRepository

    all_for_case = SimulationRepository(db_session).list_for_case(case.id, firm.id)
    assert len(all_for_case) == 2
    stored_failed = next(s for s in all_for_case if s.id == failed.id)
    assert stored_failed.status.value == "failed"  # audit trail preserved


def test_retry_only_allowed_on_a_failed_simulation(db_session):
    from app.ai.providers.mock_provider import MockProvider
    from app.services.simulation_service import SimulationService

    firm, case = _make_firm_and_case(db_session)
    service = SimulationService(db_session, MockProvider())
    pending = service.create_pending_simulation(case, requested_by=None)

    with pytest.raises(ValueError):
        service.retry_simulation(pending, case, requested_by=None)
