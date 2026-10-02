"""Local Ollama streaming chat provider (for a locally served fine-tune)."""
import json
from typing import Iterator, Optional

import httpx

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.errors import AIProviderError, AIProviderTimeoutError


class OllamaChatProvider(ChatProvider):
    provider = "ollama"
    external = False

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout_seconds: float = 60.0,
        transport: Optional[httpx.BaseTransport] = None,
        max_tokens: Optional[int] = None,
    ):
        self.model = model
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._transport = transport
        self.max_tokens = max_tokens
        self.last_usage = None
        self.last_finish_reason = None

    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        self.last_usage = None
        self.last_finish_reason = None
        payload = {"model": self.model, "messages": messages, "stream": True, "think": False}
        if self.max_tokens:
            payload["options"] = {"num_predict": self.max_tokens}
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                with client.stream("POST", f"{self._base_url}/api/chat", json=payload) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.strip():
                            continue
                        data = json.loads(line)
                        if not isinstance(data, dict):
                            raise ValueError("unexpected NDJSON line")
                        if "error" in data:
                            raise AIProviderError("Lokal model bir hata döndürdü. Lütfen tekrar deneyin.")
                        text = (data.get("message") or {}).get("content") or ""
                        if text:
                            yield text
                        if data.get("done"):
                            self.last_finish_reason = data.get("done_reason")
                            self.last_usage = {
                                "prompt_tokens": data.get("prompt_eval_count") or 0,
                                "completion_tokens": data.get("eval_count") or 0,
                            }
        except httpx.TimeoutException as exc:
            raise AIProviderTimeoutError("Lokal model zaman aşımına uğradı. Lütfen tekrar deneyin.") from exc
        except AIProviderError:
            raise
        except Exception as exc:  # GeneratorExit is a BaseException and still propagates
            raise AIProviderError("Lokal modele ulaşılamadı veya geçersiz bir yanıt döndü.") from exc
