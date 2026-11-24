"""Streaming chat provider interface for the Hukuk Asistanı.

Kept separate from app.ai.providers.base.LLMProvider (single-turn,
non-streaming, used by analysis/courtroom) so the chat can run on a
different provider/model - e.g. OpenAI or a fine-tuned model - without
touching the analysis pipeline.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator, Optional, TypedDict


class ChatTurn(TypedDict):
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(frozen=True)
class ToolCall:
    """A read-only data tool the model asked for (app.services.chat_data_tools)."""

    name: str
    arguments: dict = field(default_factory=dict)


#: Output cap for a tool-planning request: it only names tools and arguments.
PLAN_MAX_TOKENS = 400


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
    #: {"prompt_tokens", "completion_tokens"} of the last plan_tool_calls, when reported.
    last_plan_usage: Optional[dict] = None

    @abstractmethod
    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        """Yield the reply as text chunks. Raises AIProviderError /
        AIProviderTimeoutError (app.ai.errors) - never SDK exceptions."""
        raise NotImplementedError

    def plan_tool_calls(self, messages: list[ChatTurn], tools: list[dict]) -> list[ToolCall]:
        """One non-streaming request offering `tools` ({name, description,
        parameters}); returns the calls the model asked for, possibly none.
        Providers without tool calling ask for nothing. Raises AIProviderError."""
        return []
