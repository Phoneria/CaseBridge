"""Claude (Anthropic) provider. Only this file imports the `anthropic` SDK.

Never log the api_key or pass SDK exception text through: we raise our own
fixed messages, like the OpenAI provider.
"""
import logging
import time
from typing import Optional

import anthropic

from app.ai.errors import AIProviderError, AIProviderTimeoutError
from app.ai.providers.base import LLMProvider

logger = logging.getLogger("casebridge")

_JSON_HINT = "\n\nYanıtını yalnızca geçerli tek bir JSON nesnesi olarak ver; JSON dışında hiçbir metin, açıklama veya kod bloğu ekleme."


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, timeout_seconds: float = 90.0, max_tokens: int = 4096):
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout_seconds)
        self._model = model
        self._max_tokens = max_tokens
        self.last_usage = None
        self.last_latency_ms = None

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        system = system_prompt + (_JSON_HINT if response_format == "json_object" else "")
        start = time.monotonic()
        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except anthropic.APITimeoutError:
            logger.warning("Anthropic request timed out")
            raise AIProviderTimeoutError("The AI provider timed out. Please try again.")
        except anthropic.AnthropicError:
            logger.warning("Anthropic request failed")
            raise AIProviderError("The AI provider returned an error. Please try again.")
        self.last_latency_ms = (time.monotonic() - start) * 1000

        usage = getattr(response, "usage", None)
        if usage is not None:
            inp, out = usage.input_tokens, usage.output_tokens
            self.last_usage = {"prompt_tokens": inp, "completion_tokens": out, "total_tokens": inp + out}

        return "".join(b.text for b in response.content if getattr(b, "type", "") == "text")
