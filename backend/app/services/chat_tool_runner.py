"""Runs the read-only data tools for one chat turn, before the answer streams.

Flow (at most MAX_PLANNING_ROUNDS planning requests, MAX_TOOL_CALLS calls):

1. The provider is asked which tools to call (plan_tool_calls) with the
   conversation and the page context.
2. Each call runs through chat_data_tools.run_tool with the caller's
   ToolPrincipal and writes one audit row (user, tool, record ids, time; no
   arguments, no content).
3. A second planning round may follow so a model can go from a search to a
   detail - but never after a round that returned document text: text from
   uploaded documents is untrusted and must not steer which tools run.
4. The answer is then streamed by chat_stream with the results attached as a
   data-only system turn; document excerpts are wrapped in <belge_metni>.

The runner opens its own session (the request session is closed before a
StreamingResponse body runs) and never raises: a planning or tool failure
leaves the answer to continue without (some) data.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Callable, Iterator, Optional

from sqlalchemy.orm import Session

from app.ai.chat.base import ChatProvider, ChatTurn, ToolCall
from app.ai.chat.prompt import (
    CONTEXT_CASE_PREFIX,
    DATA_TOOLS_PROMPT,
    NO_CASE_ACCESS_LINE,
    PLANNER_PROMPT,
    SOURCE_LABELS_PREFIX,
    TOOL_RESULTS_HEADER,
)
from app.ai.errors import AIProviderError
from app.models.management import ManagementAudit
from app.services.case_service import CaseService
from app.services.chat_data_tools import (
    TOOLS,
    Source,
    ToolDenied,
    ToolOutput,
    ToolPrincipal,
    ensure_allowed,
    run_tool,
    tool_schemas,
)

logger = logging.getLogger("casebridge")

MAX_TOOL_CALLS = 4
MAX_PLANNING_ROUNDS = 2
MAX_RESULTS_CHARS = 12000
MAX_SOURCES = 12
AUDIT_ACTION = "ai.tool_used"
TOOL_FAILED = "Araç çalıştırılamadı."


@dataclass(frozen=True)
class PageContext:
    route: Optional[str] = None
    case_id: Optional[str] = None


_RECORD_ID = re.compile(r"[0-9A-Za-z]{8}-[0-9A-Za-z-]{4,}")


def _route_hint(route: Optional[str]) -> Optional[str]:
    """The page path without record ids or query: the case id, when it belongs
    to the caller's firm, is passed separately after it has been checked."""
    if not route:
        return None
    path = route.split("?", 1)[0].split("#", 1)[0]
    return _RECORD_ID.sub(":id", path)[:120] or None


def _neutralise(text: str) -> str:
    """Stored text cannot open or close our data tags."""
    return text.replace("<", "‹").replace(">", "›")


class ChatToolRunner:
    def __init__(
        self,
        *,
        provider: ChatProvider,
        principal: ToolPrincipal,
        conversation_id: str,
        session_factory: Callable[[], Session],
        context: Optional[PageContext] = None,
    ):
        self.provider = provider
        self.principal = principal
        self.conversation_id = conversation_id
        self.session_factory = session_factory
        self.context = context or PageContext()
        self.case_id: Optional[str] = None
        self.calls: list[ToolCall] = []
        self.results: list[dict] = []
        self.sources: list[Source] = []
        self.allowed = True
        #: Tokens of the planning requests, added to the answer's usage (AI budget).
        self.plan_usage = {"prompt_tokens": 0, "completion_tokens": 0}

    # ---------- prompts ----------

    def _context_lines(self) -> list[str]:
        lines = []
        route = _route_hint(self.context.route)
        if route:
            lines.append(f"Kullanıcının açık sayfası: {route}")
        if self.case_id:
            lines.append(f"{CONTEXT_CASE_PREFIX}{self.case_id}")
        return lines

    def _planner_messages(self, history: list[ChatTurn]) -> list[ChatTurn]:
        system = "\n".join([PLANNER_PROMPT, *self._context_lines()])
        return [{"role": "system", "content": system}] + [m for m in history if m["role"] != "system"]

    def _results_turn(self, final: bool) -> ChatTurn:
        payload = json.dumps(self.results, ensure_ascii=False, default=str)
        if len(payload) > MAX_RESULTS_CHARS:
            payload = payload[:MAX_RESULTS_CHARS] + " …(kısaltıldı)"
        lines = [TOOL_RESULTS_HEADER, payload]
        if final:
            lines.append(SOURCE_LABELS_PREFIX + "; ".join(source.label for source in self.sources))
        return {"role": "system", "content": "\n".join(lines)}

    def final_history(self, history: list[ChatTurn]) -> list[ChatTurn]:
        """The answer's history: data-aware system prompt, page context and,
        when tools ran, the results as a data-only system turn at the end."""
        if not self.allowed:
            return history
        turns = list(history)
        if turns and turns[0]["role"] == "system":
            base = turns[0]["content"].replace(NO_CASE_ACCESS_LINE, "").rstrip()
            turns[0] = {"role": "system", "content": "\n\n".join([base, DATA_TOOLS_PROMPT, *self._context_lines()])}
        if self.calls:
            turns.append(self._results_turn(final=True))
        return turns

    # ---------- running ----------

    def _record(self, db: Session, call: ToolCall, output: ToolOutput) -> None:
        db.add(ManagementAudit(
            law_firm_id=self.principal.law_firm_id,
            actor_id=self.principal.user_id,
            action=AUDIT_ACTION,
            entity_type="ai_chat",
            entity_id=self.conversation_id,
            reason=call.name[:64],
            after={"tool": call.name[:64], "record_ids": output.record_ids[:50]},
        ))
        db.commit()

    def _execute(self, db: Session, call: ToolCall) -> ToolOutput:
        try:
            output = run_tool(db, self.principal, call.name, call.arguments)
        except ToolDenied:
            raise
        except Exception as exc:  # a broken tool must not break the answer
            db.rollback()
            logger.warning("Chat data tool failed (tool=%s, error=%s)", call.name[:64], type(exc).__name__)
            output = ToolOutput(error=TOOL_FAILED)
        self.calls.append(call)
        self._record(db, call, output)
        rows = output.rows
        if output.document_text:
            rows = [
                row | {"alinti": f"<belge_metni>{_neutralise(row['alinti'])}</belge_metni>"} if row.get("alinti") else row
                for row in rows
            ]
        self.results.append({"arac": call.name, "sonuc": rows, **({"hata": output.error} if output.error else {})})
        known = {(source.kind, source.id) for source in self.sources}
        for source in output.sources:
            if (source.kind, source.id) not in known and len(self.sources) < MAX_SOURCES:
                known.add((source.kind, source.id))
                self.sources.append(source)
        return output

    def run(self, history: list[ChatTurn]) -> Iterator[dict]:
        """Yields progress events ({"type": "tool", ...}) for the stream."""
        db = self.session_factory()
        try:
            try:
                ensure_allowed(db, self.principal)
            except ToolDenied:
                self.allowed = False
                return
            if self.context.case_id and CaseService(db).get_case(self.context.case_id, self.principal.law_firm_id):
                self.case_id = self.context.case_id
            messages = self._planner_messages(history)
            for _ in range(MAX_PLANNING_ROUNDS):
                remaining = MAX_TOOL_CALLS - len(self.calls)
                if remaining <= 0:
                    break
                try:
                    planned = self.provider.plan_tool_calls(messages, tool_schemas())
                except AIProviderError:
                    logger.warning("Chat tool planning failed; answering without data")
                    break
                finally:
                    usage = getattr(self.provider, "last_plan_usage", None) or {}
                    for key in self.plan_usage:
                        self.plan_usage[key] += int(usage.get(key) or 0)
                planned = [call for call in planned if isinstance(call, ToolCall)][:remaining]
                if not planned:
                    break
                saw_documents = False
                for call in planned:
                    yield {"type": "tool", "name": call.name if call.name in TOOLS else "unknown", "status": "start"}
                    output = self._execute(db, call)
                    saw_documents = saw_documents or output.document_text
                    yield {"type": "tool", "name": call.name if call.name in TOOLS else "unknown", "status": "done",
                           "count": len(output.rows)}
                if saw_documents:
                    break  # document text never chooses the next tools
                messages = messages + [self._results_turn(final=False)]
        except ToolDenied:
            self.allowed = False
        except Exception as exc:
            logger.warning("Chat data tools stopped (%s)", type(exc).__name__)
        finally:
            db.close()
