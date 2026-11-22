# Verification: 005-logo-theme

## Result — completed, 2026-11-22

One existing PNG is rendered on a stable white backplate. Dark CSS content substitution was removed; no new logo was designed. Image source/load/dimensions, light/dark and saved-theme reload passed in browser checks; public served UI confirms the same identity. Before/current map evidence contains both themes; no broken asset/overflow was observed in tested viewports.

## Public release

Application **v.0.20**, marketing **v.0.44**; deployed main commit `70fabd06f695f03477203a3fc86291f06e3e2f7c`. Public release markers and health report this commit; updated code/file/image hashes match the immutable artifact. All three CI jobs passed: https://github.com/Phoneria/CaseBridge/actions/runs/44960991593 (1099 backend / 753 frontend tests, governance/14 release tests, Compose, type/version/build).

## Evidence

- `docs/validation/2026-11-22/release.json`, `ci.json`
- `public-browser.json`, `runtime.json`, `release-permissions.json`, `isolated-rollback.json`
- `browser.json`, `gallery.json`, `contrast.json`, `cta-contrast.json`, `product-captures.json`
- `todo.md` final release record; `deployment/immutable-release.md`

## Convergence

Every scoped requirement maps to implemented code and actual verification. All feature tasks are complete; missing checks were added append-only as discovered and completed only after evidence. External/legal-model validation was not invented as a new release gate or claimed as performed by the assistant. This final documentation commit does not change released application behavior. Existing customer onboarding/key gates remain governed by AGENTS.md/todo.md.

## No-plate original logo follow-up — local actual results

Original PNG is opaque RGBA (all alpha 255) with white corners, and BrandLogo also added an explicit #fff wrapper plate. Existing dark SVG is a different font rendering and is not used. Original PNG SHA-256 remains 5167f71b9fd308f37f75d7086659df96522943f1ead9ada9092b1abb9d4c7c37; source bytes unchanged against main 80035ea. White plate removed; CSS multiply on light and invert+hue-rotate/screen on dark make the matte blend with the real surface. This is transparent appearance in the UI, not a new alpha PNG, redrawn wordmark or changed bridge shape.

Ten real browser screenshot pixel checks passed across normal light/dark at 768/900/1080px and four alternate white/pale/navy/dark surfaces. All eight matte corner/edge samples match the actual background within one RGB channel; dominant ink contrast minimum 4.24:1. Same original src/natural geometry, 192px rendered width in both themes. Original mark has only navy/cyan inks; its white negative space is background, not a separate painted mark. Raster geometry is unchanged. Focused resource/no-plate component test and production build pass. Proof and raw logo crops: docs/validation/2026-11-22/balanced-logo-local-pixels.json and balanced-logo-qa/. Public verification pending.
