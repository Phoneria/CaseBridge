# Research
- The backend image is built from `backend/` alone (compose `context: ../backend`), so the knowledge file lives in `backend/app/site_chat/`, not in `web-page/`.
- The API is served at `https://app.casebridge.com.tr/api` (Caddy strips `/api`), the marketing site at `casebridge.com.tr`, so the call is cross-origin. Starlette's app-wide CORSMiddleware rejects unknown preflights and adds `Allow-Credentials` to every simple response, so `/public/*` gets its own outermost middleware rather than widening the global list.
- Production runs a single uvicorn process with `--proxy-headers`, so in-memory limits see the real client address and are consistent; they reset on restart (same trade-off as the login limiter).
- `get_openai_api_key(None)` reads only the platform key; bureau keys are stored per firm and only resolved with a firm id.
- The marketing pages are Turkish-only at present (no translator script is loaded); the widget follows `<html lang>` and `?lang=en`.
- Existing marketing Playwright scripts (`public-case.cjs`, `night-atlas-*.cjs`) time out on main's unchanged site as well; they predate this work.
- The cat art is copied byte for byte from the in-app mascot WebPs (`frontend/public/mascot/`, PR #120; originally `lawyer_cat_mascot.zip`) into `web-page/assets/site-cat/`, because the marketing site is published separately.
