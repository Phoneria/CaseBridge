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
- Full local backend with synthetic-fixture bcrypt cost 4: 1,168 passed, 1 skipped, 1 expected failure in 103.87s. The first normal-cost local full run was interrupted for duration; it is not counted as a passed suite. Production password settings were unchanged.
- GitHub CI run 45120054103 on e7ea332 passed governance, frontend and backend. Normal-cost backend: 1,168 passed, 1 skipped, 1 expected failure in 631.30s. PR #85 merged as b8699b9542ca0db07679e288ea737804eaa41503; merge tree matches the tested branch exactly.
- Light/dark Chromium flows passed at both 1440px and 390px. No real customer data or AI key was used. Interactive-screen deployment verification follows below.

## Verified interactive-screen deployment
- Released immutable main artifact b8699b9542ca0db07679e288ea737804eaa41503, application v.0.43, through the existing root-owned restricted release entrypoint, scope app. Stage canary, activate and independent verify passed. No source patch, schema migration, global AI setting change, credential activation or marketing publication occurred.
- Before activation, the new backend image passed an additional network-isolated, read-only synthetic endpoint check: unauthorized 401, masking 200, invalid extra-field 422, no-store and mapping exclusion. No production data/configuration/volume was mounted in this check.
- Public release.json and /api/health both identify b8699b9542ca0db07679e288ea737804eaa41503 and 0.43; health is ok. Independent retrieval of 10 compiled route scripts confirmed Anonimleştirme, Metni maskele, /privacy/anonymize and 0.43. Local Python's certificate store initially rejected HTTPS; the rerun used system curl with normal TLS verification and passed (no certificate bypass).
- Public frontend Chromium at 1440px/390px passed masking, copy, clear, active sidebar/mobile menu, no overflow and no page errors. These browser checks intercepted every production API request and used synthetic authentication plus the real local masking endpoint; they did not read customer records or prove a real customer session. The deployed backend image was tested separately above, and the public API independently returned 401 without a session. Public desktop/mobile screenshots reviewed.
- Protected matching configuration and encrypted credential archive: /var/backups/casebridge-anonymization-v043-20261123T055238Z. Archive hashes/readability passed. After application restart all three protected configuration/encrypted credential files were byte-identical to that backup; no plaintext values were output. This is an integrity check, not a new full database/credential recovery drill.
- Previous verified application artifact b60e7e47e65cdfd511f69f3b55e8292f09e3a30a remains the rollback source in the immutable inventory. No live rollback was exercised. Existing additional-customer rollout rules remain; no new customer onboarding is claimed.
