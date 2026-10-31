# CaseBridge

**AI-Powered Legal Case Intelligence** — an MVP workspace for law firms combining case management, multi-perspective AI lawsuit simulation, and firm-wide case analytics.

> Status: The case-management MVP and the interactive courtroom training mode are implemented. Docker Compose, PostgreSQL migrations, seed data, the production frontend build, and a real local Ollama turn with `qwen3.5:9b` have been verified on Apple Silicon. See `docs/IMPLEMENTATION_LOG.md` for the implementation history and known limitations.

## Product

CaseBridge helps a law firm:
- Manage active/closed cases, clients, opposing parties, documents, hearings, and timelines. The responsible lawyer (or an administrator) edits a case, closes it with an outcome (won / lost / settled), decision date, note and optional decision document, reopens it, and archives it; an archived case is read-only until it is unarchived.
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
├── docker-compose.yml # Postgres, backend, frontend, Mailpit
├── .env / .env.example
├── README.md
├── PROGRESS.md
└── TEST_REPORT.md     # generated at Milestone 10
```

## Installation

CaseBridge runs as one cloud service for many law firms. Nothing is installed per firm. The CaseBridge team's **platform administrators** open each firm and its first administrator in the platform panel (`/platform`). Firm administrators then invite their own lawyers.

A step-by-step installation guide in Turkish (setup, first login, full reset, production checklist, troubleshooting) is in [`docs/KURULUM.md`](docs/KURULUM.md).

To run CaseBridge on a real server (Hetzner + Caddy HTTPS at `app.casebridge.com.tr`), follow [`deployment/README.md`](deployment/README.md) and use only `deployment/compose.production.yml`; the root `docker-compose.yml` is for local development and demos.

### Quick start with Docker (recommended)

Requirements: Docker Desktop (or Docker Engine with the Compose plugin) and git. For real local AI actors you also need Ollama; see "AI provider" below.

1. **Get the code:**
   ```bash
   git clone git@github.com:Phoneria/CaseBridge.git && cd CaseBridge
   ```
2. **Create `.env`.** Only do this when `.env` does not exist yet; never commit it.
   ```bash
   cp .env.example .env
   ```
   Then set at least:

   | Setting | Value | Why |
   |---|---|---|
   | `JWT_SECRET` | a long random string, e.g. `openssl rand -hex 32` | Signs the session tokens. |
   | `PLATFORM_ADMIN_EMAILS` | your own e-mail address(es), comma-separated | Your platform admin account is created from this on startup and gets an invite e-mail. Use an address that is **not** used in any firm. |
   | `SEED_DEMO_DATA` | `true` for a demo with sample firm/cases, `false` for a clean installation | `false` creates no demo firm or users. |
   | `ENV` | `development` locally, `production` on a real server | With `production` the demo platform account is never created. Spell it exactly `production`. |
   | `LLM_PROVIDER` | `mock` (offline, no model), `ollama`, `openai` or `qwen` | AI features. `mock` needs nothing else. |
3. **Build and start everything:**
   ```bash
   docker compose up -d --build
   ```
   This starts these services:

   | Service | Address | What it is |
   |---|---|---|
   | PostgreSQL | `localhost:5432` | Data is kept in the `casebridge_pgdata` volume. |
   | Backend API | http://localhost:8000 | Applies the migrations, runs the seed, then starts. |
   | Frontend | http://localhost:3000 | |
   | Mailpit | http://localhost:8025 | Catches every e-mail the app sends: invites, password resets, reminders. |

   The migrations and the seed run on every start and are idempotent, so restarts never duplicate data.
4. **Become platform admin.** Open Mailpit (http://localhost:8025) and click the link in the "CaseBridge davetiniz" e-mail. Choose a password; you land on http://localhost:3000/platform.
5. **Open the first firm.** In **Büro Yönetimi → Yeni büro**, enter the firm name and its administrator's name and e-mail. The administrator's invite also arrives in Mailpit. After setting a password they land in the admin panel and invite their lawyers under **Ayarlar > Kullanıcılar**.

If no invite arrives, check the backend log:
```bash
docker compose logs -f backend
```
A line like `PLATFORM_ADMIN_EMAILS: 1. adres bir müşteri bürosunda kayıtlı olduğu için atlandı.` means that address already belongs to a firm. Use another address and restart (`docker compose restart backend`). An invite that expired (`INVITE_TOKEN_HOURS`, default 72) is re-sent on the next start.

### Full reset (start again from zero)

> ⚠️ This permanently deletes every firm, user, case, document and AI result in the Docker installation.

```bash
docker compose down -v           # stop and delete the containers AND the data volumes (database, uploaded files)
git pull                         # or check out the branch you want to run
# review .env (see step 2 above): PLATFORM_ADMIN_EMAILS, SEED_DEMO_DATA, ENV
docker compose up -d --build     # rebuild the images with the current code and start fresh
```
Then continue with steps 4 and 5 of the quick start. Leave out `-v` to keep the data and only restart with new code. Migrations bring an existing database up to date automatically.

For the manual (non-Docker) setup below, a reset means deleting `backend/casebridge.db` and `backend/storage/`. Then run `alembic upgrade head` and `python -m app.db.seed` again.

### Upgrading an existing installation

```bash
git pull
docker compose up -d --build
```
Existing firms and users keep working unchanged. `python -m app.db.create_admin` no longer exists: firms are opened in `/platform`. If you had no platform admin yet, add `PLATFORM_ADMIN_EMAILS` to `.env` (an address not used in any firm), restart, and accept the invite.

### AI provider

`LLM_PROVIDER=mock` runs a deterministic offline demo without a real model. For the real local courtroom actors, install and start Ollama and make sure the model is present:
```bash
ollama pull qwen3.5:9b
ollama serve                 # skip if the Ollama app is already running
```
Then set `LLM_PROVIDER=ollama` and `OLLAMA_MODEL=qwen3.5:9b` in `.env`. Inside Docker the backend reaches host Ollama through `host.docker.internal`. `openai` and `qwen` need their API keys (see `.env.example`).

### E-mail

In Docker every e-mail goes to Mailpit (http://localhost:8025). On a real server, set the `SMTP_*` settings (and `EMAIL_BACKEND=smtp`) in `.env`. Set `FRONTEND_BASE_URL` to the public address so that invite links point to the right site. Without Docker, the default console backend prints each invite or reset link in the backend log; `EMAIL_BACKEND=file` writes `.eml` files instead.

### Manual development setup (without Docker)

Backend (SQLite file `backend/casebridge.db` by default):
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head   # creates/updates the schema - run this after every pull
python -m app.db.seed  # demo data when SEED_DEMO_DATA=true (idempotent)
uvicorn app.main:app --reload
```
Frontend:
```bash
cd frontend
npm install
npm run dev
```
The frontend runs on `http://localhost:3000` and calls the API at `http://localhost:8000` by default (override with `NEXT_PUBLIC_API_URL`). Start the backend first: CORS allows only `localhost:3000` and `127.0.0.1:3000` (plus `EXTRA_CORS_ORIGINS`).

To add a schema change, edit the model, then run `alembic revision --autogenerate -m "describe the change"` and `alembic upgrade head`. Always review the generated migration file before committing it; autogenerate is a starting point, not a guarantee.

### User management
- **Platform admins** (`/platform`) open firms with their first administrator, add administrators, re-send invites and suspend or re-activate a firm. A suspended firm's users cannot sign in, open sessions end, and the data stays.
- **Firm administrators** manage their firm's users in **Ayarlar > Kullanıcılar**:
  - invite a user, who gets an e-mail with a link to set a password, valid for `INVITE_TOKEN_HOURS`;
  - edit a user;
  - resend an invite;
  - send a password-reset link;
  - deactivate a user, handing over their open cases, pending tasks and reviewed precedents to another active lawyer.
- **Everyone** can use **Şifremi unuttum** on the login page, and can change their name or password under **Hesabım** (user menu, top right).

### Demo credentials
Created by the seed when `SEED_DEMO_DATA=true` (idempotent - safe to re-run):
- `admin@demo.casebridge.dev` / `demo1234` (Admin, Demo Hukuk Bürosu)
- `avukat@demo.casebridge.dev` / `demo1234` (Lawyer, Demo Hukuk Bürosu)
- `platform@demo.casebridge.dev` / `demo1234` (CaseBridge platform admin: opens and suspends firms at /platform; never created when `ENV=production`, and a leftover one is removed on the next seed)

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
- `/system/ai-status` is firm-scoped but not role-gated server-side. User management (`/admin/users`) is admin-only and firm-scoped on the server.
- Reports CSV export has no pagination/streaming; fine at MVP scale.
- CORS allow-list defaults to `localhost:3000`/`127.0.0.1:3000`; extra origins (e.g. for E2E) are added via the `EXTRA_CORS_ORIGINS` env var, not hardcoded.
- There is no self-registration: firms are opened by platform administrators in `/platform` (see Installation).
- Passwords bind sessions: changing or resetting a password signs out every older session (JWT `pwd` claim). Existing tokens without it are rejected once, so everyone signs in again after this update.
- `logout` only clears the token in the browser; the JWT itself stays valid until it expires or the user's password changes (no server-side session store).
- Existing unassigned cases remain visible to admins for manual assignment; new cases require an active lawyer in the same firm.
- The admin's client overview groups case records by client name. It is not yet a canonical client registry, so people with identical names are not distinguishable there.
- The local `data/import` sample contains anonymized court-decision summaries; these must not be treated as the firm's own client outcomes without provenance and an explicit import decision.
- Imported decisions marked as precedents appear in **Emsal Kararlar** and are excluded from firm case lists, client-case workloads, documents/tasks dashboards, reports and win-rate analytics. A separate admin-only precedent review assignment distributes the twenty known anonymous demo-firm decisions across the three demo lawyers (7/7/6); admins can reassign reviewers without implying representation of a client or changing case outcomes. The migrations preserve the decisions and their documents.
- Pagination added to `GET /cases` (`limit`/`offset`, opt-in); `/analytics`, `/tasks`, `/documents`, `/simulations` still unpaginated — will matter once large demo datasets (section 25) are seeded.
- npm dependency audit flags several dev-tooling-only CVEs (Next.js dev server, Vite, Vitest) — run `npm audit` and address before any production deployment; not chased here as they don't affect the built/shipped app.
