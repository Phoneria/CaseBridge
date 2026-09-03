"""Qwen3-32B provider via the OpenAI-compatible Alibaba Model Studio
(DashScope) API. This is one of only two files in the application that
may import the `openai` SDK (see app/ai/providers/base.py and
app/ai/providers/openai_provider.py) - the same SDK is reused in
"OpenAI-compatible" mode by pointing it at QWEN_BASE_URL.

Never log or include the api_key in any exception message (see
_redact). Retries are bounded, exponential-backoff-with-jitter, and
apply only to transient failures (timeouts, rate limits, 5xx) - never
to authentication or malformed-request errors, which fail fast.
"""
import logging
import random
import time
from typing import Optional

import openai

from app.ai.errors import AIProviderConfigError, AIProviderError, AIProviderTimeoutError
from app.ai.providers.base import LLMProvider

logger = logging.getLogger("casebridge")

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_BASE_BACKOFF_SECONDS = 0.5
_MAX_BACKOFF_SECONDS = 8.0


def _redact(message: str, api_key: Optional[str]) -> str:
    if api_key and api_key in message:
        return message.replace(api_key, "***REDACTED***")
    return message


class QwenProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str = "qwen3-32b",
        timeout_seconds: float = 90.0,
        enable_thinking: bool = False,
        max_output_tokens: int = 8192,
        max_retries: int = 3,
    ):
        if not api_key or not api_key.strip():
            raise AIProviderConfigError("QWEN_API_KEY is required to use the Qwen provider.")
        if not base_url or not base_url.strip():
            raise AIProviderConfigError("QWEN_BASE_URL is required to use the Qwen provider.")

        self._api_key = api_key
        self._client = openai.OpenAI(api_key=api_key, base_url=base_url, timeout=timeout_seconds)
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._enable_thinking = enable_thinking
        self._max_output_tokens = max_output_tokens
        self._max_retries = max_retries
        self.last_usage: Optional[dict] = None
        self.last_latency_ms: Optional[float] = None

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        kwargs = dict(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=self._max_output_tokens,
            extra_body={"enable_thinking": self._enable_thinking},
        )
        if response_format == "json_object":
            kwargs["response_format"] = {"type": "json_object"}
        if self._enable_thinking:
            kwargs["stream"] = True

        attempt = 0
        while True:
            start = time.monotonic()
            try:
                if self._enable_thinking:
                    content = self._stream_and_aggregate(kwargs)
                else:
                    content = self._call_once(kwargs)
                self.last_latency_ms = (time.monotonic() - start) * 1000
                if not content:
                    raise AIProviderError("Qwen provider returned an empty response.")
                return content
            except openai.APITimeoutError as exc:
                logger.warning("Qwen request timed out")
                raise AIProviderTimeoutError("The Qwen provider timed out. Please try again.") from exc
            except openai.AuthenticationError as exc:
                # Never retried: a bad/expired key will not fix itself.
                logger.warning("Qwen authentication failed")
                raise AIProviderError(
                    _redact(f"Qwen authentication failed: {exc}", self._api_key)
                ) from exc
            except openai.RateLimitError as exc:
                if attempt >= self._max_retries:
                    logger.warning("Qwen rate limit retries exhausted")
                    raise AIProviderError(
                        _redact(f"Qwen rate limit exceeded: {exc}", self._api_key)
                    ) from exc
                self._sleep_backoff(attempt)
                attempt += 1
                continue
            except openai.APIStatusError as exc:
                status_code = getattr(exc, "status_code", None)
                if status_code in _RETRYABLE_STATUS_CODES and attempt < self._max_retries:
                    self._sleep_backoff(attempt)
                    attempt += 1
                    continue
                logger.warning("Qwen provider returned a non-retryable error")
                raise AIProviderError(_redact(f"Qwen provider error: {exc}", self._api_key)) from exc
            except openai.OpenAIError as exc:
                logger.warning("Qwen provider request failed")
                raise AIProviderError(_redact(f"Qwen provider error: {exc}", self._api_key)) from exc

    def _call_once(self, kwargs: dict) -> str:
        response = self._client.chat.completions.create(**kwargs)
        usage = getattr(response, "usage", None)
        if usage is not None:
            self.last_usage = {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
            }
        return response.choices[0].message.content or ""

    def _stream_and_aggregate(self, kwargs: dict) -> str:
        """Consume a streaming response (required when thinking is
        enabled) and aggregate ONLY the final answer content. Any
        `delta.reasoning_content` chunks (qwen3's hidden chain-of-
        thought) are deliberately read and discarded - never
        accumulated, stored, or returned."""
        stream = self._client.chat.completions.create(**kwargs)
        content_parts: list[str] = []
        for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage is not None:
                self.last_usage = {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                }
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                content_parts.append(piece)
            # delta.reasoning_content, if present, is intentionally
            # never read into content_parts or stored anywhere.
        return "".join(content_parts)

    def _sleep_backoff(self, attempt: int) -> None:
        delay = min(_MAX_BACKOFF_SECONDS, _BASE_BACKOFF_SECONDS * (2**attempt))
        jitter = random.uniform(0, delay * 0.25)
        time.sleep(delay + jitter)
