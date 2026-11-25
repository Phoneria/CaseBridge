# Data model
## FeatureContract
No table or column changes; nothing is persisted.

Request `SiteChatRequest`: `messages` 1–27 items `{role: user|assistant, content}` (user ≤ 500 chars, assistant ≤ 1,500), last item from the user; `lang` tr|en (page hint); `turnstile_token` (≤ 2,048, only checked when Turnstile is on).

Response 200 `{answer, kind: answer|refusal, lang, knowledge_version}`. Errors `{detail, code, lang, knowledge_version}`: 422 `turn_limit` (or validation), 429 `rate_limited`, 503 `busy` | `unavailable`, 403 `verification_failed`; 403 plain text for a disallowed Origin.

In-memory only: per-IP minute windows and day counters, the day's token total (reset at local midnight or restart). Log line: `Site chat turn: kind=… topic=… lang=… tokens=…`.

Browser: localStorage `casebridge-site-cat-position {side, top}` only.
