"""Deterministic, offline chat provider for tests and CHAT_PROVIDER=mock."""
from typing import Iterator, Optional

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.errors import AIProviderError


class MockChatProvider(ChatProvider):
    provider = "mock"
    external = False

    def __init__(
        self,
        model: str = "mock",
        chunks: Optional[list[str]] = None,
        fail_after: Optional[int] = None,
        max_tokens: Optional[int] = None,
    ):
        self.model = model
        self._chunks = chunks
        self._fail_after = fail_after
        self.max_tokens = max_tokens
        self.calls: list[list[ChatTurn]] = []
        self.last_usage = None

    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        self.last_usage = None
        self.calls.append(list(messages))
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        chunks = self._chunks or [
            "Bu, ",
            "CaseBridge AI ",
            "test yanıtıdır. ",
            "Sorunuz: ",
            last_user[:80],
        ]
        for index, chunk in enumerate(chunks):
            if self._fail_after is not None and index >= self._fail_after:
                raise AIProviderError("Mock sağlayıcı hatası.")
            yield chunk
        self.last_usage = {"prompt_tokens": 0, "completion_tokens": len(chunks)}
