"""One sandboxed Claude Code subagent run through the Claude Agent SDK.

Sandbox (every run):
- no built-in tools (`tools=[]`), every built-in name in `disallowed_tools`,
  and a permission callback that denies anything not in our own allowlist;
  the only tools are our in-process read-only MCP tools, when given;
- no user/project/local settings (`setting_sources=[]`), only our MCP server
  (`strict_mcp_config=True`), no skills, agents or plugins;
- a fresh empty temp directory as cwd, HOME and CLAUDE_CONFIG_DIR, deleted
  afterwards;
- the subprocess environment is scrubbed: every inherited variable outside a
  short allowlist is blanked (so JWT/encryption/database/OpenAI secrets and
  ANTHROPIC_API_KEY never reach the CLI) and the token is passed per call as
  CLAUDE_CODE_OAUTH_TOKEN, never set process-wide;
- 90 s overall timeout, at most 8 turns, one retry only on a 5xx API error;
- at most 3 concurrent runs per firm; further runs wait their turn.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from app.ai.errors import AIProviderError, AIProviderTimeoutError
from app.ai.subagent import store

logger = logging.getLogger("casebridge")

TIMEOUT_SECONDS = 90.0
MAX_TURNS = 8
MAX_CONCURRENT_PER_FIRM = 3
MCP_SERVER_NAME = "casebridge"

#: Every Claude Code built-in tool we know of; all are refused.
BUILTIN_TOOLS = (
    "Bash", "BashOutput", "KillShell", "KillBash", "Read", "Write", "Edit", "MultiEdit", "NotebookEdit",
    "NotebookRead", "Glob", "Grep", "LS", "WebFetch", "WebSearch", "Task", "Agent", "TodoWrite",
    "ExitPlanMode", "SlashCommand", "Skill", "ListMcpResourcesTool", "ReadMcpResourceTool",
)
#: Inherited variables the CLI may keep; everything else is blanked.
ENV_KEEP = ("PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SSL_CERT_FILE", "SSL_CERT_DIR",
            "NODE_EXTRA_CA_CERTS", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy")

TOKEN_INVALID = "Claude token geçersiz, yenileyin."
RATE_LIMITED = "Claude kullanım sınırına ulaşıldı. Biraz sonra tekrar deneyin."
TIMED_OUT = "Claude yanıt süresini aştı. Lütfen tekrar deneyin."
UNAVAILABLE = "Claude bağlantısı kurulamadı. Lütfen tekrar deneyin."
INCOMPLETE = "Claude yanıtı tamamlayamadı. Soruyu daraltarak tekrar deneyin."


class SubagentAuthError(AIProviderError):
    """The stored setup-token was rejected."""


class _Retryable(Exception):
    pass


@dataclass
class RunResult:
    text: str
    usage: Optional[dict] = None
    turns: int = 0
    tool_calls: list[str] = field(default_factory=list)


# The SDK client class; tests replace it (CI never has a real token).
def _default_client_factory(options):
    from claude_agent_sdk import ClaudeSDKClient

    return ClaudeSDKClient(options=options)


client_factory: Callable[[Any], Any] = _default_client_factory

_semaphores: dict[str, threading.BoundedSemaphore] = defaultdict(lambda: threading.BoundedSemaphore(MAX_CONCURRENT_PER_FIRM))
_semaphores_lock = threading.Lock()


def _semaphore(key: str) -> threading.BoundedSemaphore:
    with _semaphores_lock:
        return _semaphores[key]


def subprocess_env(token: str, home: str) -> dict[str, str]:
    env = {name: "" for name in os.environ if name not in ENV_KEEP}
    env.update({
        "CLAUDE_CODE_OAUTH_TOKEN": token,
        "ANTHROPIC_API_KEY": "",
        "ANTHROPIC_AUTH_TOKEN": "",
        "ANTHROPIC_BASE_URL": "",
        "HOME": home,
        "CLAUDE_CONFIG_DIR": os.path.join(home, ".claude"),
        "DISABLE_AUTOUPDATER": "1",
        "DISABLE_TELEMETRY": "1",
        "DISABLE_ERROR_REPORTING": "1",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        "CLAUDE_AGENT_SDK_CLIENT_APP": "casebridge-subagent/1",
    })
    return env


def build_options(*, system_prompt: str, token: str, workdir: str, tools: list, model: Optional[str], stream: bool):
    from claude_agent_sdk import ClaudeAgentOptions, PermissionResultAllow, PermissionResultDeny, create_sdk_mcp_server

    allowed = [f"mcp__{MCP_SERVER_NAME}__{t.name}" for t in tools]

    async def can_use_tool(name, tool_input, context):  # defence in depth
        if name in allowed:
            return PermissionResultAllow()
        return PermissionResultDeny(message="Bu araç kullanılamaz.", interrupt=False)

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        tools=[],
        allowed_tools=allowed,
        disallowed_tools=list(BUILTIN_TOOLS),
        mcp_servers={MCP_SERVER_NAME: create_sdk_mcp_server(MCP_SERVER_NAME, tools=tools)} if tools else {},
        strict_mcp_config=True,
        setting_sources=[],
        permission_mode="default",
        can_use_tool=can_use_tool,
        max_turns=MAX_TURNS,
        model=model or None,
        cwd=workdir,
        env=subprocess_env(token, workdir),
        include_partial_messages=stream,
    )
    options.casebridge_tools = tools  # lets the test double reach our handlers
    return options


def _classify(error: Optional[str], status: Optional[int]) -> Exception:
    if error == "authentication_failed" or status in (401, 403):
        store.mark_status("invalid")
        return SubagentAuthError(TOKEN_INVALID)
    if error in ("rate_limit", "billing_error") or status == 429:
        return AIProviderError(RATE_LIMITED)
    if error == "server_error" or (status is not None and status >= 500):
        return _Retryable()
    return AIProviderError(UNAVAILABLE)


async def _single_run(prompt, options, on_text: Optional[Callable[[str], Any]]) -> RunResult:
    from claude_agent_sdk import AssistantMessage, ResultMessage, StreamEvent, TextBlock, ToolUseBlock
    from claude_agent_sdk import ResultError, CLIConnectionError, ClaudeSDKError

    texts: list[str] = []
    streamed = False
    result = RunResult(text="")
    try:
        async with client_factory(options) as client:
            await client.query(prompt)
            async for message in client.receive_response():
                if isinstance(message, StreamEvent):
                    event = message.event or {}
                    delta = event.get("delta") or {}
                    if event.get("type") == "content_block_delta" and delta.get("type") == "text_delta" and delta.get("text"):
                        streamed = True
                        if on_text:
                            await _maybe_await(on_text(delta["text"]))
                elif isinstance(message, AssistantMessage):
                    if message.error:
                        raise _classify(message.error, None)
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            texts.append(block.text)
                            if on_text and not streamed:
                                await _maybe_await(on_text(block.text))
                        elif isinstance(block, ToolUseBlock):
                            result.tool_calls.append(block.name)
                elif isinstance(message, ResultMessage):
                    result.turns = message.num_turns
                    usage = message.usage or {}
                    result.usage = {"prompt_tokens": usage.get("input_tokens"), "completion_tokens": usage.get("output_tokens")}
                    if message.is_error:
                        if message.subtype == "error_max_turns":
                            raise AIProviderError(INCOMPLETE)
                        raise _classify(None, message.api_error_status)
    except ResultError as exc:
        if exc.subtype == "error_max_turns" or exc.terminal_reason == "max_turns":
            raise AIProviderError(INCOMPLETE) from None
        raise _classify(None, exc.api_error_status) from None
    except (CLIConnectionError, ClaudeSDKError):
        raise AIProviderError(UNAVAILABLE) from None
    result.text = "".join(texts).strip()
    return result


async def _maybe_await(value):
    if asyncio.iscoroutine(value):
        await value


async def run(
    *,
    system_prompt: str,
    prompt: str,
    firm_key: str,
    tools: Optional[list] = None,
    on_text: Optional[Callable[[str], Awaitable[None] | None]] = None,
    model: Optional[str] = None,
    timeout: float = TIMEOUT_SECONDS,
) -> RunResult:
    """Run the subagent once (plus at most one retry on a 5xx). Raises
    SubagentAuthError, AIProviderTimeoutError or AIProviderError with a fixed
    Turkish message - never the token, never SDK internals."""
    token = store.get_token()
    if not token:
        raise SubagentAuthError(TOKEN_INVALID)
    semaphore = _semaphore(firm_key or "-")
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    acquired = await asyncio.to_thread(semaphore.acquire, True, timeout)
    if not acquired:
        raise AIProviderError(RATE_LIMITED)
    try:
        for attempt in range(2):
            workdir = tempfile.mkdtemp(prefix="cb-subagent-")
            try:
                options = build_options(system_prompt=system_prompt, token=token, workdir=workdir,
                                        tools=tools or [], model=model, stream=on_text is not None)
                remaining = deadline - loop.time()
                if remaining <= 0:
                    raise AIProviderTimeoutError(TIMED_OUT)
                result = await asyncio.wait_for(_single_run(prompt, options, on_text), timeout=remaining)
                if store.public_status().get("status") != "ok":
                    store.mark_status("ok")
                return result
            except _Retryable:
                if attempt == 0:
                    logger.warning("Claude subagent: server error, retrying once")
                    continue
                raise AIProviderError(UNAVAILABLE) from None
            except asyncio.TimeoutError:
                raise AIProviderTimeoutError(TIMED_OUT) from None
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
        raise AIProviderError(UNAVAILABLE)
    finally:
        semaphore.release()


def run_sync(**kwargs) -> RunResult:
    """`run` from synchronous code (worker threads, sync FastAPI handlers)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(run(**kwargs))
    box: dict = {}

    def target():
        try:
            box["result"] = asyncio.run(run(**kwargs))
        except BaseException as exc:  # re-raised in the caller's thread
            box["error"] = exc

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    thread.join()
    if "error" in box:
        raise box["error"]
    return box["result"]


def transcript(messages: list[dict]) -> tuple[str, str]:
    """(system prompt, prompt) from ChatTurn-style messages. Earlier turns are
    passed as a labelled transcript; the SDK run itself is single-shot."""
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    turns = [m for m in messages if m["role"] != "system"]
    if not turns:
        return system, ""
    *earlier, last = turns
    if not earlier:
        return system, last["content"]
    lines = ["Önceki konuşma (yalnız bağlam):"]
    for turn in earlier:
        lines.append(("Kullanıcı: " if turn["role"] == "user" else "Asistan: ") + turn["content"])
    lines.append("")
    lines.append("Yeni soru: " + last["content"])
    return system, "\n".join(lines)
