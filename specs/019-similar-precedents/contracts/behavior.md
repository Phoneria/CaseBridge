# Behavior
- `GET /cases/{id}/similar-precedents?limit=n` → 200 list ordered by score, then text score, then case number; 404 another bureau's case, a precedent id or unknown id; 403 restricted workspace; 401 anonymous; 422 limit outside 1–20.
- Only `is_precedent` rows of the session bureau; never the source case or ordinary cases.
- UI: "Benzer Davalar" button on the case overview opens a right-hand dialog with 8 results, "Neden benzer?" toggle, "Emsali aç" → `/emsaller?karar=<id>`, link toggle only when the user may edit the case; Escape or ✕ closes.
