"""In-process simulation job worker (Phase 3).

Chosen architecture: the smallest dependable option for this
repository's current scale (single FastAPI process, SQLite/soon-
Postgres, one deployment instance) - a background thread inside the
same process that polls for PENDING Simulation rows and runs them one
at a time via SimulationService.execute_pending_simulation.

LIMITATIONS (documented, not hidden):
  - Single-instance only. If the app is ever run as more than one
    process/pod, EACH instance runs its own worker thread and they
    will race to pick up the same PENDING rows (SQLite/most DBs won't
    stop two processes from both reading the same "oldest pending" row
    before either writes RUNNING). This is safe for the current
    single-instance deployment model; running multiple instances needs
    either a real job queue (Celery/RQ/arq + Redis, or a DB-level
    `SELECT ... FOR UPDATE SKIP LOCKED`) or a leader-election /
    single-worker-instance constraint. Do not scale this out as-is.
  - No retry-with-backoff on transient infra failures (DB hiccups) -
    a raised, uncaught exception during one tick just gets logged and
    the loop continues to the next tick; the affected simulation could
    be left RUNNING forever if the crash happened mid-execution. An
    explicit user-facing retry endpoint (SimulationService.
    retry_simulation) is the recovery path, not automatic requeueing.
  - Processes exactly one job per tick, serially - no concurrency. Chosen
    deliberately for MVP simplicity and to keep AI provider rate limits
    predictable; revisit if simulation volume ever makes this a
    bottleneck.

The worker thread is NOT started during automated tests
(settings.env == "test" - see app/main.py's lifespan) - tests call
`process_one_pending_simulation` directly for deterministic, race-free
control instead.
"""
import logging
import threading
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.providers.base import LLMProvider
from app.db.session import SessionLocal
from app.models.case import Case
from app.models.simulation import Simulation, SimulationStatus
from app.repositories.simulation_repository import SimulationRepository
from app.services.simulation_service import SimulationFailedError, SimulationService

logger = logging.getLogger("casebridge")

DEFAULT_POLL_INTERVAL_SECONDS = 2.0


def process_one_pending_simulation(db: Session, provider: LLMProvider) -> Optional[Simulation]:
    """Does at most one unit of work: picks the oldest PENDING
    simulation (across all firms - this is infra-level, not a
    tenant-scoped read) and runs it to a terminal state. Returns the
    processed Simulation, or None if the queue is empty. Exceptions
    from a single job are caught here so one bad job can never kill the
    worker loop - the job itself is already persisted as FAILED by
    SimulationService before this catches anything."""
    simulation = SimulationRepository(db).get_oldest_pending()
    if simulation is None:
        return None

    case = db.query(Case).filter(Case.id == simulation.case_id).first()
    if case is None:
        # Data integrity edge case (case deleted after simulation was
        # queued) - fail the row safely rather than crash the worker.
        simulation.status = SimulationStatus.FAILED
        simulation.failure_category = "case_not_found"
        simulation.error_message = "The case for this simulation no longer exists."
        db.add(simulation)
        db.commit()
        return simulation

    service = SimulationService(db, provider)
    try:
        service.execute_pending_simulation(simulation, case)
    except SimulationFailedError:
        pass  # already persisted as FAILED by execute_pending_simulation
    except Exception:
        logger.exception("Unexpected error while processing simulation %s", simulation.id)
    return simulation


def run_worker_loop(
    provider_factory,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    stop_event: Optional[threading.Event] = None,
) -> None:
    """Runs forever (until stop_event is set) on its own DB session per
    tick - never shares a session with request-handling code. Intended
    to be started as a single daemon thread from app.main's lifespan."""
    stop_event = stop_event or threading.Event()
    while not stop_event.is_set():
        db = SessionLocal()
        try:
            provider = provider_factory()
            processed = process_one_pending_simulation(db, provider)
        except Exception:
            logger.exception("Simulation worker tick failed")
            processed = None
        finally:
            db.close()

        if processed is None:
            stop_event.wait(poll_interval_seconds)


def start_worker_thread(provider_factory, poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS) -> threading.Event:
    """Starts the worker loop on a daemon thread and returns the
    stop_event so callers (app.main's lifespan, on shutdown) can signal
    it to stop cleanly."""
    stop_event = threading.Event()
    thread = threading.Thread(
        target=run_worker_loop,
        args=(provider_factory, poll_interval_seconds, stop_event),
        daemon=True,
        name="casebridge-simulation-worker",
    )
    thread.start()
    return stop_event
