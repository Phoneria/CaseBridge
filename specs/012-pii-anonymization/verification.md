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

## File-upload preflight — v.0.44, 23 November 2026
- 5 MiB raw-body/no-spool endpoint, 30,000 characters, 100 PDF pages, 16 MiB expanded/512 DOCX members; fixed errors, no filename fields, no external provider/OCR or persistence. Worker environment is sanitized; parser has a 15s parent timeout and Linux 512 MiB/10 CPU-second limits.
- Actual PDF/DOCX/TXT generated in tests: 63 focused backend tests passed (1 NER skip/1 expected failure) before subprocess refinement; final extraction suite 17 passed. Final full backend using synthetic-fixture bcrypt cost 4: 1,185 passed, 1 skipped, 1 expected failure in 60.27s. Production password costs were unchanged; normal-cost GitHub CI is pending.
- 795 frontend tests passed; after the final Turkish file-picker button change, all 7 affected upload/view/transport tests passed. Production build/type/version checks passed on final source.
- Final local production Chromium at 1440px and 390px passed real synthetic PDF/TXT/DOCX (including table/header), other-extension text, image-only scanned PDF and binary rejection, explicit mask/copy/reset, no storage content, no overflow/page errors. Actual extraction subprocess endpoint was used; auth was synthetic/intercepted, no customer records accessed. Screenshots reviewed. An initial rerun during a local production rebuild timed out on stale assets; after restarting the local server, the final rerun passed.
- Browser fixture generator and reproducible runner: tests/e2e/privacy-file-fixtures.py and privacy-files.cjs. Example: python privacy-file-fixtures.py /tmp/cb-files-fixtures; node privacy-files.cjs http://127.0.0.1:3194 http://127.0.0.1:8194 /tmp/cb-files-fixtures. All API calls are intercepted; only privacy endpoints are forwarded to the dedicated local synthetic backend.
- GitHub CI, main merge and immutable public deployment remain pending. This is existing-site work, not new customer onboarding.

## File-upload final CI and Linux preflight
- PR #87 source 5fd46baa287a0dde6cd741ebfd7f672f746698dd passed all GitHub run 45123304886 jobs. Normal-cost backend: 1,185 passed, 1 skipped, 1 expected failure in 670.42s. Frontend build/type/version/component checks and governance passed. Main merge e8f691c04f01bfdb1b963fd42de6b30de281d154 has identical backend/frontend/deployment sources to the tested branch.
- Candidate reader code also passed network-isolated, read-only Linux Python3.11 testing using the prior production base image: normal PDF/DOCX/TXT succeed under the actual Linux 512 MiB/10 CPU-second limits; a compressed PDF expanding to 600 MiB was rejected and subsequent normal files still succeeded. No production volumes/configuration/secrets were mounted.
- Additional browser rerun using the visible Dosya seç button and actual filechooser event passed the same positive/negative flows on desktop/mobile. Dark-theme flows also passed.

## Verified file-upload release — v.0.44
- Released main e8f691c04f01bfdb1b963fd42de6b30de281d154 through the immutable restricted entrypoint, app scope. Stage/canary/activate/independent verify passed. No schema, provider configuration, real key activation or marketing change occurred.
- Before activation, the actual new backend image passed extraction→masking with real synthetic PDF, TXT, DOCX (tables/header) and other-extension text, plus scanned/binary/anonymous rejection. Network disabled, root read-only, no production data/config/volumes mounted.
- Public release.json and health identify e8f691c04f01bfdb1b963fd42de6b30de281d154 / 0.44, status ok. Ten publicly served compiled scripts contain the new file chooser/extraction endpoint/version. Initial raw matching and a Unicode-only escape matcher failed because the production bundle also used hexadecimal JS escapes (for example, \x). Matching after both JS hexadecimal and Unicode escape normalization passed; the actual browser independently rendered the expected Turkish controls.
- Public frontend desktop/mobile Chromium using the actual Dosya seç/filechooser control passed PDF/TXT/DOCX/other-extension extraction→masking, scanned/binary errors, copy/reset, no storage content/overflow/page errors. All API calls were intercepted; privacy calls went only to the dedicated local synthetic backend. This is not a real production customer-session test; the deployed backend image was tested independently above. The public unauthenticated extract-text route independently returned 401. Public screenshots reviewed.
- GitHub run 45123304886 passed all three jobs: 1,185 backend passed, 1 NER skip, 1 expected NER failure; 795 frontend passed. Build/type/version/governance succeeded.
- Protected matching configuration/credential archive /var/backups/casebridge-anonymization-v044-20261123T062056Z passed integrity verification. After restart all three protected configuration/encrypted credential files matched byte-for-byte. Values were not output. No fresh full recovery drill or live rollback was claimed. Previous verified application b8699b9542ca0db07679e288ea737804eaa41503 remains available for rollback.
- Only existing-site release work was done; no customer onboarding. Original working tree remains unchanged (241 independent local changes preserved). Earlier pending preflight statements are historical and superseded by this verified release record.
