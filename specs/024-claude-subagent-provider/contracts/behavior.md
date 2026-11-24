# Behavior
- Platform admin only for `/platform/claude-subagent*`; others 403/401. The token value never leaves the server.
- A request uses the subagent iff token stored ∧ user on list ∧ user active; else unchanged behaviour. Site cat never.
- Sandbox: only our read-only MCP tools; no shell/file/web; temp cwd deleted; 90 s; 8 turns; one 5xx retry; 3 concurrent per firm.
- Rejected token → "Claude token geçersiz, yenileyin." (chat status, chat error, card).
