# Verification — 24 Nov 2026 (local working copy, branch feature/platform-lawyer-invite, not committed)
- Backend (Python 3.10 venv, SQLite): `tests/api` platform/admin_users/audit selection 56 passed; `test_platform_firms.py` + `test_platform_management.py` all pass including the four new tests.
- Frontend: `tsc --noEmit` clean; Vitest 98 files / 886 passed (PlatformView 12).
- `update-version.mjs --check` → v0.54.
- Not verified: full backend suite, e2e (Playwright), release (T007).
