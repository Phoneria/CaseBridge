# Verification: 002-header-ai

## Result — completed, 2026-11-22

Nine AI entries are available only through the header at desktop/mobile widths. Shared route metadata preserves exact/sub-route activation; restricted/platform/null users are hidden and existing server authorization remains. Native modal Tab/Escape/focus return, search/notifications/account menu and saved theme passed at 1440/768/390/320 × light/dark. Public 1440/390 × both themes also passed. CI caught an existing recorder closure retaining opening in conversation mode; submit now retains only valid conversation actions and defaults to argument. The full 753 frontend tests, typecheck, committed-version check and build passed in CI.

## Public release

Application **v.0.20**, marketing **v.0.44**; deployed main commit `70fabd06f695f03477203a3fc86291f06e3e2f7c`. Public release markers and health report this commit; updated code/file/image hashes match the immutable artifact. All three CI jobs passed: https://github.com/Phoneria/CaseBridge/actions/runs/44960991593 (1099 backend / 753 frontend tests, governance/14 release tests, Compose, type/version/build).

## Evidence

- `docs/validation/2026-11-22/release.json`, `ci.json`
- `public-browser.json`, `runtime.json`, `release-permissions.json`, `isolated-rollback.json`
- `browser.json`, `gallery.json`, `contrast.json`, `cta-contrast.json`, `product-captures.json`
- `todo.md` final release record; `deployment/immutable-release.md`

## Convergence

Every scoped requirement maps to implemented code and actual verification. All feature tasks are complete; missing checks were added append-only as discovered and completed only after evidence. External/legal-model validation was not invented as a new release gate or claimed as performed by the assistant. This final documentation commit does not change released application behavior. Existing customer onboarding/key gates remain governed by AGENTS.md/todo.md.

## Expanded sidebar follow-up: local critical verification

Latest user steering restores the sidebar group while preserving header AI. Fifteen targeted Sidebar/AiNavigation tests passed; production build/typecheck passed. Actual full admin menu has 20 links including nine AI rows and Settings. All are simultaneously visible at 1440×900 and 1280×768 in light/dark themes: first link top 69.58px; last link bottom 855/723px; minimum row height 24px. ScrollHeight does not exceed clientHeight on those desktop viewports. Single active AI link, focus return and unchanged nine header links pass.

390×844 and 320×568 mobile drawers and a 720×384 CSS viewport retain scroll/focus access to first/last AI and Settings. 720×384 models reduced CSS space comparable to 200% zoom on 1440×768; actual browser zoom was not independently set, so no full browser-zoom claim. Platform/restricted role tests pass. The group has no whole-group border/ring; selected link/focus remain distinct. Twelve native v.0.22 product captures refreshed with synthetic data. Main PR/release/public checks pending until recorded below.

Proof: docs/validation/2026-11-22/sidebar-local-results.json and sidebar-capture-provenance.json.
