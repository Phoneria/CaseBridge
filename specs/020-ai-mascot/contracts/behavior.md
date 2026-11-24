# Behavior
- `POST /chat/conversations/{id}/messages` with `{content}` behaves exactly as before. With `{content, data_tools: true, context?}` the stream adds `tool` and `sources` events and `done.sources`; at most 4 tool calls; restricted workspace accounts 403 (unchanged dependency).
- Tools return only the caller's bureau; another bureau's id, a precedent id as a case, or an unknown id → "Dava bulunamadı"; precedents only via `get_precedents`; client contact details never returned.
- No planning request ever contains document text; document snippets reach the answer wrapped in `<belge_metni>`.
- Every tool call writes one `ai.tool_used` audit row with ids only.
- UI: cat bottom right on workspace pages for users with the AI menu; drag snaps left/right and persists; click or ⌘J/Ctrl+J opens the panel; Esc/– closes; "Kediyi gizle" hides; source chips link to app pages; modes per FR-003.
- Assistant messages carry `sources` (null without data tools); `GET /chat/conversations/{id}` returns them and both the panel and the full chat page render them as chips.
- `GET /chat/export.jsonl` omits data-tool answers and their questions unless `include_data_tool_answers=true`.
