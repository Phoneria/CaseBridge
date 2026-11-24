# Behavior
- `POST /public/site-chat` → 200 answer/refusal; 422 invalid or `turn_limit`; 429 `rate_limited` (10/min, 50/day per IP); 503 `busy` (daily token budget) or `unavailable` (no platform key, provider error, switched off); 403 Turnstile failure or a disallowed Origin.
- Injection phrases in any turn and legal-advice requests are refused without a model call; refusals work even when the budget is exhausted.
- Only `casebridge.com.tr`, `www.casebridge.com.tr` and localhost origins get CORS headers on `/public/*`; never `Allow-Credentials`.
- The widget's chips never call the API; the panel shows the notice and "Demo planla"; Esc closes; the cat snaps to the nearest side and remembers it.
