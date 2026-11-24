"""Deterministic, offline chat provider for tests and CHAT_PROVIDER=mock.

Tool planning in mock mode is rule-based and reads only the user's own last
message and the page context line, never tool results or document text."""
import re
from typing import Iterator, Optional

from app.ai.chat.base import ChatProvider, ChatTurn, ToolCall
from app.ai.chat.prompt import CONTEXT_CASE_PREFIX, SOURCE_LABELS_PREFIX, TOOL_RESULTS_HEADER
from app.ai.errors import AIProviderError

_FOLD = str.maketrans("çğıöşüâîû", "cgiosuaiu")
_QUOTED = re.compile(r"[\"“”«»']([^\"“”«»']{2,80})[\"“”«»']")
# (keyword stems, tool) in priority order; the first two matches are used.
_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("durusma",), "get_hearings"),
    (("gorev", "yapilacak"), "get_tasks"),
    (("belge", "evrak", "dilekce", "sozlesme metn"), "search_documents"),
    (("muvekkil",), "search_clients"),
    (("emsal", "ictihat", "yargitay karar"), "get_precedents"),
    (("takvim", "ajanda", "bu hafta", "yarin", "bugun"), "get_calendar"),
    (("dava", "dosya"), "search_cases"),
)
_CASE_TOOLS = {"get_hearings", "get_tasks", "search_documents", "get_precedents"}


def _fold(text: str) -> str:
    return text.replace("I", "ı").replace("İ", "i").lower().translate(_FOLD)


def mock_tool_plan(messages: list[ChatTurn]) -> list[ToolCall]:
    """Keyword rules over the last user message (+ the open case id)."""
    if any(m["role"] == "system" and m["content"].startswith(TOOL_RESULTS_HEADER) for m in messages):
        return []  # one planning round in mock mode
    question = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    case_id = None
    for message in messages:
        if message["role"] == "system":
            for line in message["content"].splitlines():
                if line.startswith(CONTEXT_CASE_PREFIX):
                    case_id = line[len(CONTEXT_CASE_PREFIX):].strip() or None
    folded = _fold(question)
    quoted = _QUOTED.search(question)
    query = quoted.group(1).strip() if quoted else None
    calls: list[ToolCall] = []
    for stems, tool in _RULES:
        if len(calls) == 2:
            break
        if not any(stem in folded for stem in stems):
            continue
        if tool == "search_cases" and case_id:
            calls.append(ToolCall("get_case", {"case_id": case_id}))
            continue
        arguments: dict = {}
        if query and tool in {"search_documents", "search_clients", "get_precedents", "search_cases"}:
            arguments["query"] = query
        if case_id and tool in _CASE_TOOLS:
            arguments["case_id"] = case_id
        calls.append(ToolCall(tool, arguments))
    if not calls and case_id and any(word in folded for word in ("bu ", "ozet")):
        calls.append(ToolCall("get_case", {"case_id": case_id}))
    return calls


def _tool_answer(messages: list[ChatTurn]) -> Optional[list[str]]:
    for message in messages:
        if message["role"] == "system" and message["content"].startswith(TOOL_RESULTS_HEADER):
            labels = next(
                (line[len(SOURCE_LABELS_PREFIX):] for line in message["content"].splitlines() if line.startswith(SOURCE_LABELS_PREFIX)),
                "",
            )
            if not labels:
                return ["Büro kayıtlarınızda bu soruyla eşleşen bir kayıt bulamadım."]
            return ["Büro kayıtlarınıza göre ", "ilgili kayıtlar: ", labels, "."]
    return None


class MockChatProvider(ChatProvider):
    provider = "mock"
    external = False

    def __init__(
        self,
        model: str = "mock",
        chunks: Optional[list[str]] = None,
        fail_after: Optional[int] = None,
        max_tokens: Optional[int] = None,
        finish_reason: Optional[str] = None,
        plans: Optional[list[list[ToolCall]]] = None,
    ):
        self.model = model
        self._chunks = chunks
        self._fail_after = fail_after
        self.max_tokens = max_tokens
        self.calls: list[list[ChatTurn]] = []
        self._finish_reason = finish_reason
        self.last_usage = None
        self.last_finish_reason = None
        #: Scripted plans for tests: one list of calls per planning request.
        self._plans = list(plans) if plans is not None else None
        self.plan_calls: list[list[ChatTurn]] = []

    def plan_tool_calls(self, messages: list[ChatTurn], tools: list[dict]) -> list[ToolCall]:
        self.plan_calls.append(list(messages))
        if self._plans is not None:
            return self._plans.pop(0) if self._plans else []
        return mock_tool_plan(messages)

    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        self.last_usage = None
        self.last_finish_reason = None
        self.calls.append(list(messages))
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        chunks = self._chunks or _tool_answer(messages) or [
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
        self.last_finish_reason = self._finish_reason or "stop"
