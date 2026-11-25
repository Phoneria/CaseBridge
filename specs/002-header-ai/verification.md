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

## Completed protected PR and public release

PR #29 merged through active main protection after its required spec-governance executed six bound acceptance selectors; automatic frontend check also passed. Main artifact `80035eaea87f07445d375d8848ee7e8bee8ae8b5` is verified: app v.0.22, marketing v.0.46, 929 source files, 54 frontend JS/CSS, 48 marketing files. Stage/canary, isolated 1b460a6→80035ea→1b460a6 rollback and restricted-role activate/verify passed.

Actual public JS repeated the full 20-link admin geometry at 1440×900 and 1280×768, light/dark: every link including nine AI rows and Settings visible without scrolling. 390×844, 320×568 and 720×384 CSS viewport retain scrolling/focus. Header still has nine AI links. Public marketing repeated six 1440/390/320px JS/no-JS first-load/reload/default-tree, keyboard and dialog-focus flows. All twelve public capture hashes match native v.0.22 provenance. No page errors/overflow. Health and unauthenticated demo 401 were checked directly; authenticated UI data came only from isolated synthetic APIs.

Backend code/image is unchanged and reused from 1b460a6; its health retains backend version 0.21/source identity, while current frontend release.json/visible app label are 0.22 and marketing 0.46. This expected per-service identity is verified, not a new backend deployment claim. Protected config/encrypted credential versions unchanged; fresh paired DB/config/encrypted-version backup and previous artifact retained. No key operation, migration, customer onboarding or unrelated access change.

Proof: docs/validation/2026-11-22/sidebar-{release-results,public-results,public-identity,isolated-rollback}.json and tree-first-public-results.json. This final documentation PR does not modify application/marketing/deployment code and requires no redeployment. Critical manual checks only; automatically running unrelated full jobs were not awaited or claimed complete. The earlier demo code commit 1b460a6 subsequently completed all three CI jobs successfully.

## Balanced-height blue-panel follow-up — local actual results

This latest steering supersedes the fixed compact v.0.22 layout. Historical b640c54 bg-navy-950/bg-ai-glow panel/leaf styles restored; normal 256px sidebar and original-width logo. Full 20-link admin menu passes 768/900/1080px, light/dark, no menu scrolling. Main row heights grow 28.39 → 35.34 → 44.81px. Maximum inter-link gap is 41px (AI heading); last AI to Settings gap remains 21px at every height, with no unused lower void. Settings bottom is 719/851/1031px. All nine AI links remain expanded, single-column; header nine links and role/active/focus checks pass. Three short/mobile CSS viewports retain reachability. 200% CSS root text size (32px) also retains first/last/Settings focus via scrolling in both themes; this is distinct from actual browser zoom.

Eleven targeted Sidebar/BrandLogo tests and production build/typecheck passed. Actual local geometry and screenshots: docs/validation/2026-11-22/balanced-local-results.json and balanced-local-1280-768-light.png / balanced-local-1440-1080-dark.png. Automatic pilot publication pending; no manual VPS stage/activate for this follow-up. Main protection and the newly installed UI automatic lane belong to the separate release executor; this PR changes no workflow/deployment source.

FR-008 — Local Chromium with a synthetic bureau verified four global links, eight case AI entries, switching between counter analysis and a preselected hearing, and returning from the knowledge map to the matching case tree. Legacy URLs were checked with and without a case. The full frontend Vitest run passed 786 tests in 85 files.
