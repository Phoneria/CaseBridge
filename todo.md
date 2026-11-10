# CaseBridge release TODO

Updated: 10 November 2026.

## Current update — option 1

- [x] Allow a platform administrator to add a masked API key in Settings.
- [x] Test and encrypt the candidate separately; saving must not change the active key.
- [x] Require a separate Activate action, revalidate the candidate, and retain the previous key.
- [x] Verify authorization, secret redaction, failed-key handling and persistence.
- [x] Publish this update as **v.0.2**, using the `v.` display prefix.

## Mandatory before any additional customer rollout — option 2

**Customer rollout is blocked until this section is complete.** The user explicitly requires separate AI keys for each law firm before delivery or onboarding to another customer. The user subsequently authorized per-bureau key management; the staged save/test/activate workflow remains required.

- [x] Store encrypted credentials separately for each law firm, including active and pending keys.
- [x] Let each firm's administrator manage only that firm's keys; derive the firm from the authenticated session, never client-supplied IDs.
- [x] Resolve the correct firm's key throughout analysis, document intake, chat, automatic answer classification, courtroom, voice and background jobs.
- [x] Keep connection status, validation results and caches scoped to the firm.
- [x] Prevent customer requests from falling back to another firm's key or a shared application key.
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

## Follow-up — bureau key management, v.0.5

- User authorized bureau administrators, including the current bureau account, to add/test/activate their own encrypted OpenAI credential directly in Settings. The platform account is no longer required for bureau configuration.
- Each bureau has isolated active, pending and previous credential files, with encrypted scope binding. Bureau requests and queued jobs never use the platform fallback key. Lawyers can use the bureau connection and inspect its status; bureau administrators manage the bureau-wide key.
- Validation so far: 709 frontend tests passed, plus 46 existing credential/status/provider checks and 28 final isolation/worker/courtroom checks. All three browser scenarios passed: platform key staging/activation, bureau administrator key staging/activation and lawyer read-only access. Provider responses were synthetic. Full backend suite and deployment evidence are pending.
- Additional-customer rollout remains blocked until the unchecked requirements above have final release evidence. No real customer API key has been entered or changed by the assistant.

## Follow-up — scrolling beyond the workspace, v.0.6

- Reproduced the user's blank area by scrolling Settings to the bottom and then attempting to scroll the outer document. The first containment-only change still allowed 245 pixels of outer scrolling, so it was not sufficient.
- Fix the workspace to the viewport, contain main/sidebar scroll chaining, use a dynamic minimum viewport height for the body and keep the root background aligned with the workspace.
- The browser regression now passes at desktop and narrow-screen sizes: outer scrolling stays at zero, document height stays within the viewport, and main content reaches the bottom edge. Fifteen AppShell/sidebar component tests passed. Mobile menu follow-up and production deployment are pending.
- Bureau-key release `64b3d2e` was deployed as `v.0.5`; the public label, Settings controls, current bureau administrator permission and health were verified. The user subsequently activated their own key and supplied a screenshot showing both AI checks green. The assistant did not enter or activate that key.
- The broader workflow check found a legacy test double with the old provider signature: 56 tests passed and one test failed because the double accepted no bureau argument. The double now asserts the authenticated bureau argument, and the corrected test passes. Full-suite completion is pending.
- Deployed application commit `ac1be7f` as `v.0.6`. Public health, exact version label, fixed viewport shell, dynamic body height and scroll containment CSS were verified. Desktop/narrow-screen bottom-scroll screenshots were reviewed; the mobile menu browser check passed. Production build/type checks and GitHub frontend CI passed. Only the frontend service was recreated; the active bureau key was not changed.
- A protected archive of the encrypted credential directory and matching production environment is stored on the server for this release; archive integrity was checked. A fresh backend Python process can read the active bureau credential metadata without exposing its value. Cross-bureau ciphertext rejection and recovery into fresh storage passed in the synthetic tests.
- Full backend reruns remain in progress. Do not report all CI checks as green or mark the additional-customer release gate complete until the final full-suite result is reviewed.

## Follow-up — written and spoken courtroom dialogue, v.0.7

- The previous merged release passed the full backend CI suite: 1,003 tests on `1e46d80`, with frontend CI also successful. The separate customer-rollout gate above remains open.
- New courtroom sessions use conversation mode: the user speaks or writes as their chosen lawyer; only opposing counsel replies during the exchange. The judge produces the training decision and score only after an explicit Finish action or standalone `bitir`, `bitti`, `bit` or `done` command.
- Recording is turn based: click Konuş, speak, then Kaydı bitir. Transcription submits automatically, and new AI responses are spoken when automatic audio is enabled. This is not full-duplex or automatic silence detection. Existing structured sessions retain their original flow.
- Finishing preserves an optional final draft, does not invent another opposing statement, can retry provider failures and gives the judge the complete conversation and the presented evidence record. Role-private notes remain isolated. Audio replies use consecutive bounded segments rather than dropping the remainder of long replies.
- Validation so far: all 718 frontend tests passed; 24 focused backend courtroom tests passed, including 13 exchanges without early verdict, standalone finish commands, final-request ownership, retry, preserved closing draft and complete segmented speech. SQLite migration upgrade/downgrade/upgrade passed. The browser dialogue flow passed with the real mock-provider worker: typed and recorded statements produced opposing-only replies, speech playback was requested, and a spoken Finish produced exactly one judge decision. Speech and microphone input were synthetic browser fixtures; physical-device audio was not tested. A short synthetic Turkish speech-generation/transcription round trip also passed using the current bureau credential on the server; its value and activation were unchanged. Full backend suite, production build and deployment verification are pending.
