"""Which requests run on the Claude subagent.

Exactly one rule, checked on the server for every request: the stored
setup-token exists AND the requesting user's id is on the platform admin's
allowlist. Everyone else keeps the existing provider path; the site cat
never comes here. Firm data still comes only from the requesting user's own
firm (tools filter by that user's law_firm_id).
"""
from __future__ import annotations

from typing import Callable, Optional

from app.ai.subagent import store


def enabled_for(user) -> bool:
    return bool(user is not None and getattr(user, "is_active", False) and store.is_enabled_for(user.id))


def llm_provider_for(user):
    if not enabled_for(user):
        return None
    from app.ai.subagent.providers import ClaudeSubagentLLMProvider

    return ClaudeSubagentLLMProvider(firm_key=user.law_firm_id)


def chat_provider_for(user):
    if not enabled_for(user):
        return None
    from app.ai.subagent.providers import ClaudeSubagentChatProvider

    return ClaudeSubagentChatProvider(firm_key=user.law_firm_id)


def job_provider_factory(base: Callable) -> Callable:
    """Worker factory: queued jobs started by an allowlisted user run on the
    subagent; every other job uses `base(law_firm_id=...)` as before."""
    def factory(law_firm_id=None, user_id: Optional[str] = None):
        if user_id and store.is_enabled_for(user_id):
            from app.ai.subagent.providers import ClaudeSubagentLLMProvider

            return ClaudeSubagentLLMProvider(firm_key=law_firm_id or "-")
        return base(law_firm_id=law_firm_id)

    factory.accepts_user = True
    return factory


def build_job_provider(factory: Callable, law_firm_id, user_id):
    if getattr(factory, "accepts_user", False):
        return factory(law_firm_id=law_firm_id, user_id=user_id)
    return factory(law_firm_id=law_firm_id)
