# CaseBridge — Progress Log

## Milestone 0 — Planning
Status: COMPLETE

Done:
- Inspected environment (Python 3.11.15, Node 22.22.2, npm 10.9.7, empty cwd)
- Created isolated `casebridge/` directory with backend/frontend/tests/docs structure
- Finalized architecture: FastAPI + SQLAlchemy + SQLite backend, Next.js + TS + Tailwind frontend, LLMProvider abstraction (OpenAI + Mock)
- Defined DB entities: LawFirm, User, Case, CaseEvent, Document, Simulation, AIAnalysis, Task, LegalUpdate
- Wrote TDD test plan covering all milestones (`docs/TEST_PLAN.md`)
- Created `.env`, `.env.example`, `.gitignore`
- Created `README.md`, `PROGRESS.md`

Tests: none yet (no implementation code exists — by design, Milestone 0 is planning only)

Next: Milestone 1 — Foundation (backend startup, health endpoint, DB, config, auth, law firm isolation). Tests written first.

---

## Milestone 1 — Foundation
Status: COMPLETE

Tests (TDD: written first, confirmed failing with ModuleNotFoundError, then implemented):
20 passed
0 failed

Implemented:
- FastAPI app (`app/main.py`) with lifespan startup (creates tables), `/health` endpoint
- `Settings` (pydantic-settings): required `JWT_SECRET`, optional `OPENAI_API_KEY` (AI gracefully disabled if absent)
- SQLAlchemy 2.0 models: `LawFirm`, `User` (role enum admin/lawyer)
- Password hashing (bcrypt via passlib) and JWT issue/decode (python-jose)
- `POST /auth/login`, `POST /auth/logout`, `GET /users/me`, `GET /users`, `GET /users/{id}`
- Law firm isolation enforced in `UserRepository`/routes via `get_current_law_firm_id` dependency (never trusts client-supplied firm id); cross-firm lookups return 404, not 403 (no existence leak)
- Test infra: `conftest.py` with isolated in-memory SQLite per test, `two_firms_two_users` fixture

Notes:
- Demo email domain uses `.dev` (not `.local`) — pydantic's `EmailStr` rejects reserved-use TLDs (`.local`, `.test`, `.invalid`, `.localhost`); avoid those in any future seed/demo data.
- `on_event("startup")` replaced with FastAPI `lifespan` (avoids deprecation warning).

Next: Milestone 2 — Case Management. Tests first.

## Milestone 2 — Case Management
Status: COMPLETE

Tests (TDD: written first, confirmed failing — 404s/missing model errors — then implemented):
32 passed (20 from Milestone 1 + 12 new)
0 failed

Implemented:
- `Case` and `CaseEvent` models (case_type, status, outcome enums per product spec section 26/7)
- `CaseRepository` / `CaseEventRepository`, both mandatory-scoped by `law_firm_id`
- `CaseService`: create/update/archive/list/search/filter, timeline retrieval, event creation
- API: `POST /cases`, `GET /cases` (search + status/case_type filters, excludes archived by default), `GET /cases/{id}` (detail incl. chronological `timeline`), `PATCH /cases/{id}`, `POST /cases/{id}/archive`, `POST /cases/{id}/events`
- Isolation: cross-firm access to another firm's case returns 404 on read/update/archive; archived case stays fetchable by ID but drops out of default list

Next: Milestone 3 — Documents. Tests first.

## Milestone 3 — Documents
Status: COMPLETE

Tests (TDD: written first, confirmed failing with 404s, then implemented):
39 passed (32 from Milestones 1-2 + 7 new)
0 failed

Implemented:
- `Document` model (pdf/docx/txt), local-disk storage under `backend/storage/<law_firm_id>/<case_id>/`
- Best-effort text extraction (`app/services/text_extraction.py`) using pypdf/python-docx; failures degrade to `extracted_text=None`, never crash upload
- `DocumentRepository` (tenant-scoped), `DocumentService` (extension-based type validation, rejects unsupported types with 400)
- API: `POST /cases/{id}/documents` (multipart upload), `GET /cases/{id}/documents`, `DELETE /documents/{id}`
- Isolation: firm B gets 404 on another firm's case documents (list) and on direct document delete by ID
- Test infra: autouse `_isolated_storage_dir` fixture routes uploads to a per-test tmp dir (no disk accumulation across runs)

Next: Milestone 4 — AI Foundation. Tests first.

## Milestone 4 — AI Foundation
Status: COMPLETE

Tests (TDD: written first, confirmed failing with ModuleNotFoundError, then implemented):
60 passed (39 from Milestones 1-3 + 21 new)
0 failed

Implemented:
- `LLMProvider` ABC (`app/ai/providers/base.py`) — business logic depends only on this, never the `openai` SDK directly
- `MockProvider` (records calls for contract tests, default used whenever `OPENAI_API_KEY` is unset)
- `OpenAIProvider` — the only module allowed to import `openai`; translates `openai.APITimeoutError`/`openai.OpenAIError` into our own `AIProviderTimeoutError`/`AIProviderError`, never leaks the API key in exception messages or logs
- `get_llm_provider()` factory — swaps Mock/OpenAI automatically based on `settings.ai_enabled`
- `AIAnalysisResult` structured schema (section 14): summary, strong/weak points, opposing arguments, missing info, scenarios, questions, recommended actions, `assessment.score` (0-100 enforced), `assessment.confidence`, `ai_disclaimer` (always populated, defaults to a clear non-guarantee disclaimer), `requires_verification`
- `parse_ai_response()` — validates raw JSON text into `AIAnalysisResult`, raising a single `AIResponseValidationError` for both malformed JSON and schema violations (never a bare JSONDecodeError/pydantic ValidationError leaking out)

Next: Milestone 5 — AI Simulation (Judge/Plaintiff/Defendant/Researcher agents + orchestration). Tests first.

---

## Code review after Milestone 4 (user-requested check)
Found and fixed 2 real bugs (61 tests now passing, +1 regression test added):

1. **Enum storage mismatch (data-integrity bug).** SQLAlchemy's `Enum(SomeEnum)` stores the Python member's `.name` (e.g. `"KIRA"`) in the database by default, not `.value` (e.g. `"kira"`) — even for `str`-mixin enums. Invisible through the ORM (it round-trips correctly), but would break any raw SQL (planned for Milestone 6 analytics), bulk seed scripts inserting lowercase values (Milestone 25 spec), or a future Postgres native-enum migration. Fixed with a `str_enum()` helper (`app/db/types.py`, `values_callable=...`) applied to all 6 affected columns (`case_type`, `status`, `outcome`, `event_type`, `file_type`, `role`). Verified via raw sqlite3 read before/after.
2. **Path traversal in document upload (security bug).** The uploaded file's client-supplied filename was used directly in the storage path. A filename like `"../../../../evil.txt"` could resolve outside the case's storage directory. Fixed by sanitizing with `os.path.basename()` before it touches any path, applied to both the stored file and the DB `filename` field. Added `test_upload_sanitizes_path_traversal_in_filename`.

Noted but not fixed (flagged to user, low urgency for current milestone):
- No CORS middleware yet — required before Milestone 8 frontend can call the API from the browser.
- No user-registration/seed-data endpoint yet — README's "demo credentials" aren't real until a seed script exists (planned, not yet built).
- `logout` doesn't revoke the JWT (stateless tokens, documented in code comment) — acceptable for MVP, worth a line in README limitations.
- No upload size limit on documents — potential DoS via large file uploads.
- `assigned_lawyer_id` on Case isn't validated against real users in the same firm.
- No pagination on `/cases` list — will matter once Milestone 25's 100+ demo cases exist.

## Milestone 5 — AI Simulation
Status: COMPLETE

Tests (TDD: written first, confirmed failing with ModuleNotFoundError/ImportError, then implemented):
81 passed (61 from Milestones 1-4 + 20 new)
0 failed

Implemented:
- 4 agent modules (`app/ai/agents/`): Judge (neutral, structured JSON output), Plaintiff, Defendant (sees plaintiff's argument), Researcher — each with a distinct system prompt, verified prompt-isolation via contract tests, all sharing one no-fabrication/verification clause
- `run_simulation()` (`app/ai/engine.py`): Researcher → Plaintiff → Defendant → Judge pipeline against `LLMProvider` only; Judge step confirmed to receive both plaintiff and defendant output
- `Simulation` / `AIAnalysis` models (status pending/running/completed/failed, structured result fields matching section 14 schema)
- `SimulationService`: always leaves a terminal, auditable Simulation row — COMPLETED+stored AIAnalysis, or FAILED+error_message — never silently drops a run on provider timeout/error or invalid AI JSON
- API: `POST /cases/{id}/simulations` (502 on AI failure, case's simulation list still shows the failed row), `GET /cases/{id}/simulations`; `get_llm_provider_dep` FastAPI dependency makes the provider swappable per-test (no network in default `pytest` run)
- Isolation: firm B gets 404 starting/listing firm A's case simulations
- Out-of-range assessment score from a (simulated) model response is rejected (502), never stored or silently clipped

Next: Milestone 6 — Analytics. Tests first.

## Milestone 6 — Analytics
Status: COMPLETE

Tests (TDD: written first, confirmed failing with ModuleNotFoundError/KeyError, then implemented):
91 passed (81 from Milestones 1-5 + 10 new)
0 failed

Implemented:
- `AnalyticsService.compute_overview()`: total/active/won/lost cases, win rate (won/(won+lost), 0.0 on no decided cases — no divide-by-zero), average case duration (closed cases only, `updated_at - opening_date` as the closing-date proxy since there's no dedicated `closed_date` field yet — documented limitation), success rate by category
- Filters: `months` (3/6/12, else all-time) via `opening_date` cutoff, `case_type`
- API: `GET /analytics/overview`
- Isolation: firm B's overview never reflects firm A's cases
- Explicit empty-dataset test confirms zeros, not an error

Known limitation carried over: average duration uses `updated_at` as a proxy for the actual closing date — a dedicated `closed_date` field would be more precise; deferred to avoid schema churn mid-MVP.

Next: Milestone 7 — Institutional Memory & Handover. Tests first.

## Milestone 7 — Institutional Memory & Handover
Status: COMPLETE

Tests (TDD: written first, confirmed failing with KeyError/empty-result, then implemented):
102 passed (91 from Milestones 1-6 + 11 new)
0 failed

Implemented:
- Institutional memory: `CaseRepository.list_in_firm` extended with `assigned_lawyer_id` filter and description-text keyword search; `include_archived` flag exposed via `GET /cases` so archived/closed cases remain searchable (section 17) without polluting the default active-case list
- Case handover: `HandoverService.generate()` — case overview, chronological timeline, current situation, key documents, important arguments/risks (pulled from the most recent `AIAnalysis` for the case, if one exists), upcoming dates (`next_hearing_date`), recommended next steps
- API: `POST /cases/{id}/handover`; tenant-scoped (404 for another firm's case)

Known limitation (documented, not silently faked): `pending_tasks` in the handover report is always `[]` — there is no dedicated Task entity/API yet ("Görevler" was never a dedicated milestone in the build plan). Flagging this now rather than fabricating fake task data.

Next: Milestone 8 — UI Polish (Next.js/TS/Tailwind frontend, premium white CaseBridge visual design). Backend TDD portion (Milestones 1-7) is fully green: 102/102.

## Milestone 8 — UI Polish
Status: COMPLETE

Tests (TDD: written first, confirmed failing on missing modules, then implemented):
29 passed (Vitest + React Testing Library, frontend-only — separate suite from backend's 102)
0 failed

Implemented:
- Next.js 14 (App Router) + TypeScript + Tailwind CSS, Vitest + RTL test infra (jsdom, ResizeObserver polyfill for Recharts)
- Premium white design per section 4: white/light-gray surfaces, navy typography, purple/indigo AI accent, thin borders, soft shadows, rounded cards — `tailwind.config.ts` custom palette
- Sidebar with all 10 nav items (Dashboard, Davalar, Takvim, Görevler, Belgeler, Simülasyonlar, Analitik, Mevzuat Takibi, Raporlar, Ayarlar), active-route highlighting
- Dashboard: 5 stat cards, case-category bar chart, status pie chart, upcoming hearings table (from real case data), loading/error/empty states throughout
- Davalar: searchable/filterable list, inline "Yeni Dava" create form wired to the API
- Case detail: 6 tabs (Genel Bakış, Belgeler, Gelişmeler, Görevler, Simülasyonlar, Notlar), chronological timeline, document upload (drives the real `/documents` endpoint), add-development form, prominent "Simülasyonu Başlat" button, `SimulationResultCard` rendering the 4-agent structured result
- `SimulationResultCard`: assessment always rendered as "AI Değerlendirmesi: %N" (never a certainty claim), `ai_disclaimer` always shown (section 15)
- Analitik: overview stat cards, category win-rate chart, insight-card placeholders (empty state — no NLP summarization of "common factors" built yet, honestly labeled rather than faked)
- Görevler, Takvim, Belgeler (global), Simülasyonlar (global), Mevzuat Takibi, Raporlar, Ayarlar: functional nav targets with an honest "coming soon" empty state — these were never dedicated milestones in the build plan
- Login page + token-based route guard (`AppShell`, redirects to `/login` when no token)
- CORS middleware added to the backend (`app/main.py`) so the dev frontend can call the API
- `next build` production build verified clean across all 15 routes; `tsc --noEmit` clean

Known limitations (added to README): dependency audit flagged several dev-tooling-only CVEs (Next/Vite/Vitest dev-server issues) not chased for this MVP — see README; Next.js pinned to patched 14.2.35 (not the breaking-change major bump `next audit` suggested).

Next: Milestone 9 — E2E (Playwright, 4 required flows against the real running stack).

## Milestone 9 — E2E
Status: COMPLETE

Tests: 4/4 Playwright specs passed against the real running stack (backend on :8010 with a dedicated SQLite DB, frontend on :3010, Chromium via pre-installed browser at `/opt/pw-browsers`).

Implemented:
- `backend/app/db/seed.py` — idempotent demo-data seed (`python -m app.db.seed`): one demo law firm, an Admin and a Lawyer user with known credentials, and 4 demo cases (active/hearing-pending/won/lost, so both the "won/lost" and "lost cases" analytics paths have real data). 2 new integration tests (creation + idempotency), 106/106 backend tests green.
- `app/ai/provider_factory.py` — `MockProvider`'s `default_response` (used whenever `OPENAI_API_KEY` is unset) changed from a plain sentence to a valid `AIAnalysisResult` JSON payload (score 0, `requires_verification: true`, explicit "this is a placeholder, not a real AI assessment" summary/disclaimer). Previously this would fail `parse_ai_response()` and 502 any simulation run without a real key — now simulations/handovers always complete end-to-end on mocks, which is both what E2E needs and a genuine MVP correctness fix (a missing API key should degrade gracefully, not break a core flow).
- `app/core/config.py` / `app/main.py` — CORS origins moved from a hardcoded list to `settings.cors_origins` (defaults unchanged; extra origins configurable via `EXTRA_CORS_ORIGINS` env var), so the E2E frontend's port (3010) can be allow-listed without touching the app's real dev defaults (3000). 2 new unit tests.
- Two small frontend additions needed for the spec's flows 3 and 4, which had backend support but no UI wired up yet — built TDD (failing component tests written first, confirmed failing, then implemented; 31/31 frontend tests green, `tsc --noEmit` and `next build` clean):
  - `AnalyticsView`: new "Kaybedilen Davalar" (lost cases) list with links into each case's detail page — makes "Analytics → inspect a lost case → open it" (flow 3) actually possible.
  - `CaseDetailView`: new "Devir Raporu" tab with a "Devir Raporu Oluştur" button rendering the case handover report (current situation, important arguments, risks, recommended next steps) — `generateHandover` existed in the API client since Milestone 7 but had no UI; makes flow 4 possible.
- `tests/e2e/` — Playwright project (`@playwright/test`, pinned Chromium at `/opt/pw-browsers/chromium-1194`, `playwright install` never run). `playwright.config.ts` boots backend (venv uvicorn, isolated SQLite DB wiped and reseeded on each run) and frontend (`next dev`) automatically via `webServer`. 4 specs, one per required flow from the spec:
  1. `01-case-lifecycle.spec.ts` — login → dashboard → create case → upload document → run simulation → view AI result
  2. `02-existing-case-simulation.spec.ts` — login → open a seeded case → add a development → run two simulations → both results visible for comparison
  3. `03-analytics-lost-cases.spec.ts` — login → Analitik → lost-cases list → open the relevant case
  4. `04-case-handover.spec.ts` — login → open a case → generate handover report → view it

Known limitation (documented in README): E2E always runs against `MockProvider` (no `OPENAI_API_KEY` in the test env) — this verifies the full application flow and the AI response contract, but not real model output quality; that is covered separately by the optional real-OpenAI test (not yet written — planned for Milestone 10 cleanup).

Next: Milestone 10 — Final Validation (run every suite, produce `TEST_REPORT.md`).

## Milestone 10 — Final Validation
Status: COMPLETE

All suites re-run clean end-to-end in one pass: backend 106/106, frontend 31/31, E2E 4/4 (141/141 total across default suites, 0 failed, 0 skipped). See `TEST_REPORT.md` for the full breakdown by category.

Implemented:
- `backend/tests_manual/test_real_openai_simulation.py` — the optional real-OpenAI integration test required by the spec (section 24). Runs the full 4-agent pipeline against the real API and asserts the response still satisfies `AIAnalysisResult`. Triple-gated so it can never run by accident: excluded from `pytest.ini`'s `testpaths`, requires the explicit `-m real_openai --run-real-openai` flags (`tests_manual/conftest.py`), and skips itself if `OPENAI_API_KEY` isn't set. Verified all three gates actually skip it correctly; not run against the real API in this environment (no key configured), so it is reported as "not run," not "passed."
- `TEST_REPORT.md` — final deliverable per spec: suite-by-suite pass/fail/skip counts, what each suite covers, and an explicit statement that the real-OpenAI test was not executed (rather than silently omitting it or claiming a pass).

This is the last milestone in the build plan. CaseBridge MVP is feature-complete per the original spec's Definition of Done: a user can log in, create a case, upload a document, run a 4-perspective AI simulation and get a labeled-as-estimate structured result, add a development, generate a handover report, and view firm-wide analytics including drill-down into lost cases — all exercised by a real, passing E2E run, not just unit-level mocks.
