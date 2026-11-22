# Validation guide

Run `python3 scripts/check-specs.py` and `python3 scripts/check-spec-changes.py --base <main> --head <HEAD>`. Backend: `pytest tests/unit/test_client_names.py tests/unit/test_client_seed_and_import.py tests/api/test_clients.py tests/api/test_case_client_links.py tests/integration -k "client or migration"`, then the full suite; `alembic heads` must print a single head. Frontend: `npx vitest run`, `npx tsc --noEmit`, `npm run version:check`.

Use a fresh synthetic SQLite backend with mock providers for browser checks, never production records. Add a client, open a case for it from its page, see the case and counts, rename the client and confirm the new name on the case page. Try a client row without a chosen client (save blocked), keyboard selection and Escape, and a lawyer account (no Sil). Run E2E `19-clients` and `01-case-lifecycle`.

Before a release read todo.md, back up the pilot database and use the existing immutable stage/activate/verify path. Record actual outcomes in verification.md.
