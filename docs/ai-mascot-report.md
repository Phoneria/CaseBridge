# CaseBridge AI floating cat and firm-scoped data chat — stages 1 and 2

Branch `feat/ai-mascot` (from main 015493b), application **v.0.50**, not released. Spec: `specs/020-ai-mascot/`. Change record: `specs/changes/ai-mascot.json`.

## What was built

**Stage 1 — the cat (frontend).** A floating cat sits at the bottom right of every workspace page rendered by `AppShell`. Users can drag it with mouse, pen or touch, and it snaps to the nearer left or right edge. It stays inside the viewport when the window is resized, and its position is saved in `localStorage` (every read and write is wrapped in try/catch).

Clicking the cat, or pressing ⌘J / Ctrl+J, opens a 400×560 chat panel; below 640 px it becomes a full-screen sheet. Esc or "–" closes the panel and returns focus to the cat. "Kediyi gizle" hides the cat; a small "CaseBridge AI'ı göster" button or the shortcut brings it back.

One pure state machine in `frontend/src/lib/mascot.ts` drives the ten poses. The priority order is:

1. Chat activity: thinking, then researching, then working.
2. Victory, shown once per won case.
3. Page poses: reading on document pages, courtroom on Canlı Duruşma.
4. Sleeping, after 3 minutes without input.
5. Rare tea-break or dancing, at most once every 10 minutes.
6. Idle.

Poses crossfade over about 200 ms, and `prefers-reduced-motion` turns off both the fade and the snap movement.

**Stage 2 — data tools (backend).** The chat model can call eight read-only tools: `search_cases`, `get_case`, `search_documents`, `get_hearings`, `get_tasks`, `search_clients`, `get_precedents` and `get_calendar`. The tools never run SQL from the model. Each one calls the same service the REST route uses (`CaseService`, `DocumentService`, `HearingService`, `TaskService`, `ClientService`, `CalendarService`), and `get_precedents` uses the precedent query that was moved out of `GET /precedents` into `firm_precedents()`.

The firm and user always come from the session, never from tool arguments. Answers stream through the existing `chat_stream`, which now also sends `tool` progress events, a `sources` event, and `done.sources`. The panel shows the sources as clickable chips.

## How a turn runs

1. The panel posts to the existing `POST /chat/conversations/{id}/messages` with `data_tools: true` and `context {route, case_id}`. The full chat page sends neither, so it behaves exactly as before.
2. `ChatToolRunner` opens its own DB session; the request session closes before a streaming body runs. It then checks the workspace restriction in the database and keeps the page's case id only if that case belongs to the caller's firm. Ids are stripped from the route hint.
3. The model is asked which tools to call. `ChatProvider.plan_tool_calls` uses OpenAI function tools or Claude tool use; Ollama plans no tools, and mock mode uses deterministic keyword rules.
4. A turn allows at most 2 planning rounds and 4 calls. Each call writes an audit row.
5. **A round that returned document text ends planning**, so nothing a document says can choose another tool.
6. The answer streams with a data-aware system prompt. Tool results are passed as a separate system message holding data only; document excerpts are wrapped in `<belge_metni>`, with angle brackets in stored text neutralised.

## Limits

| Limit | Value |
|---|---|
| Rows per tool | 8 |
| Document snippet | 320 characters |
| Stored text field | 600 characters |
| Tool calls / planning rounds per turn | 4 / 2 |
| Tool results in the prompt | 12 000 characters |
| Source chips per answer | 12 |
| Calendar range | clamped to 62 days |

## Decisions

1. **Mascot assets.** The WebP files named in the brief were not in the repository. The art was found as 1254×1254 transparent PNGs in `~/Downloads/lawyer_cat_mascot.zip`. I converted them with Pillow to `frontend/public/mascot/cat-<mode>@{128,256}.webp` (20 files, 272 KB). `10_tea_break.png` became `cat-tea-break`.
2. **Tools are opt-in per request** (`data_tools`). Only the floating panel turns them on. The full "Hukuk Asistanı" page keeps its current prompt and behaviour, so its tests and training export are unaffected.
3. **Planning is a separate non-streaming call on the same provider instance.** That instance is resolved through `get_chat_provider_resolver` → `ai_credential_scope`, so the per-firm key lookup is the one every other AI feature uses, with no platform-key fallback. The streaming and persistence code was not touched. Tool results are passed as a system message, so no provider-specific tool-result message format is needed.
4. **Injection defence is structural.** Instructions in the prompt help but are not relied on: document text never reaches a planning request. The mock planner reads only the user's own message and the page case line.
5. **Audit rows go into `management_audits`.** One row per tool call holds the actor, `ai.tool_used`, the tool name, the conversation id, `{tool, record_ids}` and the time — no arguments and no content. That table already feeds Büro Yönetimi → işlem geçmişi, which now labels these rows "CaseBridge AI kayıt okudu". There is no migration.
6. **Who sees the cat.** It is shown to the users who see the CaseBridge AI menu. Workspace-restricted accounts are refused `/chat` by `get_current_user`, so the cat is hidden for them, and the tool layer refuses them again. Platform admins and presentation mode get no cat. If the firm's AI key is missing, the cat still appears and the panel shows the `/chat/status` message, the same behaviour as the chat page.
7. **Client contact details are excluded.** `search_clients` returns only names and case counts; phone, e-mail and address never reach a prompt.
8. **Precedent rules.** Case, document, task and hearing tools reach only ordinary cases. Precedents are available only through `get_precedents`. A precedent id passed as a case returns "Dava bulunamadı".
9. **Mock mode** (`CHAT_PROVIDER=mock`) plans from keywords. It reads only the user's message (and a quoted phrase as the search query) plus the open case, and runs one round. It answers "Büro kayıtlarınıza göre ilgili kayıtlar: …" with the source labels, so tests and demos are deterministic.
10. **Persistence across pages.** Each page mounts its own `AppShell`, so the panel's open state and conversation id are kept in `sessionStorage` and survive navigation. An answer still streaming when the user navigates is stopped, and the existing stream code saves it as "stopped".
11. **Victory** shows once per case per tab session. The case page broadcasts `casebridge:case-viewed` with the outcome; the cat does not fetch the case itself.
12. **Version.** Bumped to v.0.50 by `scripts/update-version.mjs`, because application behaviour changed.
13. **Saved sources (follow-up).** Sources are saved on the answer in a new nullable JSON column, `chat_messages.sources` (migration `a7c3e9d1f2b4`, additive). NULL means the answer ran without data tools; a list, possibly empty, means it ran in data-tools mode. Reopened conversations show the chips in the panel and in the full chat page, via a shared `SourceChips` component.
14. **Training export (follow-up).** `/chat/export.jsonl` leaves out every answer given in data-tools mode, together with the question it answers, both as an example and as a context turn in other examples. That includes data-tools turns where the model ended up calling no tool, because their system prompt also differs. An admin can opt back in with `include_data_tool_answers=true`; the default is off.
15. **AI budget (found during the follow-up).** The bureau's AI budget sums `prompt_tokens` and `completion_tokens` on chat messages, and tool-planning requests were not counted. Providers now report planning usage (OpenAI `usage`, Claude `input_tokens`/`output_tokens`), the runner adds it up, and the answer is saved with the total.

## Validation

Final figures are in `specs/020-ai-mascot/verification.md`. After the follow-up: SQLite 1281 passed, 1 skipped, 1 xfailed. PostgreSQL 16: 1279 passed, 2 pre-existing failures (`test_demo_template_removal.py` runs a SQLite-only `PRAGMA` itself and fails the same way on main). Vitest 877 passed.

**Backend**
- The new `tests/api/test_chat_data_tools.py` covers:
  - Isolation for every listing tool.
  - Guessed ids across all five case-scoped tools.
  - A firm id passed in the arguments is ignored.
  - Precedent rules.
  - Restricted users: denied by the tool layer, and `/chat` returns 403.
  - Contact details excluded.
  - Unknown tools and bad arguments.
  - Row and snippet limits.
  - The end-to-end stream: tools, sources, answer and audit rows.
  - Another firm's case passed as page context.
  - The unchanged no-tools path.
  - The call cap.
  - A document injection that would make an obedient model call `search_clients`.
  - The mock planner.
  - OpenAI and Claude tool-call parsing with fake clients.

**Frontend**
- `lib/__tests__/mascot.test.ts` covers the state machine, page detection and position maths.
- `components/__tests__/AiMascot.test.tsx` covers:
  - Who gets the cat.
  - Drag, snap and the saved position.
  - Clamping after a resize.
  - Storage that throws.
  - Open, close, Esc, the shortcut and minimise.
  - Hide and restore.
  - Pose changes during a streamed answer with tools, and source chips.
  - The empty, not-configured and error states.
  - Page poses, victory once, sleep and wake.
  - Rare variants.
- An API test checks that the request body carries `data_tools` and `context` only when the panel opts in.

**Browser check** (local demo, mock provider; screenshots in `artifacts/ai-mascot/`)
- `light-idle`, `light-answer-sources`: a case page in light theme. "Bu davanın duruşmaları ne zaman?" ran `get_hearings` and `get_case`, and the answer showed a working chip linking to the case.
- `dark-victory`, `dark-reading-documents`, `dark-courtroom`: the victory pose on a won case, the reading pose on its Belgeler tab, and the courtroom pose on Canlı Duruşma.
- `dark-panel-left-empty`: the cat dragged to the left edge (saved as `{"side":"left","top":340}` and restored after reload), opened with Ctrl+J, empty state, Esc closes.
- `mobile-idle`, `mobile-sheet-sources`, `mobile-light-sheet`: at 390×844 the panel is a full-screen sheet with no horizontal overflow, and "Açık görevlerim neler?" showed 4 case chips.
- The bureau audit API listed the three `ai.tool_used` rows with record ids only.
- Console: only the existing favicon 404 and the recharts `defaultProps` warnings.

**Bugs found and fixed while testing**
- The first test run showed that creating the conversation inside `send` re-triggered the "reload the saved conversation" effect, which wiped the messages on screen.
- The mock planner repeated its plan in round 2.
- The page route carried the raw case id of another firm into the prompt; ids are now replaced with `:id`.
- The browser check showed the grey cat had low contrast on the dark theme; a soft drop shadow fixed it.

## Limits and follow-ups

- Real-provider tool calling was tested with fake OpenAI and Claude clients only. No live key was used.
- Release (T009) was not performed.
