# CaseBridge — TDD Test Plan (Milestone 0)

Rule for every milestone: write the test file(s) below, run them, confirm they FAIL for the right reason, then implement, then re-run until green. No feature code is written before its test exists.

Test categories map to directories:
- Unit → `backend/tests/unit/`
- Integration → `backend/tests/integration/`
- API → `backend/tests/api/`
- AI Contract → `backend/tests/ai_contract/` (always against `MockProvider`)
- Frontend component → `frontend/src/**/__tests__/` (Vitest + RTL)
- E2E → `tests/e2e/` (Playwright)
- Optional real-OpenAI → `backend/tests_manual/` (never run by `pytest`/`npm test`)

## Milestone 1 — Foundation
- `test_app_startup.py`: FastAPI app imports and boots without error
- `test_health.py`: `GET /health` returns 200 + `{"status": "ok"}`
- `test_config.py`: required env vars load; missing `JWT_SECRET` raises a clear startup error; `OPENAI_API_KEY` missing is tolerated (AI disabled, not a crash)
- `test_db_connection.py`: DB session can be created, a table can be created/dropped in a temp SQLite file
- `test_auth.py`: login with correct credentials returns JWT; wrong password returns 401; protected endpoint without token returns 401; logout/token-expiry path invalidates access
- `test_law_firm_isolation.py`: seed two firms, two users; user A cannot fetch user B's firm data by guessing/forging IDs

## Milestone 2 — Case Management
- `test_case_repository.py` (unit): CRUD methods respect `law_firm_id` filter
- `test_case_api.py`: create/read/update/archive case; required-field validation errors (422); search by name/client/opposing party; filter by status/type; case detail includes timeline ordered by date
- `test_case_events.py`: adding a CaseEvent appears in case timeline in chronological order

## Milestone 3 — Documents
- `test_document_upload.py`: upload pdf/docx/txt succeeds and stores metadata; unsupported extension (e.g. `.exe`) rejected with 400
- `test_document_association.py`: document always tied to a case + law_firm_id; deletion removes record and (mocked) storage file
- `test_document_isolation.py`: firm A cannot fetch/download firm B's document by ID

## Milestone 4 — AI Foundation
- `test_llm_provider_interface.py` (unit): `MockProvider` and `OpenAIProvider` both satisfy the same `LLMProvider` ABC/protocol
- `test_openai_provider_error_handling.py`: simulated timeout → domain-level `AIProviderTimeoutError`; simulated API error → `AIProviderError`; both handled without leaking raw exception/API key into logs or response
- `test_structured_output_validation.py`: valid JSON matching the schema (section 14) parses into `AIAnalysisResult`; malformed/missing-field JSON raises a validation error that the caller must handle (not silently stored)
- `test_api_key_security.py`: `OPENAI_API_KEY` never present in any API response body; never present in captured log output (regex-scan test log capture)

## Milestone 5 — AI Simulation
- `test_agent_prompts.py` (ai_contract): Judge/Plaintiff/Defendant/Researcher each get the correct system prompt and case context; asserts role-specific keywords present and other roles' instructions absent (guards against prompt cross-contamination)
- `test_simulation_orchestration.py`: pipeline runs in the documented order (Case Analysis → Plaintiff → Defendant → Counterarguments → Judge → Scenarios → Strategy → Final report), using `MockProvider`; Judge step receives both plaintiff and defendant outputs
- `test_simulation_persistence.py`: simulation result stored against correct `case_id`; a case can have multiple simulations, each independently retrievable

## Milestone 6 — Analytics
- `test_analytics_metrics.py`: total/active/won/lost counts, win rate %, average case duration — verified against a deterministic seeded dataset, including an empty-dataset case (0 cases → 0%, not divide-by-zero crash)
- `test_analytics_by_category.py`: success rate grouped by case_type sums correctly

## Milestone 7 — Institutional Memory & Handover
- `test_historical_search.py`: search by case name/client/opposing party/category/status/lawyer/keyword returns expected matches, including archived cases
- `test_case_handover.py`: handover report includes overview, timeline, current status, key documents, key arguments, risks, pending tasks, upcoming dates, recommended actions; report is scoped to the correct case

## Assessment & AI safety (cross-cutting, tested in ai_contract + frontend)
- `assessment_score` rejects values outside 0–100 (Pydantic `ge=0, le=100`)
- Every AI result payload includes `ai_disclaimer` and `assessment_confidence`
- Frontend component test: score renders as "AI Değerlendirmesi: %72", never as a certainty claim

## Frontend component tests (Vitest + RTL)
- Dashboard renders metrics + charts with mock data
- Sidebar navigation renders all items and routes
- Case list renders rows, empty state, loading state
- Case detail renders tabs + timeline
- Simulation view renders 4-agent results + disclaimer
- Analytics page renders charts
- Error state component renders on API failure

## E2E (Playwright) — 4 flows required by spec section 22
1. Login → Dashboard → Create Case → Upload Document → Run AI Analysis → Run Simulation → View Result
2. Login → Open Existing Case → Add Development → Run New Simulation → Compare Result
3. Login → Analytics → Inspect Lost Cases → Open Relevant Case
4. Login → Open Case → Generate Handover Summary → View Handover Report

## Optional real-OpenAI integration test
`backend/tests_manual/test_real_openai.py` — single, minimal prompt/response round-trip. Not collected by default `pytest` run (excluded via `pytest.ini` `testpaths`/marker). Run explicitly via e.g. `pytest backend/tests_manual -m real_openai --run-real-openai`. Must not run in CI or on every `pytest` invocation.

## Test commands (finalized in Milestone 1 setup)
- Backend: `pytest` (from `backend/`) — mocks only, no network
- Frontend unit: `npm run test` (Vitest, from `frontend/`)
- E2E: `npx playwright test` (from `tests/e2e/` or repo root config)
- Real OpenAI (manual, costs tokens): `pytest backend/tests_manual -m real_openai --run-real-openai`
