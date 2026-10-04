# CaseBridge

**AI-Powered Legal Case Intelligence** — an MVP workspace for law firms combining case management, multi-perspective AI lawsuit simulation, and firm-wide case analytics.

> Status: The case-management MVP and the interactive courtroom training mode are implemented. Docker Compose, PostgreSQL migrations, seed data, the production frontend build, and a real local Ollama turn with `qwen3.5:9b` have been verified on Apple Silicon. See `docs/IMPLEMENTATION_LOG.md` for the implementation history and known limitations.

## Product

CaseBridge helps a law firm:
- Manage active/closed cases, clients, opposing parties, documents, hearings, and timelines.
- Run an AI case simulation across four perspectives (Judge, Plaintiff Lawyer, Defendant Lawyer, Legal Researcher) to surface arguments, risks, missing information, and suggested next steps — always labeled as an AI-generated estimate, never a guaranteed outcome.
- Practice a six-stage fictional hearing as plaintiff or defendant counsel. A local model plays opposing counsel and judge with isolated role prompts, evidence access rules, a resumable transcript, and a final 100-point training evaluation.
- See firm-wide analytics: win/loss ratio, performance by category, historical trends.
- Generate a case handover summary when a case changes hands.
- (Foundation only, MVP uses mock data) Track legal/regulatory updates that may affect active cases.

Full product spec: see the original requirements this build is based on; architectural decisions are in `docs/ARCHITECTURE.md`.

## Architecture

See `docs/ARCHITECTURE.md` for the full breakdown. Summary:

```
Frontend (Next.js/TS/Tailwind) → API (FastAPI) → Services → Repositories → DB (SQLite/PostgreSQL)
AI: Service → Prompt/agent layer → LLMProvider → Ollama / Qwen API / OpenAI / Mock
```

Multi-tenant: every case-scoped table carries `law_firm_id`; repositories enforce the filter server-side. See `docs/DB_SCHEMA.md` for entities.

## Folder structure

```
casebridge/
├── backend/          # FastAPI app, tests, AI provider layer
├── frontend/         # Next.js app
├── tests/e2e/         # Playwright E2E specs
├── docs/              # Architecture, DB schema, test plan
├── .env / .env.example
├── README.md
├── PROGRESS.md
└── TEST_REPORT.md     # generated at Milestone 10
```

## Installation (to be finalized as milestones land)

### Environment configuration
1. Copy `.env.example` to `.env` if not already present (already created for local dev).
2. Set `LLM_PROVIDER` (`ollama` | `mock` | `openai` | `qwen`). Courtroom mode defaults are tuned for local `qwen3.5:9b`; `mock` runs a deterministic offline demo without a real model.
3. `.env` is git-ignored; never commit it.

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head   # creates/updates the schema - run this after every pull
uvicorn app.main:app --reload
```

To add a schema change: edit the model, then
`alembic revision --autogenerate -m "describe the change"` and re-run
`alembic upgrade head`. Always review the generated migration file
before committing it - autogenerate is a starting point, not a
guarantee.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:3000` and calls the API at `http://localhost:8000` by default (override with `NEXT_PUBLIC_API_URL`). The backend must be running first — CORS is configured to allow `localhost:3000`/`127.0.0.1:3000` only.

### Docker (alternative to the manual steps above)

For the real local courtroom actors, install/start Ollama and make sure the model is present:

```bash
ollama pull qwen3.5:9b
ollama serve                 # skip if the Ollama app is already running
```

Set `LLM_PROVIDER=ollama` and `OLLAMA_MODEL=qwen3.5:9b` in `.env`, then:

```bash
cp .env.example .env   # only when .env does not exist; keep its JWT secret private
docker compose up -d --build
```
Starts Postgres, applies migrations, seeds the demo accounts/cases/five courtroom scenarios, and launches the backend (`:8000`) plus frontend (`:3000`). Inside Docker the backend reaches host Ollama through `host.docker.internal`. The seed is idempotent, so container restarts do not duplicate data.

### Database
SQLite file created automatically on backend startup at `backend/casebridge.db` (or Postgres when run via `docker compose`, see above). Migrations live in `backend/alembic/` - run `alembic upgrade head` after pulling any change that touches a model. Seed demo data with:
```bash
python -m app.db.seed
```

### Demo credentials
Created by `python -m app.db.seed` (idempotent - safe to re-run):
- `admin@demo.casebridge.dev` / `demo1234` (Admin, Demo Hukuk Bürosu)
- `avukat@demo.casebridge.dev` / `demo1234` (Lawyer, Demo Hukuk Bürosu)

The demo firm has three lawyers: Emre Yılmaz (Ticaret Hukuku, login above),
Kerem Demir (İş Hukuku, `kerem@demo.casebridge.dev`) and Zeynep Arslan
(Kira ve Gayrimenkul Hukuku, `zeynep@demo.casebridge.dev`). All demo lawyer
accounts use `demo1234`. Admin login opens the admin panel, where each case's
responsible lawyer can be reviewed and changed. New cases are always assigned
to an active lawyer; the dashboard shows cases and outcomes by lawyer.

The seed also creates demo cases and six fictional courtroom scenarios, plus six completed training hearings per demo user. Open **CaseBridge AI → Canlı Duruşma** to inspect a completed example, start a fictional scenario, or use **Duruşma ekle** to start a training session from a case in the firm's database. Case-derived sessions use recorded fields and flag unverified evidence; they are not real hearings or outcome predictions.
In a courtroom session, a user may dictate a move and play AI turns aloud. These optional voice actions send audio or turn text to OpenAI and require `OPENAI_API_KEY`; the written courtroom flow remains available without it.

## Test commands

| Suite | Command | Notes |
|---|---|---|
| Backend (unit/integration/API/AI-contract) | `pytest` (from `backend/`) | Uses `MockProvider`, no OpenAI credits consumed |
| Frontend component | `npm run test` (from `frontend/`) | Vitest + React Testing Library |
| E2E | `npm test` (from `tests/e2e/`, run `npm install` there first) | Playwright boots its own backend (port 8010, dedicated SQLite DB, auto-seeded) and frontend (port 3010) via `webServer`; no manual setup needed. Uses `MockProvider` (no `OPENAI_API_KEY`), so simulations complete with a clearly-labeled placeholder AI result. |
| **Optional real OpenAI test** | `pytest backend/tests_manual -m real_openai --run-real-openai` | NOT run by default `pytest`. Costs real tokens. Requires `OPENAI_API_KEY` set. |

## Known MVP limitations

- No vector database / semantic search yet — institutional memory search is plain SQL filtering (by design, section 17 of spec).
- Mevzuat Takibi (legal-update tracking) was removed from primary navigation - no live legislation feed exists, so per the project's honesty rule it was not left as a placeholder.
- Document text extraction is best-effort (pdf/docx/txt), not OCR for scanned images.
- RBAC limited to Admin/Lawyer roles.
- No production-grade file storage (local disk under `backend/storage/`) — swap for object storage before real deployment.
- Login is rate-limited (5 attempts/60s per IP+email); no other endpoint has rate limiting.
- JWT is stored in `localStorage`, not an HttpOnly cookie — acceptable for MVP demo, revisit before production.
- AI outputs are decision-support only and must be reviewed by a licensed professional; this is enforced in UI copy and disclaimer fields, not a substitute for legal judgment.
- Courtroom results are fictional training feedback, not legal advice or a prediction of a real case. Local models may still misstate facts; the prompts constrain fabrication and every final result remains marked for verification.
- Both in-process AI workers are single-instance MVP queues. Do not horizontally scale the backend without moving them to a durable queue/row-locking design.
- Task assignment (`assigned_to`) is accepted by the API but not yet surfaced in either Görevler UI (case-level or firm-wide) — assignment by lawyer, and per-lawyer task filtering, are not built yet.
- `/system/ai-status` and the Ayarlar user list are firm-scoped but not role-gated server-side; only the frontend hides the user list from non-admins.
- Reports CSV export has no pagination/streaming; fine at MVP scale.
- CORS allow-list defaults to `localhost:3000`/`127.0.0.1:3000`; extra origins (e.g. for E2E) are added via the `EXTRA_CORS_ORIGINS` env var, not hardcoded.
- No user-registration endpoint yet — accounts are created via the seed script (`python -m app.db.seed`) only.
- `logout` does not revoke the JWT (stateless, short-lived tokens) — acceptable for MVP, no server-side session store.
- Existing unassigned cases remain visible to admins for manual assignment; new cases require an active lawyer in the same firm.
- The admin's client overview groups case records by client name. It is not yet a canonical client registry, so people with identical names are not distinguishable there.
- The local `data/import` sample contains anonymized court-decision summaries; these must not be treated as the firm's own client outcomes without provenance and an explicit import decision.
- Imported decisions marked as precedents appear in **Emsal Kararlar** and are excluded from firm case lists, client-case workloads, documents/tasks dashboards, reports and win-rate analytics. A separate admin-only precedent review assignment distributes the twenty known anonymous demo-firm decisions across the three demo lawyers (7/7/6); admins can reassign reviewers without implying representation of a client or changing case outcomes. The migrations preserve the decisions and their documents.
- Pagination added to `GET /cases` (`limit`/`offset`, opt-in); `/analytics`, `/tasks`, `/documents`, `/simulations` still unpaginated — will matter once large demo datasets (section 25) are seeded.
- npm dependency audit flags several dev-tooling-only CVEs (Next.js dev server, Vite, Vitest) — run `npm audit` and address before any production deployment; not chased here as they don't affect the built/shipped app.
