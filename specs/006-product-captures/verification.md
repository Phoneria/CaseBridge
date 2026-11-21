# Verification: 006-product-captures

## Result — completed, 2026-11-22

Twelve JPEGs were taken directly from actual v.0.20 production-build UI using fresh isolated SQLite demo/template records, no real customers/keys/provider calls, no preview-only localization, painting or constructed UI. Route/viewport/source fingerprint/file SHA-256 provenance is recorded. Eleven 1600×1100 views and one 1600×1400 scenario tree retain example/training labels. Actual product text was localized in source. Twelve visible tabs and expanded views point to the same current files. Local four-viewport gallery checks (48 flows) and public three-viewport checks (36 flows) passed load/dimensions/Escape/focus/overflow. Public served file hashes match the immutable package. User screenshot acceptance is recorded; no independent legal audit is claimed.

## Public release

Application **v.0.20**, marketing **v.0.44**; deployed main commit `70fabd06f695f03477203a3fc86291f06e3e2f7c`. Public release markers and health report this commit; updated code/file/image hashes match the immutable artifact. All three CI jobs passed: https://github.com/Phoneria/CaseBridge/actions/runs/44960991593 (1099 backend / 753 frontend tests, governance/14 release tests, Compose, type/version/build).

## Evidence

- `docs/validation/2026-11-22/release.json`, `ci.json`
- `public-browser.json`, `runtime.json`, `release-permissions.json`, `isolated-rollback.json`
- `browser.json`, `gallery.json`, `contrast.json`, `cta-contrast.json`, `product-captures.json`
- `todo.md` final release record; `deployment/immutable-release.md`

## Convergence

Every scoped requirement maps to implemented code and actual verification. All feature tasks are complete; missing checks were added append-only as discovered and completed only after evidence. External/legal-model validation was not invented as a new release gate or claimed as performed by the assistant. This final documentation commit does not change released application behavior. Existing customer onboarding/key gates remain governed by AGENTS.md/todo.md.
