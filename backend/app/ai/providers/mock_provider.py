"""Mock LLM provider used by the entire default test suite (`pytest`)
and available as an app-wide fallback whenever LLM_PROVIDER=mock (the
default). Never makes a network call, never consumes API credits."""
from typing import Optional

from app.ai.providers.base import LLMProvider


class MockProvider(LLMProvider):
    def __init__(self, default_response: str = "", responses: Optional[list[str]] = None):
        """`responses`, if given, is returned in order (one per call,
        then repeats the last entry); otherwise every call returns
        `default_response`. Every call is recorded in `self.calls` so
        AI-contract tests can assert on prompts sent to each agent."""
        self.default_response = default_response
        self._responses = responses or []
        self.calls: list[dict[str, Optional[str]]] = []
        self.last_usage = None
        self.last_latency_ms = 0.0

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        self.calls.append(
            {"system_prompt": system_prompt, "user_prompt": user_prompt, "response_format": response_format}
        )
        if self._responses:
            index = min(len(self.calls) - 1, len(self._responses) - 1)
            return self._responses[index]
        return self.default_response
