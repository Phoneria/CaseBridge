"""Monthly AI token usage for the sidebar info box. Reads token counts the
app already stores (simulations, chat messages) - no provider calls."""
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.chat import ChatMessage
from app.models.simulation import Simulation

LOCAL_PROVIDERS = {"ollama"}


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1)


def get_ai_usage(db: Session, law_firm_id: str) -> dict:
    start = _month_start()
    sim_tokens = db.query(
        func.coalesce(
            func.sum(
                func.coalesce(
                    Simulation.total_tokens,
                    func.coalesce(Simulation.prompt_tokens, 0) + func.coalesce(Simulation.completion_tokens, 0),
                )
            ),
            0,
        )
    ).filter(Simulation.law_firm_id == law_firm_id, Simulation.started_at >= start).scalar()
    chat_tokens = db.query(
        func.coalesce(
            func.sum(func.coalesce(ChatMessage.prompt_tokens, 0) + func.coalesce(ChatMessage.completion_tokens, 0)),
            0,
        )
    ).filter(ChatMessage.law_firm_id == law_firm_id, ChatMessage.created_at >= start).scalar()

    used = int(sim_tokens or 0) + int(chat_tokens or 0)
    budget = max(int(settings.ai_monthly_token_budget or 0), 0)
    remaining_percent = None
    if budget > 0:
        remaining_percent = round(max(0.0, 100.0 - used * 100.0 / budget), 1)
    unlimited = {settings.llm_provider, settings.chat_provider} <= LOCAL_PROVIDERS
    return {
        "period_start": start.date().isoformat(),
        "used_tokens": used,
        "budget_tokens": budget or None,
        "remaining_percent": remaining_percent,
        "unlimited": unlimited,
    }
