# CaseBridge release TODO

Updated: 10 November 2026.

## Current update — option 1

- [x] Allow a platform administrator to add a masked API key in Settings.
- [x] Test and encrypt the candidate separately; saving must not change the active key.
- [x] Require a separate Activate action, revalidate the candidate, and retain the previous key.
- [x] Verify authorization, secret redaction, failed-key handling and persistence.
- [x] Publish this update as **v.0.2**, using the `v.` display prefix.

## Mandatory before any additional customer rollout — option 2

**Customer rollout is blocked until this section is complete.** The user explicitly requires separate AI keys for each law firm before delivery or onboarding to another customer. Option 1 is the interim workflow.

- [ ] Store encrypted credentials separately for each law firm, including active and pending keys.
- [ ] Let each firm's administrator manage only that firm's keys; derive the firm from the authenticated session, never client-supplied IDs.
- [ ] Resolve the correct firm's key throughout analysis, document intake, chat, automatic answer classification, courtroom, voice and background jobs.
- [ ] Keep connection status, validation results and caches scoped to the firm.
- [ ] Prevent customer requests from falling back to another firm's key or a shared application key.
- [ ] Test cross-firm reads, writes, activation, cache isolation and provider requests, including queued jobs and restarts.
- [ ] Preserve encryption keys and credential versions in protected backups; test recovery without exposing plaintext.
- [ ] Verify successful and failed activation with synthetic data, and confirm no secret appears in responses, logs, browser storage, source control or screenshots.
- [ ] Record release commit and test evidence here before marking the application ready for another customer.

## Before pushing or releasing

- [x] Review this checklist and the diff; do not include real credentials, private environment files or database dumps.
- [x] Run checks appropriate to the change and record material limits honestly.
- [x] Keep the displayed version aligned with the actual release.
- [ ] For a customer rollout, complete every mandatory option-2 item above first.

Internal development pushes may continue while the customer-release gate remains blocked. Never mark an unchecked requirement complete merely because a TODO or UI has been added.

## Validation for the current update

- Frontend suite: 709 passing tests before the staging refinement; 22 affected component tests passed after refinement.
- Backend: 52 focused provider, credential, authentication and secret-handling tests passed.
- Browser checks: platform navigation, desktop/mobile workspace checks and key entry passed; the final save-then-activate flow passed after refinement. Provider responses used synthetic test fixtures.
- Production build and type checks passed. A live user-provided key has not been entered, replaced or activated by the assistant.
- Deployed application commit `08bc3e6` to the existing app on 10 November 2026. Public health check passed; served Settings bundles contain the add-key and explicit activation controls and the `v.0.2` label. Server metadata confirms encrypted storage is enabled, with no managed or pending key yet. Previous images and protected configuration remain available for rollback.
- The full backend suite subsequently passed in GitHub CI on commit `0332187`: **994 tests passed**. Later version, permission-guidance and sidebar changes affect only frontend code and release documentation. Per-firm configuration remains incomplete and blocks additional customer rollout.

## Follow-up — v.0.3

- Clarify in the AI status panel that adding, testing and activating the shared key requires a platform administrator login; a bureau administrator cannot change the shared key.
- Keep the requested `v.0.3` release label. This clarification does not grant new permissions or implement per-firm credentials.
- Deployed to the existing app; public health and served Settings bundles confirmed the permission guidance and `v.0.3` label. All 15 affected Settings tests passed; server production compilation and type checks passed.

## Follow-up — sidebar placement

- Anchor the three-link CaseBridge AI block above the sidebar's connection status, Settings and version, keeping the main navigation at the top.
- Keep the navigation scrollable on short screens so the footer remains reachable.
- Validation: 8 sidebar component tests passed. The desktop placement check and mobile navigation check passed; the complete workspace browser tour passed on rerun with a 120-second limit after the first cold-development run reached its 60-second limit. Screenshots were reviewed at desktop and mobile sizes.
- Release version: `v.0.4`, following the already published `v.0.3` update. Deployed application commit `cf81f26`; the public Settings bundle serves the exact `v.0.4` label and bottom-anchored sidebar layout, and the health endpoint passes. Server production build/type checks and GitHub frontend CI passed for this commit. The backend source is unchanged from the 994-test successful CI run above.
