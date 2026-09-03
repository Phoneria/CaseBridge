# CaseBridge — Test Report

Generated at Milestone 10 (Final Validation). All suites below were executed in this environment on the date of this report; nothing here is claimed without having actually run and passed.

## Summary

| Suite | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
| Backend — unit | 38 | 38 | 0 | 0 |
| Backend — integration | 8 | 8 | 0 | 0 |
| Backend — API | 49 | 49 | 0 | 0 |
| Backend — AI contract | 11 | 11 | 0 | 0 |
| **Backend total** | **106** | **106** | **0** | **0** |
| Frontend — component (Vitest + RTL) | 31 | 31 | 0 | 0 |
| E2E (Playwright, real backend + frontend) | 4 | 4 | 0 | 0 |
| Optional real-OpenAI test | 1 | — | — | 1 (opt-in, not run — no `OPENAI_API_KEY` configured in this environment) |
| **Grand total (default suites)** | **141** | **141** | **0** | **0** |

No test in the default suites was skipped, xfailed, or excluded. No test is reported as passing without having been executed.

## Backend — 106/106

Run: `pytest -v` from `backend/`. Uses `MockProvider` throughout (no OpenAI credits consumed, no network access).

- `tests/unit/` (38): config loading, JWT/password hashing, LLM provider interface + provider factory, tenant-isolation helper logic, structured AI output schema validation, simulation orchestration (agent call order and error propagation), CORS origin configuration.
- `tests/integration/` (8): case repository search/filtering, document storage service (including the path-traversal regression test), seed script creation + idempotency.
- `tests/api/` (49): auth, users, cases (CRUD, tenant isolation returns 404 not 403 across firms), documents (upload/list/delete, sanitized filenames), simulations (start, persisted terminal state on both success and provider failure), analytics overview, institutional memory search, case handover generation.
- `tests/ai_contract/` (11): API key never logged or exposed via any endpoint, structured AI response always includes the disclaimer and a bounded score, agent prompts never fabricate facts not present in the case context.

## Frontend — 31/31

Run: `npm run test` (Vitest + React Testing Library) from `frontend/`. Also verified: `npx tsc --noEmit` clean, `npx next build` succeeds across all 15 routes.

Covers: Sidebar navigation/active-route state, shared Loading/Error/Empty states, Dashboard (metrics, charts, upcoming hearings, error/loading), case list (search, create-case form, empty state), case detail (all tabs including the new Devir Raporu/handover tab, document upload, add-development form, simulation start + result rendering), `SimulationResultCard` (always renders "AI Değerlendirmesi: %N", never a certainty claim, always shows the disclaimer), Analytics (metrics, empty-dataset handling, error state, and the new lost-cases list with links into each case).

## E2E — 4/4

Run: `npm test` (Playwright) from `tests/e2e/`, against the real running application — a dedicated backend (isolated SQLite DB, freshly seeded on every run) and the real Next.js dev server, driven by the pre-installed Chromium build. All 4 flows required by the spec were implemented and pass:

1. **Full case lifecycle** — login → dashboard → create case → upload a document → run an AI simulation → structured result rendered.
2. **Existing case, new simulation** — login → open a seeded case → add a development → run two simulations → both results present for comparison.
3. **Analytics → lost case → case detail** — login → Analitik → lost-cases list → open the relevant case.
4. **Case handover** — login → open a case → generate the handover report → report rendered (current situation, arguments, risks, next steps).

Because no `OPENAI_API_KEY` is configured for E2E (by design — E2E never spends real API credits), all AI-backed steps run against `MockProvider`. This validates the complete application flow and the AI response contract (structured JSON, disclaimer, bounded score) end-to-end, but not real model output quality — see below.

## Optional real-OpenAI test — not run

`backend/tests_manual/test_real_openai_simulation.py` runs the full four-agent pipeline (Researcher → Plaintiff → Defendant → Judge) against the real OpenAI API and asserts the response still satisfies the `AIAnalysisResult` contract. It is excluded from `testpaths` in `pytest.ini` and additionally gated behind a `--run-real-openai` flag plus a live `OPENAI_API_KEY`, so it never runs accidentally and was not run for this report (no key configured in this environment). To run it: `pytest tests_manual -m real_openai --run-real-openai` from `backend/`, with `OPENAI_API_KEY` set.

## Known MVP limitations

See `README.md` → "Known MVP limitations" for the full list (no vector DB, mock legal-update data, no dedicated Task entity, no upload size limit, `logout` does not revoke the JWT, no pagination, etc.). None of these were hidden or worked around in the tests above — where a feature doesn't exist yet, the corresponding UI shows an honest "coming soon" empty state rather than fabricated data.
