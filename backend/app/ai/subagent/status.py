"""User-facing provider status for an allowlisted user (no secrets)."""
from app.ai.subagent import store
from app.ai.subagent.providers import MODEL_LABEL, PROVIDER_NAME
from app.ai.subagent.runner import TOKEN_INVALID


def subagent_status() -> dict:
    status = store.public_status()
    invalid = status["status"] == "invalid"
    return {
        "provider": PROVIDER_NAME,
        "model": MODEL_LABEL,
        "configured": status["set"] and not invalid,
        "external": True,
        "error": TOKEN_INVALID if invalid else None,
    }
