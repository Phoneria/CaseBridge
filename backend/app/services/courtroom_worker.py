"""Single-process worker for interactive courtroom turns.

Each user move is committed by the request handler and processed here so
the HTTP request stays quick even when the local model needs a while.
Like the existing simulation worker, this is deliberately a one-process
MVP queue; multi-instance deployments should replace it with a real job
queue or database row locking.
"""
import logging
import threading
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.errors import AIProviderError, AIProviderTimeoutError, AIResponseValidationError
from app.ai.providers.base import LLMProvider
from app.db.session import SessionLocal
from app.models.courtroom import CourtroomSession
from app.repositories.courtroom_repository import CourtroomRepository
from app.services.courtroom_service import CourtroomConflictError, CourtroomService

logger = logging.getLogger("casebridge")
DEFAULT_POLL_INTERVAL_SECONDS = 1.0


def process_one_pending_courtroom_turn(
    db: Session, provider: LLMProvider
) -> Optional[CourtroomSession]:
    session = CourtroomRepository(db).get_oldest_pending()
    if session is None:
        return None

    service = CourtroomService(db)
    try:
        return service.process_pending_turn(session, provider)
    except CourtroomConflictError:
        db.rollback()
        return session
    except AIProviderTimeoutError:
        service.mark_failed(session, "provider_timeout", "Yerel model zamanında yanıt vermedi.")
    except AIResponseValidationError:
        service.mark_failed(session, "invalid_model_response", "Yerel model geçerli bir tur üretemedi.")
    except AIProviderError:
        service.mark_failed(session, "provider_error", "Yerel modele ulaşılamadı.")
    except Exception:
        logger.exception("Unexpected error while processing courtroom session %s", session.id)
        service.mark_failed(session, "unexpected_error", "Tur işlenirken beklenmeyen bir hata oluştu.")
    return CourtroomRepository(db).get_session_in_firm(session.id)


def run_courtroom_worker_loop(
    provider_factory,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    stop_event: Optional[threading.Event] = None,
) -> None:
    stop_event = stop_event or threading.Event()
    while not stop_event.is_set():
        db = SessionLocal()
        try:
            provider = provider_factory()
            processed = process_one_pending_courtroom_turn(db, provider)
        except Exception:
            logger.exception("Courtroom worker tick failed")
            processed = None
        finally:
            db.close()
        if processed is None:
            stop_event.wait(poll_interval_seconds)


def start_courtroom_worker_thread(
    provider_factory, poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS
) -> threading.Event:
    stop_event = threading.Event()
    thread = threading.Thread(
        target=run_courtroom_worker_loop,
        args=(provider_factory, poll_interval_seconds, stop_event),
        daemon=True,
        name="casebridge-courtroom-worker",
    )
    thread.start()
    return stop_event
