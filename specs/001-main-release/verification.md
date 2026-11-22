# Verification: 001-main-release

## Result — completed, 2026-11-22

Main commit was exported to an immutable, root-owned artifact; pinned image IDs, 897 source files, 54 frontend JS/CSS and 48 marketing files were verified. The restricted role staged/activated it. Actual normal-account code writes, general sudo and Docker access were denied; status was allowed, non-main SHA and unverified rollback rejected without restarting services. Both running app containers have read-only root, ALL capabilities dropped, no-new-privileges; frontend UID 1000. Actual runtime code-write attempts failed. Protected configuration and encrypted credential versions are unchanged. Existing root/izzet administrator access remains, explicitly outside the ordinary-role restriction. No automatic deployment trigger was added.

Actual isolated old → new → old image cycle passed synthetic backend health, frontend HTTP and read-only checks; production rollback was not performed. Previous b640c54 images/manifests remain available and a paired configuration/encrypted-version/DB backup is protected on the server. No schema changes. Failed preflight candidates were never activated: Compose syntax/duplicate-list and nonroot asset-permission problems were fixed and regression checks added. Fourteen release unit tests and actual base+runtime Docker Compose checks pass.

## Public release

Application **v.0.20**, marketing **v.0.44**; deployed main commit `70fabd06f695f03477203a3fc86291f06e3e2f7c`. Public release markers and health report this commit; updated code/file/image hashes match the immutable artifact. All three CI jobs passed: https://github.com/Phoneria/CaseBridge/actions/runs/44960991593 (1099 backend / 753 frontend tests, governance/14 release tests, Compose, type/version/build).

## Evidence

- `docs/validation/2026-11-22/release.json`, `ci.json`
- `public-browser.json`, `runtime.json`, `release-permissions.json`, `isolated-rollback.json`
- `browser.json`, `gallery.json`, `contrast.json`, `cta-contrast.json`, `product-captures.json`
- `todo.md` final release record; `deployment/immutable-release.md`

## Convergence

Every scoped requirement maps to implemented code and actual verification. All feature tasks are complete; missing checks were added append-only as discovered and completed only after evidence. External/legal-model validation was not invented as a new release gate or claimed as performed by the assistant. This final documentation commit does not change released application behavior. Existing customer onboarding/key gates remain governed by AGENTS.md/todo.md.

## Completed main protection follow-up

Ruleset 27816126 is active on refs/heads/main; effective branch protected=true. PR required with zero required external reviews, no bypass actors, non-fast-forward updates blocked. Required spec-governance is bound to actual GitHub Actions app 15368. CLI admin API succeeded; connected integration PR creation returned 403, so existing authorized CLI was used.

Implementation PR #27 merged through the protected path after its required check passed (head ae1a59b; merge 3b3e0a7). Eight focused gate tests pass; CI executed their bound selectors. A failing or skipped selected test is not accepted. Normal docs-only work needs no record.

Same probe PR #28: c208bc3 failed the real check with "Behavior changes lack Spec Kit requirement + changed acceptance test: scripts/spec-gate-probe.py" and mergeStateStatus BLOCKED. On 085bdb2, a concrete assertion test and FR-008 binding passed the same required check; mergeable=MERGEABLE. mergeStateStatus remained UNSTABLE while nonrequired full jobs ran; this is not recorded as all CI passing or CLEAN. The required gate was satisfied. PR closed unmerged, mergedAt=null; probe code never entered main. No unsafe actual merge/force-push probe was attempted.

Evidence: docs/validation/2026-11-22/main-protection-results.json. This enforces file/requirement/test existence and actual selected test execution; semantic adequacy still needs review. Repository admins can edit rules/workflows; no claim of absolute administrator prevention or independently audited test relevance. App/marketing deployment permissions were not redesigned.

## FR-009 automatic production UI pilot

[Installer PR #31](https://github.com/Phoneria/CaseBridge/pull/31) merged as `ffea637f95755593e29ee7ad2996aa8b3eb281fe`. The VPS timer was enabled on this verified baseline. The restricted service only fetched the configured GitHub main and held the existing release lock throughout the automatic transaction.

[Application UI pilot PR #32](https://github.com/Phoneria/CaseBridge/pull/32) passed spec-governance and the frontend type/version/build checks. The backend job was skipped. It merged as `f625960cadd4e4c29985fa26fcb4914d4ff326b3` at 00:41:19 UTC on 22 November 2026. At 00:41:38 UTC the timer picked up the revision and selected the application scope. At 00:43:05 UTC the service exited successfully, reporting the same revision, verified activation and health OK. This single pilot took 19 seconds to start and 87 seconds to stage, activate and verify. No manual stage/activate call was used.

- The open application release identity returned version `0.23` at the pilot merge. All 54 public frontend asset digests passed the immutable verifier.
- Public health returned `ok`. Backend container ID `5ea357eff4da` retained its 2026-11-21 23:57:55 UTC start, and database container ID `7c8c08a04ac5` retained its 2026-11-12 13:40:05 UTC start. Backend health retained its own source revision `1b460a6` and version `0.21`.
- The marketing marker retained `80035eaea87f07445d375d8848ee7e8bee8ae8b5` and `v.0.46`. The production pilot exercised application UI. Static marketing classification, mixed-path fallback, rename and failed activation handling were checked in the focused automated tests.
