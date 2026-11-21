# Verification

## Scope and acceptance

User explicitly authorized Demo tahmini on example and normal case scenario branches, with numeric neutral/equal fallback rather than Hesaplanmadı. Only the defined synthetic MECE group sums to 100. Normal case support weights are independent, not probabilities. User's direct “İncelemeyi tamamladım ve kabul ediyorum” is recorded as user acceptance; no independently verified expert audit or calibration is claimed.

## Actual local checks

- Targeted backend: 12 tests passed, including all 16 example input combinations, deterministic exact 1000-tenths rounding, missing equal basis, real-case neutral/support/contradict weights, empty evidence override, tenant/auth boundaries, malformed inputs and domain-write counts.
- Targeted frontend: 7 tests passed; discovery, deep link without cases, graph/text labels, assumptions, stale mode/case responses, memory-only snapshot and scoped errors.
- TypeScript passed. Immutable release tests: 14 passed. Spec Kit governance: 9 feature contracts validated.
- Full backend/frontend runs were started before the user's instruction to use only critical checks, then interrupted. They are not recorded as passed suites. No repeat full run requested.
- Production build passed. Six viewport/theme browser flows passed (1600/390/320 × light/dark), both example and normal file. Synthetic input changes, missing equal basis, real weights 50→62→38, graph/text parity, no page errors or page overflow. Actual product JPEG inspected. Pinned-main publication and public verification remain pending.
