# Demo seed: an open case without a next hearing no longer stops the backend (application v.0.59, unreleased)

Bug report (28 Nov 2026): the local backend container restarted in a loop with `TypeError: unsupported format string passed to NoneType.__format__` in `app/db/seed.py` `_seed_case_detail`. The container runs `alembic upgrade head && python -m app.db.seed && uvicorn …`, so the failing seed kept the API down and login showed "Giriş yapılamadı". A fresh database seeds fine; an existing one breaks once any open demo case has no `next_hearing_date` (a hearing passed, was moved or was cleared in the app), because the follow-up task text formatted the date unconditionally.

## User Scenarios
1. A developer restarts the stack on an existing database where an open demo case has no next hearing; the seed completes, the API starts and the demo accounts log in.
2. The case's "Duruşma ve süre takibini güncelle" task, when (re)created, says the next hearing date is not recorded instead of a date.

### Functional Requirements
- **FR-001**: `_seed_case_detail` builds the open-case follow-up task with "Sonraki duruşma {date} olarak kayıtlı." when the case has a next hearing date and "Sonraki duruşma tarihi kayıtlı değil." when it has none; closed cases and every other seeded text are unchanged. Re-running the seed on such a database succeeds.
- **FR-002**: Application version: `frontend/app-version.json` regenerated with `frontend/scripts/update-version.mjs` (v.0.59), never hand-edited.

## Success Criteria
- A unit test seeds, clears an open demo case's next hearing, seeds again and finds the task text without a date; the existing seed tests pass.
- Reproduced and verified on PostgreSQL 16: the seed failed with the reported error before the fix and completes after it.
