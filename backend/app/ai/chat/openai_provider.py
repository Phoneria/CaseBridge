"""OpenAI streaming chat provider. Works unchanged with OpenAI
fine-tuned models: set CHAT_MODEL to the `ft:...` model id."""
import logging
from typing import Any, Iterator, Optional

import httpx
import openai

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.errors import AIProviderError, AIProviderTimeoutError

logger = logging.getLogger("casebridge")


class OpenAIChatProvider(ChatProvider):
    provider = "openai"
    external = True

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float = 60.0,
        client: Optional[Any] = None,
        max_tokens: Optional[int] = None,
        max_retries: Optional[int] = None,
    ):
        self.model = model
        self._api_key = api_key
        self._timeout = timeout_seconds
        self._client = client
        self.max_tokens = max_tokens
        self._max_retries = max_retries
        self.last_usage = None
        self.last_finish_reason = None

    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        self.last_usage = None
        self.last_finish_reason = None
        try:
            if self._client is None:
                client_kwargs: dict[str, Any] = {"api_key": self._api_key, "timeout": self._timeout}
                if self._max_retries is not None:
                    client_kwargs["max_retries"] = self._max_retries
                self._client = openai.OpenAI(**client_kwargs)
            limits = {"max_completion_tokens": self.max_tokens} if self.max_tokens else {}
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
                **limits,
            )
            for chunk in response:
                usage = getattr(chunk, "usage", None)
                if usage is not None:
                    self.last_usage = {
                        "prompt_tokens": usage.prompt_tokens,
                        "completion_tokens": usage.completion_tokens,
                    }
                for choice in getattr(chunk, "choices", None) or []:
                    finish_reason = getattr(choice, "finish_reason", None)
                    if finish_reason:
                        self.last_finish_reason = finish_reason
                    text = getattr(choice.delta, "content", None)
                    if text:
                        yield text
        except openai.APITimeoutError as exc:
            logger.warning("OpenAI chat stream timed out")
            raise AIProviderTimeoutError("AI sağlayıcısı zaman aşımına uğradı. Lütfen tekrar deneyin.") from exc
        except openai.OpenAIError as exc:
            logger.warning("OpenAI chat stream failed")
            raise AIProviderError("AI sağlayıcısı bir hata döndürdü. Lütfen tekrar deneyin.") from exc
        except httpx.TimeoutException as exc:
            logger.warning("OpenAI chat stream timed out (transport)")
            raise AIProviderTimeoutError("AI sağlayıcısı zaman aşımına uğradı. Lütfen tekrar deneyin.") from exc
        except Exception as exc:  # GeneratorExit is a BaseException and still propagates
            logger.warning("OpenAI chat stream failed unexpectedly (%s)", type(exc).__name__)
            raise AIProviderError("AI sağlayıcısı bir hata döndürdü. Lütfen tekrar deneyin.") from exc
