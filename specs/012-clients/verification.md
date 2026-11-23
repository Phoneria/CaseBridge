# Verification

## Scope and acceptance

Scope is the 2026-11-16 clients design. The design records user review as pending; no user acceptance is claimed here.

## Actual local checks (2026-11-23, feature/clients merged with main 27639d1)

- Backend full suite, Python 3.11: 1222 passed, 1 skipped, 1 xfailed (unit+integration+ai_contract+log redaction 547 passed/1 skipped/1 xfailed; api 675 passed). The skip and xfail come from main's tests, not from client tests.
- `alembic heads` prints the single head 0244bf696c5e (merge revisions eeb771ad79be and 0244bf696c5e join the clients migration with main's heads).
- Frontend: vitest 95 files / 840 tests passed on a clean Linux `npm ci`; `tsc --noEmit` passed; `update-version.mjs --check` passed at v.0.48.
- Earlier run (2026-11-22, merged with main b8038f9): backend 1130 passed, frontend 789 passed; offline SQL generation over b9d3e7f1a520:head passed.

## Not done / known gaps

- E2E 19-clients and 01-case-lifecycle were not run in this verification.
- No automated test asserts the content of the client log line (ids only); it was checked by reading the code.
- The read-only case page client link is covered by E2E only; unit tests cover the picker chip link.
- No release: pilot backup, pinned-main stage/canary/rollback and public version/code/health are pending.
