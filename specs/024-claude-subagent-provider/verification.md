# Verification — 25 Nov 2026 (branch feat/claude-subagent-provider)
- Anthropic documentation checked before building (Agent SDK overview, Legal and compliance, Authentication); scope narrowed to the owner's own accounts by owner decision.
- Backend: `tests/api/test_claude_subagent.py` 14 passed with the SDK replaced by a fake client (no real token in CI). Existing AI tests (chat, data tools, site chat, Sufle, case intake, simulation worker, courtroom, similar precedents, legal lab) 170 passed on the new dependency set.
- Frontend: `tsc` clean; Vitest 99 files / 891 tests (new ClaudeSubagentCard 5); `next build` OK; version v0.55.
