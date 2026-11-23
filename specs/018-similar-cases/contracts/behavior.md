# Behavior
- `GET /cases/{id}/similar?limit=n` → 200 list; 404 for another bureau's case or a precedent id; 403 restricted workspace; 401 anonymous.
- `POST /similar-cases/search` → 200 list; 422 for empty text; bureau from the session only.
- Ordering: score descending, then non-precedents first, then case number. Source and its `-N` siblings never appear.
- UI: card on the case overview (5 items, "Tümünü gör" → `/ai/benzer-davalar?dava=<id>`); AI page with "Davaya göre" and "Metinle ara" tabs; empty and error states; precedent links go to `/emsaller?karar=<id>`.
