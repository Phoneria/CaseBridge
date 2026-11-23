# Verification

## Scope and acceptance
Issue #34: personal data in case files is anonymized so identities cannot be determined from the text; verified on a fictional sample only.

## Actual local checks
- backend/tests/unit/test_anonymizer.py: all fictional values removed, consistent placeholders, leak check, restore, wrapper on/off, NER fallback; NER test with the real BERTurk model passed locally.
- Spec acceptance binding (check-spec-changes.py --run) passed locally.
- Not verified: behavior on real case files, upload/indexing wiring, external-provider round trip with a real key.

## Release
Not deployed by this change (no UI change; setting off by default).

## Interactive masking screen — 23 November 2026
- Source prepared in isolated worktree from main b1f969a. No original-workspace files changed. Application v.0.43, global ANONYMIZE_LLM_INPUT unchanged/off by default.
- 791 frontend tests passed; production Next.js build/type checks passed; 20 release boundary tests and Spec Kit governance checks passed.
- Focused backend: 46 passed, 1 skipped (local NER model unavailable), 1 expected failure (unregistered-name NER case). Real-session bureau admin/lawyer access in two firms and restricted-account denial, anonymous/platform denial, generic validation and stateless output checked. Initial runs stopped during collection because the local Python environment lacked anthropic/reportlab; those dependencies were installed separately under /tmp and the rerun passed.
- Chromium against the local production frontend and actual local masking endpoint, synthetic auth only: 1440px and 390px mask/copy/reset, sidebar active route, mobile menu, no horizontal overflow or page errors passed. Desktop/mobile screenshots reviewed. Initial browser selector matched breadcrumb plus sidebar; scoped selector rerun passed.
- Full backend suite and GitHub CI pending. No real customer data or AI key was used. No deployment yet for the interactive screen.
