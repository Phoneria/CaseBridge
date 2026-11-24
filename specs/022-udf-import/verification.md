# Verification — 24 Nov 2026 (cloud working copy; PR #118, branch feature/udf-import)
- Before the second main merge (`4c2fbbc`): full backend suite on SQLite (Python 3.11) 1320 passed, 1 skipped (anonymizer NER model not installed), 1 xfailed (pre-existing); Vitest 98 files / 885 passed; `tsc` clean.
- After merging main `aad6428` (#121) and restoring the version manifest: Vitest 885 passed, `tsc` clean, `npm run test:version` passed, `update-version.mjs --check` → v0.52; targeted backend run (site chat, intake, documents, UDF reader, privacy files, all migration tests) 160 passed. The merge tree equals a clean re-merge except `frontend/app-version.json`.
- PostgreSQL 16 (throwaway cluster, independent review): upgrade from `0244bf696c5e` and a fresh install give `{pdf,docx,txt,udf}`; re-running `ADD VALUE IF NOT EXISTS` is harmless; the ORM writes and reads `DocumentType.UDF`.
- Hostile inputs (review): size-lying deflate/bz2/LZMA bombs end as `INVALID_UDF` at ~40 MB RSS; a 149k-entry central directory hits `UDF_LIMIT` in ~0.7 s; a 16 KB upload expanding to 16 MB of elements now peaks under 10 MB traced memory (test) instead of 430–740 MB RSS.
- After merging main `dd980ab` (#122): only `app-version.json` conflicted; main's v.0.52 manifest + `update-version.mjs` → v.0.53, `--check` passes; single Alembic head `f3a5c7e9b1d2`.
- Spec gate: `check-specs.py` and `check-spec-changes.py --run` against the PR base pass (see the PR).
- Not verified: real UYAP files (T009); release (T010).
