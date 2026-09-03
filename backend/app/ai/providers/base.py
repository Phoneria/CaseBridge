"""LLM provider interface.

Application/domain code (Case Intelligence Engine, agents, services)
must depend only on this abstraction - never import the `openai`
package outside app/ai/providers/*_provider.py. This is what lets
OpenAI/Qwen be swapped for another compatible LLM later without
touching business logic (section 10, 27).
"""
from abc import ABC, abstractmethod
from typing import Optional


class LLMProvider(ABC):
    #: Populated by the provider after the most recent `complete()` call,
    #: when the underlying API reports it. {"prompt_tokens", "completion_tokens",
    #: "total_tokens"} or None if not available. Never includes hidden
    #: reasoning/thinking content.
    last_usage: Optional[dict] = None
    #: Wall-clock latency in milliseconds of the most recent `complete()`
    #: call, when measurable.
    last_latency_ms: Optional[float] = None

    @abstractmethod
    def complete(
        self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None
    ) -> str:
        """Return the model's raw text response for a single-turn
        system+user prompt pair. `response_format="json_object"` asks
        the provider to constrain output to a JSON object where
        supported (used for the judge/final-report step). Raises
        AIProviderError / AIProviderTimeoutError (app.ai.errors) on
        failure - never a raw SDK-specific exception."""
        raise NotImplementedError
