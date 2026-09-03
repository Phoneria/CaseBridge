"""Local Ollama implementation of the application LLM abstraction."""
import time
from typing import Optional

import httpx

from app.ai.errors import AIProviderConfigError, AIProviderError, AIProviderTimeoutError
from app.ai.providers.base import LLMProvider


class OllamaProvider(LLMProvider):
    def __init__(
        self,
        base_url: str,
        model: str = "qwen3.5:9b",
        timeout_seconds: float = 180.0,
        temperature: float = 0.3,
        num_ctx: int = 16384,
    ):
        if not base_url or not base_url.strip():
            raise AIProviderConfigError("OLLAMA_BASE_URL is required to use the Ollama provider.")
        if not model or not model.strip():
            raise AIProviderConfigError("OLLAMA_MODEL is required to use the Ollama provider.")
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._temperature = temperature
        self._num_ctx = num_ctx
        self.last_usage: Optional[dict] = None
        self.last_latency_ms: Optional[float] = None

    def complete(
        self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None
    ) -> str:
        payload: dict = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "think": False,
            "keep_alive": "10m",
            "options": {"temperature": self._temperature, "num_ctx": self._num_ctx},
        }
        if response_format == "json_object":
            payload["format"] = "json"

        started = time.monotonic()
        try:
            response = httpx.post(
                f"{self._base_url}/api/chat", json=payload, timeout=self._timeout_seconds
            )
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException as exc:
            raise AIProviderTimeoutError("Lokal Ollama modeli zaman aşımına uğradı. Tekrar deneyin.") from exc
        except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
            raise AIProviderError(
                "Lokal Ollama modeline ulaşılamadı veya geçersiz bir yanıt döndü."
            ) from exc

        self.last_latency_ms = (time.monotonic() - started) * 1000
        prompt_tokens = data.get("prompt_eval_count")
        completion_tokens = data.get("eval_count")
        if prompt_tokens is not None or completion_tokens is not None:
            self.last_usage = {
                "prompt_tokens": prompt_tokens or 0,
                "completion_tokens": completion_tokens or 0,
                "total_tokens": (prompt_tokens or 0) + (completion_tokens or 0),
            }
        content = data.get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise AIProviderError("Lokal Ollama modeli boş bir yanıt döndürdü.")
        return content.strip()
