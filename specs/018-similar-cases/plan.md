# Plan
- Backend: `app/services/similar_cases.py` (normalisation, court type, sibling rule, TF-IDF corpus per bureau with a small LRU/TTL cache keyed by bureau and the bureau's case count + latest `updated_at`), `app/schemas/similar_case.py`, `app/api/routes/similar_cases.py` (two routers registered in `main.py`). Source lookup reuses `CaseService.get_case` and `get_current_law_firm_id`, so tenant scope and restricted-workspace rules are the existing ones. Pure Python; no new dependency; no Alembic revision.
- Frontend: `SimilarCase` type, `getSimilarCases`/`searchSimilarCases`, `outcomeColor` in `chartTheme.ts`, shared `SimilarCaseList`, `SimilarCasesCard` in the case overview, `SimilarCasesView` and `/ai/benzer-davalar` route, AI navigation entry and header title.
- Existing access model (recorded): lawyers read every case of their bureau (writes are limited to the responsible lawyer); this feature does not widen or narrow that.
- Version: `node scripts/update-version.mjs` → 0.47.
