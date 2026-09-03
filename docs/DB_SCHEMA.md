# CaseBridge — Database Entities (Milestone 0)

SQLite for MVP, SQLAlchemy 2.0 declarative models, UUID primary keys (stored as string) so migration to Postgres is trivial.

## LawFirm
- id (UUID, PK)
- name
- created_at

## User
- id (UUID, PK)
- law_firm_id (FK -> LawFirm) — nullable only for future super-admin, not used in MVP
- email (unique)
- hashed_password
- full_name
- role (enum: admin, lawyer)
- is_active
- created_at

## Case
- id (UUID, PK)
- law_firm_id (FK, indexed) — tenant scope
- case_number
- case_name
- client_name
- opposing_party
- case_type (enum-like string: is_hukuku, ticaret_hukuku, sozlesme, kira, icra, diger)
- court
- assigned_lawyer_id (FK -> User)
- opening_date
- next_hearing_date (nullable)
- status (enum: devam_eden, durusma_bekleyen, karar_bekleyen, kapali)
- outcome (enum, nullable until closed: won, lost, settled, ongoing)
- case_value (nullable numeric)
- description (text)
- is_archived (bool, default false)
- created_at / updated_at

## CaseEvent  (timeline entries / "gelişmeler")
- id (UUID, PK)
- case_id (FK -> Case, indexed)
- law_firm_id (denormalized for isolation queries)
- event_date
- title
- description
- event_type (enum: filing, hearing, submission, expert_report, legal_update, note, other)
- created_by (FK -> User)
- created_at

## Document
- id (UUID, PK)
- case_id (FK -> Case, indexed)
- law_firm_id (denormalized)
- filename
- file_type (enum: pdf, docx, txt)
- storage_path
- extracted_text (nullable, text)
- uploaded_by (FK -> User)
- uploaded_at

## Simulation
- id (UUID, PK)
- case_id (FK -> Case, indexed)
- law_firm_id (denormalized)
- status (enum: pending, running, completed, failed)
- requested_by (FK -> User)
- started_at / completed_at
- result (FK -> AIAnalysis, one-to-one, nullable until completed)

## AIAnalysis  (structured simulation/analysis result — section 14 schema)
- id (UUID, PK)
- case_id (FK -> Case, indexed)
- simulation_id (FK -> Simulation, nullable — also used for standalone "Genel Bakış" AI summary)
- law_firm_id (denormalized)
- analysis_type (enum: case_summary, simulation_report, handover_summary)
- summary (text)
- strong_points (JSON list[str])
- weak_points (JSON list[str])
- opposing_arguments (JSON list[str])
- missing_information (JSON list[str])
- possible_scenarios (JSON list[str])
- questions (JSON list[str])
- recommended_actions (JSON list[str])
- assessment_score (int, 0-100)
- assessment_confidence (enum: low, medium, high)
- ai_disclaimer (str, fixed disclaimer text, always populated)
- requires_verification (bool)
- created_at

## Task  (Görevler)
- id (UUID, PK)
- case_id (FK -> Case, nullable — some tasks are firm-level)
- law_firm_id
- title
- description
- due_date (nullable)
- assigned_to (FK -> User)
- status (enum: todo, in_progress, done)
- created_at

## LegalUpdate  (mock/sample for MVP — section 2 "Legal Update Tracking")
- id (UUID, PK)
- title
- summary
- source (str, e.g. "Resmi Gazete")
- published_date
- affected_case_types (JSON list[str]) — used to flag potentially-affected active cases
- created_at

## Relationships summary
- LawFirm 1—N User, Case
- Case 1—N CaseEvent, Document, Simulation, Task
- Simulation 1—1 AIAnalysis (nullable until done)
- Case 1—N AIAnalysis (case_summary / handover_summary types, simulation_id null)

## Interactive courtroom training

- `CourtroomScenario`: public facts, disputed issues, learning goals and separate private briefs for plaintiff, defendant and judge.
- `ScenarioEvidence`: coded fictional evidence, owning role, authenticity state and display order.
- `CourtroomSession`: tenant/user-scoped resumable state, chosen role, phase, current actor and admitted/rejected evidence codes.
- `CourtroomTurn`: ordered immutable transcript rows with actor, legal role, move type and optional evidence reference; client request IDs make duplicate submissions idempotent.
- `JudgeEvaluation`: one final verdict/feedback record per completed session, four bounded 0–25 subscores and a 0–100 training total.

Scenario templates are global read-only training data. Sessions are always filtered by both authenticated user and law firm; another user cannot read or continue them.

## Tenant isolation rule
Every repository method that reads/writes Case, CaseEvent, Document, Simulation, AIAnalysis, or Task takes the caller's `law_firm_id` (from JWT) as a mandatory filter parameter — not optional, not inferred from the row itself. Tests in `backend/tests/integration/test_law_firm_isolation.py` assert that fetching another firm's ID returns 404, not 200 with someone else's data.
