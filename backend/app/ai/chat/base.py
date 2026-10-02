"""Streaming chat provider interface for the Hukuk Asistanı.

Kept separate from app.ai.providers.base.LLMProvider (single-turn,
non-streaming, used by analysis/courtroom) so the chat can run on a
different provider/model - e.g. OpenAI or a fine-tuned model - without
touching the analysis pipeline.
"""
from abc import ABC, abstractmethod
from typing import Iterator, Optional, TypedDict


class ChatTurn(TypedDict):
    role: str  # "system" | "user" | "assistant"
    content: str


class ChatProvider(ABC):
    provider: str = ""
    model: str = ""
    #: True when messages leave the firm (hosted API); False for local models.
    external: bool = True
    #: Upper bound on reply tokens for this provider instance (None = provider default).
    max_tokens: Optional[int] = None
    #: {"prompt_tokens", "completion_tokens"} after a finished stream, when reported.
    last_usage: Optional[dict] = None
    #: Why the last stream ended ("stop", "length", ...), when reported. Reset
    #: at stream start; "length" means the reply hit the max_tokens cap.
    last_finish_reason: Optional[str] = None

    @abstractmethod
    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        """Yield the reply as text chunks. Raises AIProviderError /
        AIProviderTimeoutError (app.ai.errors) - never SDK exceptions."""
        raise NotImplementedError
