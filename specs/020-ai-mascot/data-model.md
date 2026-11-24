# Data model
## FeatureContract
No table or column changes.

Request `ChatMessageCreate` adds `data_tools: bool = false` and `context: {route: str ≤200, case_id: str ≤36 [A-Za-z0-9-]} | null`.

Stream events (SSE, in order): `start`; zero or more `tool {name, status: start|done, count?}`; `sources {sources: [ChatSource]}` when a tool ran; `delta`…; `done {message, sources?}` or `error`. `ChatSource {kind: case|document|precedent|client|calendar, id, label, href}`.

Audit row (`management_audits`): `law_firm_id`, `actor_id`, `action="ai.tool_used"`, `entity_type="ai_chat"`, `entity_id=<conversation id>`, `reason=<tool name>`, `after={tool, record_ids[≤50]}`, `created_at`.

Browser storage (per viewer, never shared, never secrets): localStorage `cb.mascot.position {side, top}`, `cb.mascot.hidden`; sessionStorage `cb.mascot.open`, `cb.mascot.conversation`, `cb.mascot.victories`.
