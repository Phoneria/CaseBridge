# Plan
- `app/ai/subagent/`: `store.py` (encrypted envelope via ai_credentials helpers), `runner.py` (SDK options, sandbox, env scrub, temp dir, timeout/turns/retry/concurrency, error mapping, sync wrapper, transcript), `providers.py` (ClaudeSubagentLLMProvider, ClaudeSubagentChatProvider with `stream_with_tools`, in-process MCP tools over ChatToolRunner), `routing.py` (allowlist rule, job factory), `status.py`.
- `ChatToolRunner.prepare/execute_for_agent` reuse the existing guards; `chat_stream` streams tool events and text from a provider that runs its own tools.
- Wiring: `deps.py` (LLM, similarity, intake, chat resolver/classifier), `legal_lab.py`, `sufle.py` + `sufle_service.analyze(provider=)`, `chat.py` status, workers via `build_job_provider`, `main.py` (router before `/platform/{...}`, worker factories).
- API `app/api/routes/claude_subagent.py`; frontend `ClaudeSubagentCard`, `AiModelStatus` badge, API client and types.
- No migration: the token uses the same file-based encrypted store as the AI keys (a DB column would be a second credential store); the platform-only scope needs no per-firm rows.
- Version: application bump via `update-version.mjs`.
