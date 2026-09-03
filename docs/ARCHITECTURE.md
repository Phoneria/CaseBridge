# CaseBridge — Architecture (Milestone 0)

## Stack decision

| Layer | Choice | Reason |
|---|---|---|
| Backend | Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2.0 | Heavy AI/orchestration workload fits Python best; FastAPI gives typed request/response contracts for free, which we need for structured AI output validation |
| DB | SQLite (file-based) | Zero-infra local MVP; SQLAlchemy models kept dialect-agnostic so a later move to PostgreSQL is a connection-string change, not a rewrite |
| Auth | JWT (python-jose) + passlib (bcrypt) | Simple, stateless, no session store needed for MVP |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS | Modern SaaS UI expectations (section 4), component reuse, fast to make "impressive" |
| Charts | Recharts | Lightweight, good default look for dashboards |
| Backend tests | pytest, pytest-asyncio, httpx (ASGI test client) | Standard FastAPI testing stack |
| Frontend unit tests | Vitest + React Testing Library | Fast, Vite-native, works well with Next.js app dir components |
| E2E | Playwright | Cross-browser, good FastAPI+Next dev-server orchestration |
| AI provider | Local Ollama (`qwen3.5:9b`) plus Qwen/OpenAI/mock adapters behind `LLMProvider` | Private local practice by default, while keeping providers swappable |

## Layered architecture

```
Frontend (Next.js)
      |  HTTPS/JSON
      v
API layer (FastAPI routers)               backend/app/api/
      v
Application services                      backend/app/services/
      v
Domain / business logic                    backend/app/domain/
      v
Repositories (SQLAlchemy queries)          backend/app/repositories/
      v
Database (SQLite -> Postgres later)        backend/app/db/
```

AI is a vertical slice, not embedded in the main layers:

```
Application service (SimulationService, AnalysisService)
      v
Case Intelligence Engine                   backend/app/ai/engine.py
      v
Prompt / Agent layer                       backend/app/ai/agents/
      (JudgeAgent, PlaintiffAgent, DefendantAgent, ResearcherAgent)
      v
LLMProvider interface                      backend/app/ai/providers/base.py
      v
OllamaProvider (local) | QwenProvider | OpenAIProvider | MockProvider (tests)
      backend/app/ai/providers/
```

Interactive courtroom training is a separate stateful slice:

```
Courtroom UI → courtroom API → persisted user move → single-process worker
                                                    ↓
                         opponent prompt → Ollama → validated JSON
                         public judge prompt → Ollama → validated JSON
                                                    ↓
                              transcript / evidence ruling / final score
```

The opponent sees only its own private brief and evidence. The judge sees only public facts, the public transcript, and backend-validated evidence. The client receives only the user's chosen-role brief and evidence. Model output is parsed against strict Pydantic schemas, with at most one JSON-repair attempt.

Rule: services/domain code depends only on `LLMProvider` (the interface), never on the `openai` SDK directly. Provider is chosen once, in `backend/app/core/config.py` / a small factory, based on env + test mode.

## Multi-tenancy (law firm isolation)

Every tenant-scoped table (`Case`, `Document`, `CaseEvent`, `Simulation`, `AIAnalysis`, `Task`) carries a `law_firm_id` foreign key. Enforcement happens in the **repository layer**: every query method that fetches by id also filters by `law_firm_id` taken from the authenticated request's JWT claims — never from a client-supplied parameter. This makes cross-tenant access structurally hard to forget, and is what the isolation tests in section 22 target directly (manual ID tampering must still 404/403).

## Folder structure (created this milestone)

```
casebridge/
├── .env / .env.example / .gitignore
├── README.md
├── PROGRESS.md
├── TEST_REPORT.md          (created at Milestone 10)
├── docs/
│   ├── ARCHITECTURE.md     (this file)
│   ├── DB_SCHEMA.md
│   └── TEST_PLAN.md
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (auth, cases, documents, simulations, analytics, ...)
│   │   ├── core/           # config, security, logging
│   │   ├── domain/         # pure business logic, framework-free
│   │   ├── repositories/   # SQLAlchemy data access, tenant-scoped
│   │   ├── services/       # application/orchestration services
│   │   ├── ai/
│   │   │   ├── engine.py
│   │   │   ├── agents/     # judge.py, plaintiff.py, defendant.py, researcher.py
│   │   │   ├── providers/  # base.py, openai_provider.py, mock_provider.py
│   │   │   └── schemas.py  # structured AI output pydantic models
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic request/response DTOs
│   │   └── db/             # session, base, seed script
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── api/
│   │   └── ai_contract/
│   └── tests_manual/       # optional real-OpenAI test, NOT run by `pytest`
├── frontend/
│   └── src/
│       ├── app/            # Next.js routes (dashboard, davalar, takvim, ...)
│       ├── components/
│       ├── lib/
│       ├── hooks/
│       ├── types/
│       └── styles/
└── tests/
    └── e2e/                # Playwright specs
```

## AI safety guardrails (structural)

- `AIAnalysis`/`Simulation` results are stored with an explicit `assessment_confidence` field and a hardcoded disclaimer string; the frontend renders the disclaimer wherever a score/percentage is shown (section 15).
- `score` is validated 0–100 at the Pydantic schema level (`ge=0, le=100`) before persistence — never trusted from raw model output.
- Agents are forbidden by system prompt from citing specific court case numbers or legislation as fact; any such reference must be flagged `requires_verification: true`.

## Open decisions carried into later milestones

- Exact JWT vs. session choice: JWT, decided above.
- Vector DB for institutional memory: deferred (section 17 says not needed for MVP); historical search will be plain SQL filtering first.
- File storage for documents: local disk under `backend/storage/<law_firm_id>/<case_id>/`, not committed to git, path only referenced in DB. Revisit for cloud storage post-MVP.
