# Verification: 007-video-visibility

## Result — completed, 2026-11-22

Original video/poster and general theme/layout remain. General desktop alpha changed from 88/78/28/12% to 82/70/18/6%; mobile 78% to 72%. The user additionally authorized darker brand copy and only a local feathered copy background to satisfy readability without raising the general veil. At 1440/768/390/320, 0/5/12s and initial reduced-motion poster, 64 conservative text/background samples pass 4.5 normal / 3 large; sampled hero text minimum 5.64:1. CTA normal/hover solid colors separately pass, minimum 4.58:1. Autoplay advancement, muted loop/inline, offscreen pause and reduced-motion pause/poster passed. Public CSS/media bytes match the verified source; no overflow/page errors in tested layouts.

## Public release

Application **v.0.20**, marketing **v.0.44**; deployed main commit `70fabd06f695f03477203a3fc86291f06e3e2f7c`. Public release markers and health report this commit; updated code/file/image hashes match the immutable artifact. All three CI jobs passed: https://github.com/Phoneria/CaseBridge/actions/runs/44960991593 (1099 backend / 753 frontend tests, governance/14 release tests, Compose, type/version/build).

## Evidence

- `docs/validation/2026-11-22/release.json`, `ci.json`
- `public-browser.json`, `runtime.json`, `release-permissions.json`, `isolated-rollback.json`
- `browser.json`, `gallery.json`, `contrast.json`, `cta-contrast.json`, `product-captures.json`
- `todo.md` final release record; `deployment/immutable-release.md`

## Convergence

Every scoped requirement maps to implemented code and actual verification. All feature tasks are complete; missing checks were added append-only as discovered and completed only after evidence. External/legal-model validation was not invented as a new release gate or claimed as performed by the assistant. This final documentation commit does not change released application behavior. Existing customer onboarding/key gates remain governed by AGENTS.md/todo.md.
