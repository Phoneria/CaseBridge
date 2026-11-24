# Behavior
- `GET /cases/{id}/similar-precedents?limit=n[&outcome=..][&court=..][&min_score=..][&precedent_id=..][&explain=true]` → 200 `{summary, source, items}`, items ordered by score, then text score, then case number; 404 another bureau's case, a precedent id or unknown id; 403 restricted workspace; 401 anonymous; 422 limit outside 1–20.
- Only `is_precedent` rows of the session bureau; never the source case or ordinary cases.
- UI: "Benzer Davalar" button on the case overview opens a right-hand dialog with 8 results, "Neden benzer?" toggle, "Emsali aç" → `/emsaller?karar=<id>`, link toggle only when the user may edit the case; Escape or ✕ closes.
- Filters narrow; the summary covers all filtered matches and `available_courts` ignores the filters. 422 for an unknown outcome or min_score outside 0–100.
- `explain=true` never fails the request: each item gets `ai_explanation` with status `ai` or `fallback` within `SIMILARITY_EXPLAIN_TIMEOUT_SECONDS`.
- UI: summary header, filters, sort, "Ayrıntılar" opens the detail view; "Karşılaştır" shows the side-by-side table; "Yapay zekâ açıklaması" asks for one precedent.
