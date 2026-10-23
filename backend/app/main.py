import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.security_headers import SecurityHeadersMiddleware

from app.api.routes import activity, admin, analytics, auth, calendar, case_intake, cases, chat, courtroom, documents, handover, health, notifications, precedents, reports, simulations, system, tasks, users
from app.ai.provider_factory import get_ai_provider_status, get_courtroom_provider, get_llm_provider
from app.core.config import settings
from app.services.simulation_worker import start_worker_thread
from app.services.courtroom_worker import start_courtroom_worker_thread
from app.services.reminder_worker import should_start_reminder_worker, start_reminder_worker_thread

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("casebridge")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The schema comes from Alembic (`alembic upgrade head`), never from
    # create_all(): tables it creates are missing from alembic_version.
    ai_status = get_ai_provider_status()
    if ai_status["configured"]:
        logger.info("AI provider ready: %s", ai_status["provider"])
    elif ai_status["provider"] == "mock":
        logger.info("AI features running on MockProvider (LLM_PROVIDER=mock).")
    else:
        # A real provider was selected but is misconfigured - this must be
        # visible at startup, never silently degraded to MockProvider.
        logger.error("AI provider misconfigured: %s", ai_status["error"])

    # Phase 3 - in-process simulation worker. NOT started during
    # automated tests: tests drive process_one_pending_simulation
    # directly for deterministic, race-free control (and to avoid a
    # background thread reading a *different* DB connection than the
    # test's in-memory db_session - see
    # app/services/simulation_worker.py's module docstring for the
    # single-instance limitation this architecture accepts).
    worker_stop_event = None
    courtroom_worker_stop_event = None
    if settings.env != "test":
        worker_stop_event = start_worker_thread(provider_factory=get_llm_provider)
        logger.info("Simulation worker thread started.")
        courtroom_worker_stop_event = start_courtroom_worker_thread(
            provider_factory=get_courtroom_provider
        )
        logger.info("Courtroom worker thread started.")

    # E-mail reminders: same rule as the workers above (never in tests),
    # and REMINDERS_ENABLED=false turns it off.
    reminder_stop_event = None
    if should_start_reminder_worker():
        reminder_stop_event = start_reminder_worker_thread()
        logger.info("Reminder worker thread started.")

    yield

    if worker_stop_event is not None:
        worker_stop_event.set()
    if courtroom_worker_stop_event is not None:
        courtroom_worker_stop_event.set()
    if reminder_stop_event is not None:
        reminder_stop_event.set()


app = FastAPI(title="CaseBridge", version="0.1.0", lifespan=lifespan)

# MVP: allow the local Next.js dev server to call the API. Tighten this
# to an explicit allow-list of real frontend origins before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(cases.router)
app.include_router(case_intake.router)
app.include_router(precedents.router)
app.include_router(documents.cases_router)
app.include_router(documents.documents_router)
app.include_router(simulations.router)
app.include_router(simulations.global_router)
app.include_router(courtroom.router)
app.include_router(analytics.router)
app.include_router(handover.router)
app.include_router(tasks.cases_router)
app.include_router(tasks.tasks_router)
app.include_router(activity.router)
app.include_router(reports.router)
app.include_router(system.router)
app.include_router(calendar.router)
app.include_router(chat.router)
app.include_router(notifications.router)
