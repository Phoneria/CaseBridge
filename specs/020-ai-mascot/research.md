# Research
- The chat providers only streamed text. Adding a non-streaming `plan_tool_calls` keeps the streaming path and persistence in `chat_stream` unchanged; the tools run before the answer and their results go in as a data-only system turn, so no provider-specific tool-result message format is needed.
- The request session is closed before a StreamingResponse body runs, so the runner opens its own session from the existing `session_factory` and the principal is captured before streaming.
- Prompt injection: delimiting and instructions help but are not enough on their own, so the structural rule is that document text is never shown to a planning request; the mock planner reads only the user's words.
- `management_audits` already feeds the bureau audit panel, so tool calls are visible to the bureau admin without a new table.
- The supplied mascot art came as 1254×1254 transparent PNGs (`lawyer_cat_mascot.zip`); converted with Pillow to WebP at 128 and 256 px (272 KB for all 20 files).
- Restricted workspace accounts are blocked from `/chat` by `get_current_user`, so hiding the cat for them matches the server.
