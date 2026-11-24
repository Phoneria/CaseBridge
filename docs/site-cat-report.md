# Site cat — public CaseBridge chat on the marketing website

Branch `feat/site-cat`, rebased on main 36a69a9 (after PR #120). Marketing site **v.0.66**, application **v.0.51**. Not pushed, not released. Spec: `specs/021-site-cat/`. Change record: `specs/changes/site-cat.json`.

## Architecture

```
casebridge.com.tr (static)                      app.casebridge.com.tr/api (FastAPI, one process)
  site-cat-loader.js  (1 KB, every page)          PublicCORSMiddleware  (/public/* only)
    └─ at idle: site-cat.css + site-cat.js  ──►   POST /public/site-chat
         site-cat-model.mjs (FAQ, poses, maths)     ├─ validation (500 chars, last turn = visitor)
         chips → static FAQ, no request             ├─ Turnstile (only if a secret is set)
         typed question → fetch (no cookies)        ├─ turn limit (12) → per-IP limits (10/min, 50/day)
                                                    ├─ guards: injection / legal advice → fixed refusal
                                                    ├─ daily token budget → "Şu an yoğunuz"
                                                    └─ platform OpenAI key + SITE_CHAT_MODEL (or mock)
                                                         system prompt = rules + site-knowledge.md
```

- **Separate from the in-app CaseBridge AI.**
  - Its own package (`backend/app/site_chat/`) and route.
  - No `get_db` and no authentication.
  - No tools and no bureau key lookup.
  - A test inspects the route's dependencies and the module sources, and fails a turn that touches the ORM.
- **Knowledge file:** `backend/app/site_chat/site-knowledge.md`, version `2026-11-24.1`, 1,096 words. It lives in the backend because the backend image is built from `backend/` only. It was written only from the homepage copy, the site FAQ, `README.md`, the Benzer Davalar report, `AGENTS.md`/`todo.md` (per-firm keys) and `PRODUCT.md`.
- **Model:** the platform key (`get_openai_api_key(None)`) with `SITE_CHAT_MODEL` (default `gpt-4o-mini`).
  - Output is capped at 350 tokens, with a 20 s timeout and one retry.
  - The app's streaming OpenAI client is reused and its output joined into one string. That gives token usage for the budget; the answer is returned as plain JSON.
- **Mock mode:** with `LLM_PROVIDER=mock`, the answer is deterministic. It quotes the matching section of the knowledge file, prefixed with "[Test yanıtı]" or "[Test answer]".
- **Widget:** plain JavaScript and CSS, 28 KB uncompressed in total (loader 1.3 KB, logic 12 KB, model 9.5 KB, CSS 5 KB), plus 144 KB of WebP for five poses at two sizes. The loader waits for `load` and idle time, so the page is never delayed.

## Limits

| Limit | Value | Setting | When hit |
|---|---|---|---|
| Message length | 500 characters | — | 422 (also capped in the field) |
| Turns per conversation | 12 visitor questions | — | 422 `turn_limit`, "start a new chat" |
| Per IP | 10 / minute, 50 / day | `SITE_CHAT_PER_IP_PER_MINUTE`, `_PER_DAY` | 429 `rate_limited` |
| Daily budget, all visitors | 1,500,000 tokens | `SITE_CHAT_DAILY_TOKEN_BUDGET` | 503 `busy`, "Şu an yoğunuz…" |
| Output per answer | 350 tokens | `SITE_CHAT_MAX_OUTPUT_TOKENS` | — |
| Kill switch | on | `SITE_CHAT_ENABLED` | 503 `unavailable` |
| Bot check | off | `SITE_CHAT_TURNSTILE_SECRET` | 403 `verification_failed` |

The budget check is made before each call, using a conservative estimate (prompt characters ÷ 3, plus the output cap). After the call, the provider's reported usage is added. Refusals and the quick-question chips cost nothing and keep working when the budget is used up.

## Decisions

1. **Knowledge file location:** `backend/app/site_chat/`, not `web-page/`, because the Docker build context is `backend/`. The widget's four chip answers are a separate static FAQ in `web-page/site-cat-model.mjs`, using the site's own wording.
2. **Plain JSON, not streaming.** Answers are short (≤ 350 tokens), and a single response makes budget accounting and every error state simple.
3. **Deterministic guards before the model.**
   - Injection phrases in any turn (including a forged "assistant" turn), and requests about the visitor's own legal situation, get fixed refusals without a model call.
   - The legal-advice patterns are deliberately narrow and first-person ("davamı…", "ev sahibim…", "should I sue"), so product questions like "CaseBridge dilekçe hazırlamaya yardımcı oluyor mu?" still reach the model.
   - Subtler cases are left to the system prompt.
4. **Unknown facts.** `TODO:` lines reach the model as "BİLİNMİYOR (do not answer; offer the demo link)", so it can't fill them in. In mock mode, pricing and anything unmatched get the "I don't have that; book a demo" answer.
5. **CORS.**
   - A separate outermost middleware handles `/public/*`, so the authenticated routes' CORS list is unchanged.
   - A request carrying a foreign `Origin` is rejected with 403 before it can spend tokens.
   - Starlette's app-wide middleware adds `Access-Control-Allow-Credentials: true` to every simple response. The browser check found this, and the `/public/*` middleware now strips it.
   - `localhost` and `127.0.0.1` on any port are allowed, as the brief asked; anything a page on a visitor's own localhost sends is still rate-limited.
6. **Limits are in memory.** This is the same trade-off as the existing login limiter: production runs one uvicorn process (the compose file forbids `--workers`), and limits reset on restart. If the backend is ever scaled out, move them to a shared store.
7. **Language:** detected from the visitor's message (Turkish characters and common words), with the page's `lang` / `?lang=en` as a hint. Today all marketing pages are Turkish; English chips and copy appear with `?lang=en` or on a page with `lang="en"`.
8. **Booking link:** rendered as a real link only when it is exactly the known Google Calendar URL. Every other text is inserted as text, never as HTML.
9. **The conversation lives only in the page.** Reloading starts fresh; only the cat's position is saved, in localStorage.
10. **Cat images:** the five WebP poses are byte-identical copies of `frontend/public/mascot/` (from PR #120) in `web-page/assets/site-cat/`, because the static site is published separately from the app. The source art is `lawyer_cat_mascot.zip`.
11. **Versions:**
    - Marketing goes v.0.65 → v.0.66 (`website-version.json`, homepage meta and footer).
    - The application goes v.0.50 → v.0.51: rebased after PR #120 (which took v.0.50), and the version script hashes the backend.

## Privacy

- **Nothing is stored:** no conversation, no message text, no IP address.
- **Logs:** each turn writes one line, `Site chat turn: kind=… topic=… lang=… tokens=…`. The topic is a coarse keyword label such as `security`, `demo`, `legal_advice`, `injection` or `other`. A test checks that names, ID numbers and the client address never appear.
- **IP addresses** exist only as keys in the in-memory rate limiter for one day, then disappear.
- **The panel** says "Lütfen kişisel veya dava bilgisi paylaşmayın." and the model is told not to repeat personal details.
- **Requests** are sent with `credentials: 'omit'`; the widget uses no cookies and no sessionStorage.
- **OpenAI:** visitor questions are sent to OpenAI with the platform key. That should be mentioned in the site's privacy text (TODO below).

## TODOs for the owner

In `backend/app/site_chat/site-knowledge.md` (the cat refuses these topics until they are filled in):
1. KVKK compliance statement: data controller and processor roles, and a link to the privacy notice.
2. Where data is hosted (country and provider), backups and retention periods.
3. Certifications or independent security audits, if any. None are claimed today.
4. Which AI providers and models customers can use.
5. Whether there is a free trial, plus its length and conditions.
6. Pricing and plans. The site has none, so the cat never names a price.
7. A contact e-mail or phone number. Only the booking link exists today.
8. Supported browsers, a mobile app, and UYAP or other integrations.

Outside the file:
- The marketing site's server block isn't in this repo. If it sets a Content-Security-Policy, its `connect-src` must allow `https://app.casebridge.com.tr`.
- Decide whether to turn on Turnstile. If so, set `SITE_CHAT_TURNSTILE_SECRET` and add the Turnstile site key and token to the widget; the widget does not render Turnstile yet, so turning it on today would block every question.
- Add a sentence about the site chat to the website's privacy text: questions are processed by an AI provider and not stored.
- If Cloudflare sits in front of `app.casebridge.com.tr`, confirm that Caddy forwards the real visitor IP (otherwise all visitors share one rate-limit key).
- Test with the real platform key on staging (T009).

## Cost estimate (gpt-4o-mini)

**Inputs to the estimate**
- **Prices:** gpt-4o-mini list prices as I know them: $0.15 per 1M input tokens, $0.60 per 1M output tokens, and $0.075 per 1M for cached input. Check the current OpenAI pricing page before relying on these.
- **Prompt size:** the system prompt (rules plus knowledge) is about 9,970 characters, roughly 3,300 tokens of mostly Turkish text. This is an estimate; `tiktoken` wasn't available to count it.
- **Per typed question:** about 3,300 + ~200 tokens of history in, and ~150 tokens out (the cap is 350).
  - Input: 3,500 × $0.15/M ≈ $0.00053.
  - Output: 150 × $0.60/M ≈ $0.00009.
  - Total: about **$0.0006**.

**Per 1,000 conversations**

| Case | Assumption | Cost |
|---|---|---|
| Typical | 3 typed questions each (chip questions are free) | ≈ $1.9 |
| With prompt caching | the identical ~3,300-token prefix is cached automatically above 1,024 tokens | ≈ $1.1 |
| Worst case | all 12 turns used, long answers, a growing history (~7k input tokens per turn on average) | ≈ $15 |

**Hard ceiling:** the daily budget caps spend regardless of traffic. 1.5M tokens a day is about $0.25–0.30 a day (≈ $9 a month), or roughly 400 typed questions a day.

## Validation

See `specs/021-site-cat/verification.md` for the final numbers.
- **Backend:** `tests/api/test_site_chat.py`, 16 tests. They cover:
  - No auth, database or tool dependency.
  - The ORM untouched during a turn.
  - Mock answers in both languages.
  - Off-topic, unknown and pricing questions.
  - Legal-advice refusal without a model call.
  - Injection, including a forged assistant turn.
  - Length, shape and turn limits.
  - Per-IP minute and day limits.
  - The daily budget turning into "busy" while refusals keep working.
  - Provider failure and the kill switch.
  - The platform key only, with no tools and the site model (fake OpenAI client).
  - CORS, including no credentials and a foreign origin spending no tokens.
  - Turnstile.
  - Text-free logs.
  - The knowledge file's version and unknown markers.
  - The guards.
- **Widget:** `tests/e2e/marketing/site-cat-model.test.mjs`, 7 `node:test` tests. The spec gate runs them through `scripts/tests/test_site_cat.py` (3 unittest tests), because the gate has no `node:test` runner.
- **Browser:** `tests/e2e/marketing/site-cat-browser.cjs` (Playwright).
  - Desktop 1440 px: keyboard open, Esc closes and focus returns; chips answer with no network request; the thinking pose, then the answer and victory; the conversation history is sent; busy, rate-limited and offline states; the demo chip makes the cat dance; drag to the left snaps and survives a reload; the page's own demo link makes the cat dance; English copy with `?lang=en`.
  - Mobile 390 px: full-screen sheet, booking link rendered as a link, no horizontal overflow.
  - Reduced motion: no movement.
  - One run against the real backend in mock mode: an answer, then a legal-advice refusal.
  - Screenshots are in `artifacts/site-cat/`.
- **Contrast:** every text and background pair in the widget is at least 7.1:1 (AA requires 4.5:1).
- **Existing problems, not caused by this branch:**
  - The existing marketing Playwright scripts (`public-case.cjs`, `night-atlas-*.cjs`) time out at their first step on main's unchanged site too; they are out of date.
  - The homepage shows an empty `bureau-tip` circle at the top-left corner before it is first used.

## Production release (24 Nov 2026)
- The app went live at v.0.51 (main aad6428). In production the chat endpoint's CORS behaves as designed (marketing origins allowed without credentials, other origins 403), and legal-advice refusals work.
- **The platform OpenAI key is rejected (401)**, so typed questions get the friendly "unavailable" message. The quick-question chips and refusals still work. The key must be renewed (a secret, not code).
- Marketing v.0.66 was rolled back to v.0.65: `deployment/release.py` publishes only files reachable from HTML/CSS links, so the widget's lazily injected files were missing. Fix (marketing v.0.67): low-priority `prefetch` links on the homepage and a `url()` list of the cat images in `site-cat.css`, guarded by a test that runs the release tool's own file selection.

## Follow-up: section-driven poses and the topic rule (marketing v.0.68, application v.0.52)
- **Poses follow the section in view** (IntersectionObserver; the most visible section wins). Hero → idle, Geçmiş analiz → researching, Olasılık Ağacı → thinking, Anonimleştirme → working, Büro yönetimi → reading, Sufle and Simülasyon → courtroom, Ekip → dancing.
  - Every 10 s in the same section, the pose alternates in a fixed order: section pose, idle, section pose, tea-break.
  - The panel and visitor states override the section: thinking while waiting, working while the answer is written out (about 0.9 s), victory on the first demo click of the visit, sleeping after 60 s without input.
  - Poses crossfade over 300 ms between two stacked images, and all ten poses are preloaded at idle time.
  - With reduced motion, I took "change only on section change" literally: the pose changes only with the section.
- **Size budget:** the readable source is 32.9 KB uncompressed and about 12 KB gzipped (the server compresses). The test now enforces under 34 KB uncompressed and under 15 KB gzipped, instead of stripping comments; the static site has no build step.
- **Topic rule:** off-topic and unknown answers now point to what the cat can answer. New borderline tests cover a UYAP question (unknown, so "bilgim yok" plus the demo link), "boşanma davası açmak istiyorum" (refused as legal advice) and "hava nasıl" (refused, with the pointer). The changed message is application behaviour, so the app version is v.0.52; it goes live with the next app release.
