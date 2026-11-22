# Verification

## Scope and acceptance

User explicitly authorized Demo tahmini on example and normal case scenario branches, with numeric neutral/equal fallback rather than Hesaplanmadı. Only the defined synthetic MECE group sums to 100. Normal case support weights are independent, not probabilities. User's direct “İncelemeyi tamamladım ve kabul ediyorum” is recorded as user acceptance; no independently verified expert audit or calibration is claimed.

## Actual local checks

- Targeted backend: 12 tests passed, including all 16 example input combinations, deterministic exact 1000-tenths rounding, missing equal basis, real-case neutral/support/contradict weights, empty evidence override, tenant/auth boundaries, malformed inputs and domain-write counts.
- Targeted frontend: 7 tests passed; discovery, deep link without cases, graph/text labels, assumptions, stale mode/case responses, memory-only snapshot and scoped errors.
- TypeScript passed. Immutable release tests: 14 passed. Spec Kit governance: 9 feature contracts validated.
- Full backend/frontend runs were started before the user's instruction to use only critical checks, then interrupted. They are not recorded as passed suites. No repeat full run requested.
- Production build passed. Six viewport/theme browser flows passed (1600/390/320 × light/dark), both example and normal file. Synthetic input changes, missing equal basis, real weights 50→62→38, graph/text parity, no page errors or page overflow. Actual product JPEG inspected. Pinned-main publication and public verification remain pending.

## Completed public release

Main artifact `1b460a691af375da61e18014733ed0ca0c10b1a5`: application v.0.21, marketing v.0.45. Restricted-role stage/canary, isolated 70fabd06→1b460a6→70fabd06 rollback, activate and verify passed. Public /release.json versions/commit and /api/health status=ok match; 917 source files, 54 frontend JS/CSS and 48 marketing files match manifests/running images. Actual public JS passed six example/normal case viewport/theme flows with isolated synthetic APIs; no customer records/providers were used. Production health and both unauthenticated route 401 boundaries were checked directly. Updated public JPEG hash matches; three marketing widths pass updated FAQ/image/dialog focus/no overflow.

Protected configuration and encrypted credential versions are unchanged; fresh protected configuration/encrypted versions/DB backup and previous verified artifact retained. No schema or key activation change. Existing root/izzet administration preserved. New CI automatically started; frontend and spec-governance passed at publication; backend was still running and is not claimed as passed. No manual full-suite retry/wait was added after the user's critical-test instruction.

Proof: docs/validation/2026-11-22/demo-{local-results,public-results,public-identity,isolated-rollback}.json. Follow-up documentation/governance code does not change deployed application or marketing trees and does not require redeployment.
