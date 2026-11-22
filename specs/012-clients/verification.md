# Verification

## Scope and acceptance

Scope is the 2026-11-16 clients design. The design records user review as pending; no user acceptance is claimed here.

## Actual local checks (2026-11-22, merged tree bd25876: feature/clients + main b8038f9)

- Backend full suite, Python 3.11, split across four runs: 1130 passed (unit+integration+ai_contract+log redaction 503; api 203 + 262 + 162).
- Migration tests: 16 passed, including test_clients_migration and main's offline SQL generation over b9d3e7f1a520:head. `alembic heads` prints the single head eeb771ad79be.
- Frontend: vitest 87 files / 789 tests passed on a clean Linux `npm ci`; `tsc --noEmit` passed; `update-version.mjs --check` passed at v.0.24.

## Not done / known gaps

- E2E 19-clients and 01-case-lifecycle were not run in this verification.
- No automated test asserts the content of the client log line (ids only); it was checked by reading the code.
- The read-only case page client link is covered by E2E only; unit tests cover the picker chip link.
- No release: pilot backup, pinned-main stage/canary/rollback and public version/code/health are pending.
