# Research
- Read access today: `GET /cases/{id}` and `GET /precedents/{id}` are scoped by the session bureau only; lawyers read all bureau cases, while writes need the responsible lawyer or an admin. Restricted workspace accounts are blocked in `get_current_user`.
- Turkish text: Python `str.lower()` maps "I" to "i", so I/İ are replaced first (I→ı, İ→i); tokens are then folded (ı→i, ş→s…) so ASCII-typed input still matches. Five-letter prefix stems are a known cheap stemmer for Turkish retrieval.
- Claim boilerplate ("alacağının tahsili", "nedeniyle", "kabul edildi") linked unrelated files at a 0.03 cosine threshold; generic stems are dropped and the threshold is 0.08.
- Local demo bureau (20 cases): one ranking takes 3–6 ms, so per-request computation is adequate; the cache only avoids re-tokenising unchanged bureaus.
