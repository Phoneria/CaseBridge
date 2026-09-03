"""Real OpenAI provider. This is one of only two files in the
application that may import the `openai` SDK (see
app/ai/providers/base.py and app/ai/providers/qwen_provider.py).

Never log the api_key, and never include raw SDK exception details
that might carry it (they don't by default, but we still avoid passing
the exception's str() straight through, keeping our own fixed message).
"""
import logging
import time
from typing import Optional

import openai

from app.ai.errors import AIProviderError, AIProviderTimeoutError
from app.ai.providers.base import LLMProvider

logger = logging.getLogger("casebridge")


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, timeout_seconds: float = 30.0):
        self._client = openai.OpenAI(api_key=api_key, timeout=timeout_seconds)
        self._model = model
        self.last_usage = None
        self.last_latency_ms = None

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        kwargs = dict(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        if response_format == "json_object":
            kwargs["response_format"] = {"type": "json_object"}

        start = time.monotonic()
        try:
            response = self._client.chat.completions.create(**kwargs)
        except openai.APITimeoutError:
            logger.warning("OpenAI request timed out")
            raise AIProviderTimeoutError("The AI provider timed out. Please try again.")
        except openai.OpenAIError:
            logger.warning("OpenAI request failed")
            raise AIProviderError("The AI provider returned an error. Please try again.")
        self.last_latency_ms = (time.monotonic() - start) * 1000

        usage = getattr(response, "usage", None)
        if usage is not None:
            self.last_usage = {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
            }

        return response.choices[0].message.content or ""
