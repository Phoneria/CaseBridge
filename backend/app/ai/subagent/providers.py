"""LLMProvider / ChatProvider implementations backed by the Claude subagent.

Only ever constructed for a request whose user is on the platform admin's
allowlist (app.ai.subagent.routing). The existing prompts and guards are
unchanged: callers pass the same system prompts (no-fabrication rules
included) they pass to the OpenAI/Claude API providers.
"""
from __future__ import annotations

import asyncio
import json
import queue
import re
import threading
import time
from typing import Iterator, Optional

from app.ai.chat.base import ChatProvider, ChatTurn, ToolCall
from app.ai.errors import AIProviderError
from app.ai.providers.base import LLMProvider
from app.ai.subagent import runner

PROVIDER_NAME = "claude-subagent"
MODEL_LABEL = "Claude (abonelik)"
JSON_INSTRUCTION = "Yanıtı yalnızca geçerli bir JSON nesnesi olarak ver; JSON dışında hiçbir metin yazma."
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.S)


class ClaudeSubagentLLMProvider(LLMProvider):
    provider = PROVIDER_NAME

    def __init__(self, firm_key: str, model: Optional[str] = None):
        self.firm_key = firm_key
        self.model = model or MODEL_LABEL
        self._model = model
        self.last_usage = None
        self.last_latency_ms = None

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        system = system_prompt + ("\n\n" + JSON_INSTRUCTION if response_format == "json_object" else "")
        started = time.monotonic()
        result = runner.run_sync(system_prompt=system, prompt=user_prompt, firm_key=self.firm_key, model=self._model)
        self.last_latency_ms = (time.monotonic() - started) * 1000
        self.last_usage = result.usage
        text = result.text
        if response_format == "json_object":
            text = _FENCE.sub("", text.strip())
        if not text:
            raise AIProviderError(runner.INCOMPLETE)
        return text


class ClaudeSubagentChatProvider(ChatProvider):
    provider = PROVIDER_NAME
    external = True
    #: chat_stream lets this provider run the read-only data tools itself.
    runs_own_tools = True

    def __init__(self, firm_key: str, model: Optional[str] = None, session_factory=None):
        self.firm_key = firm_key
        self.model = model or MODEL_LABEL
        self._model = model
        self.session_factory = session_factory
        self.last_usage = None
        self.last_finish_reason = None
        self.last_plan_usage = None

    def plan_tool_calls(self, messages, tools) -> list[ToolCall]:
        return []  # tools run inside the agent (stream_with_tools)

    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        system, prompt = runner.transcript(messages)
        yield from self._pump(system, prompt, tools=None)

    def stream_with_tools(self, tool_runner, history: list[ChatTurn]) -> Iterator[object]:
        """Text chunks (str) and tool progress events (dict). The 8 read-only
        tools run in-process under tool_runner's guards; firm and user come
        from tool_runner.principal (the requesting user's session)."""
        db = tool_runner.session_factory()
        try:
            tools = build_data_tools(tool_runner, db) if tool_runner.prepare(db) else []
            system, prompt = runner.transcript(tool_runner.final_history(history))
            yield from self._pump(system, prompt, tools=tools, events=getattr(tools, "events", None))
        finally:
            db.close()

    def _pump(self, system: str, prompt: str, tools, events: Optional[queue.Queue] = None) -> Iterator[object]:
        self.last_usage = None
        self.last_finish_reason = None
        out: queue.Queue = events or queue.Queue()
        done = object()
        box: dict = {}

        def target():
            try:
                box["result"] = asyncio.run(runner.run(
                    system_prompt=system, prompt=prompt, firm_key=self.firm_key, tools=list(tools or []),
                    on_text=out.put, model=self._model))
            except BaseException as exc:
                box["error"] = exc
            finally:
                out.put(done)

        thread = threading.Thread(target=target, daemon=True)
        thread.start()
        while True:
            item = out.get()
            if item is done:
                break
            yield item
        thread.join()
        if "error" in box:
            error = box["error"]
            raise error if isinstance(error, AIProviderError) else AIProviderError(runner.UNAVAILABLE)
        self.last_usage = box["result"].usage
        self.last_finish_reason = "stop"


class _ToolList(list):
    events: queue.Queue


def build_data_tools(tool_runner, db) -> list:
    """The mascot's 8 read-only data tools as in-process SDK MCP tools. Each
    call goes through ChatToolRunner.execute_for_agent (call cap, audit row,
    document wrapping, no tools after document text) with the caller's firm."""
    from claude_agent_sdk import tool

    from app.services.chat_data_tools import TOOLS

    events: queue.Queue = queue.Queue()
    tools = _ToolList()
    tools.events = events
    for spec in TOOLS.values():
        def make(name):
            async def handler(arguments):
                events.put({"type": "tool", "name": name, "status": "start"})
                text = await asyncio.to_thread(tool_runner.execute_for_agent, db, name, arguments)
                events.put({"type": "tool", "name": name, "status": "done"})
                return {"content": [{"type": "text", "text": text}]}
            return handler
        tools.append(tool(spec.name, spec.description, spec.parameters,
                          annotations=_read_only())(make(spec.name)))
    return tools


def _read_only():
    try:
        from claude_agent_sdk import McpToolAnnotations  # type: ignore[attr-defined]

        return McpToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)
    except Exception:
        return None
