# Verification — 28 Nov 2026 (branch feature/audit-log)
- The new test failed with the reported TypeError before the fix and passes after it; `test_admin_seed.py` and `test_client_seed_and_import.py` 8 passed.
- PostgreSQL 16: fresh `alembic upgrade head` + seed OK; after clearing case 2026/101's next hearing the seed failed as reported; with the fix it completes and `POST /auth/login` for the platform demo account returns a token.
- `update-version.mjs --check` → v0.59.
