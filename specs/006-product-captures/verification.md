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

## Tree-first default and refreshed navigation captures: local checks

Two initial markup/version acceptance tests passed; actual browser first-load/reload and 1440/390/320px JS/no-JS default visibility passed (six flows). Olasılık Ağacı appears once, first and selected; analysis second, remaining order 2..11 preserved. ArrowDown/Home/End/Tab, current image/description/app link, dialog Escape/focus and no overflow passed. All 12 native product images refreshed from actual app v.0.22 after sidebar restoration; raw bytes/source fingerprint/viewport/route are recorded. Marketing v.0.46 prepared, app v.0.22 separate. Protected PR and public release verification pending.

## Completed protected PR and public release

PR #29 merged through active main protection after its required spec-governance executed six bound acceptance selectors; automatic frontend check also passed. Main artifact `80035eaea87f07445d375d8848ee7e8bee8ae8b5` is verified: app v.0.22, marketing v.0.46, 929 source files, 54 frontend JS/CSS, 48 marketing files. Stage/canary, isolated 1b460a6→80035ea→1b460a6 rollback and restricted-role activate/verify passed.

Actual public JS repeated the full 20-link admin geometry at 1440×900 and 1280×768, light/dark: every link including nine AI rows and Settings visible without scrolling. 390×844, 320×568 and 720×384 CSS viewport retain scrolling/focus. Header still has nine AI links. Public marketing repeated six 1440/390/320px JS/no-JS first-load/reload/default-tree, keyboard and dialog-focus flows. All twelve public capture hashes match native v.0.22 provenance. No page errors/overflow. Health and unauthenticated demo 401 were checked directly; authenticated UI data came only from isolated synthetic APIs.

Backend code/image is unchanged and reused from 1b460a6; its health retains backend version 0.21/source identity, while current frontend release.json/visible app label are 0.22 and marketing 0.46. This expected per-service identity is verified, not a new backend deployment claim. Protected config/encrypted credential versions unchanged; fresh paired DB/config/encrypted-version backup and previous artifact retained. No key operation, migration, customer onboarding or unrelated access change.

Proof: docs/validation/2026-11-22/sidebar-{release-results,public-results,public-identity,isolated-rollback}.json and tree-first-public-results.json. This final documentation PR does not modify application/marketing/deployment code and requires no redeployment. Critical manual checks only; automatically running unrelated full jobs were not awaited or claimed complete. The earlier demo code commit 1b460a6 subsequently completed all three CI jobs successfully.

## Public v.0.23 gallery / marketing v.0.47 — actual local results

Initial public app marker: 0.23/f625960cadd4e4c29985fa26fcb4914d4ff326b3, site v.0.46/80035ea, health ok with unchanged backend 1b460a6/0.21. Existing gallery acceptance failed on provenance22 vs app23 before changes. Requirements checklist5/5, no extension hooks. Isolated worktree and existing capture-product.cjs tour with public origin and all browser API requests fulfilled by isolated synthetic/mock8044.

Twelve raw public-native JPEGs captured; public frontend identity unchanged before/after, each footer v.0.23, transparent wrapper/original raster, nine AI links and historic blue panel confirmed. All twelve byte hashes differ from the old files. No real production account/firm, provider/key, reconstructed UI or image editing. Captured data are fictional. Three focused contracts pass; 36 tab/mapping/decode/zoom/Escape/focus flows at 1440/390/320px pass, plus keyboard and default tree/no overflow. Each zoom displays the same JPEG as its tab.

All gallery image+zoom normal URLs use ?v=0.47, as do two reused conversation/evaluation image references. Tests fetch the URLs from actual HTML, not a manually appended verification query. Before publication a persistent browser cache loaded all12 old normal URLs and confirmed old expected hashes, including conversation/Canlı Duruşma. After publication the same warmed persistent profile performed ordinary normal-page reload without cache clearing or manual query edits; all12 rendered natural-pixel digests match the new23 JPEG pixels. All12 public normal-URL hashes,36 tab/modal/focus desktop/mobile flows, tree-first/default/keyboard, version identities and health pass. PR45/e6d1574 published marketing47 via the restricted standard fallback because the old automatic publisher rejected v. marketing labels; automatic47publication is not claimed.

Proof: docs/validation/2026-11-22/public-gallery-provenance.json, gallery47-local-results.json, gallery47-cache-before.json, gallery47-public-results.json and gallery47-cache-after.json. Existing source/capture notes updated canonically; frontend/backend/deployment/workflows untouched. Automatic gallery infrastructure is independent and is held outside this immediate publication.

## Automatic native gallery48 follow-up

BotPR51/da78 produced the next complete native23 batch and marketingv.0.48 through protected genuine CI and the installed automatic immutable timer, not a manual fallback. All12actual normalURL hashes,36desktop/mobile tab/modal/focus/defaulttree/keyboard flows and health pass. Initial End-focus matcher transient was diagnosed and rerun successfully with matching actual/selected focus at all three widths; no runtime product change. Output-loop no-op44985846872 passes. Canonical gallery provenance is now AUTO_CAPTURE.md; historical47public/cache proof remains unchanged. Full automatic/provenance/limits evidence: specs/010-versioned-gallery/verification.md and docs/validation/2026-11-22/gallery48-*.json.
