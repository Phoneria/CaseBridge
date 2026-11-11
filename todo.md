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
- Validation: the final local suites passed **1,017 backend tests and 719 frontend tests**. GitHub CI also passed both jobs on `fefd946`. An existing activity-list test raced asynchronous data loading in CI; it now waits for the links, and the full suite passed after the correction.
- Browser validation passed on desktop and mobile using synthetic microphone/speech fixtures and the actual mock-provider worker. Two opposing replies appeared without any early judge decision; spoken Finish produced exactly one evaluation. The final 14 conversation-specific backend tests passed, including a 13-exchange transcript, ownership, final-draft preservation, retry and complete segmented speech. Physical microphone hardware was not tested.
- SQLite and PostgreSQL upgrade/downgrade/upgrade passed on disposable databases. A real-provider opposing reply and final judge evaluation passed in isolated memory storage without writing production records. A short real Turkish speech-generation/transcription round trip passed using the existing bureau credential; its value and activation were unchanged.
- Application source `c8a6c78` was deployed as **v.0.7**. Server production compilation/type checks passed. The public site serves the expected version, updated courtroom controls and Finish API; health returns HTTP 200. The production schema reached the expected migration, and the existing bureau credential remains readable after restart.
- Database dumps, encrypted credential archives and matching configuration are protected on the server under the courtroom release backup; archive integrity was checked and previous application images were retained. Only the two application services were recreated.
- A follow-up after the user's connection interruption confirmed public page/API HTTP 200, successful live AI response, zero container restarts and no backend HTTP 5xx or tracebacks in the preceding 20 minutes. This does not identify the cause of the user's temporary connection interruption.

## Follow-up — Sufle interview pilot, v.0.9

- Add Sufle to the bureau sidebar and AI hub; publish the twenty fictional example interviews as HTML and downloadable text.
- Add GPT-backed interview assistance using only the authenticated bureau's existing active key. Key staging, activation and retention are unchanged. The separate local v.0.8 design-preview work is preserved outside this isolated release.
- Continuous microphone capture uses approximately ten-second independent audio clips; this is near-live processing, not full-duplex Realtime or automatic speaker diarization. Text-only synthetic testing is available. Finish drains final audio before creating a summary. Failed clips stay in page memory for retry; page navigation loses the non-persisted interview, which can be exported explicitly.
- Source-linked cards use exact quotations. Wrong source IDs are corrected only with a unique exact quote; unsupported cards never appear. Rate/size/history limits and provider errors are enforced. Sufle API usage is charged to the bureau and shown per session; it is not included in the existing persisted analysis/chat monthly usage counter.
- Validation so far: the full frontend suite passed 727 tests; 22 final affected component checks and 28 final Sufle API tests passed, along with 19 credential-management checks. Both browser scenarios passed, covering desktop/mobile text flows, example counts, downloads, card actions, automatic continuous capture, failed-audio retention/retry and draining the last clip before the summary. A real GPT response and summary plus a Turkish speech round trip passed against synthetic data using the existing bureau credential without changing it. Physical microphone hardware was not tested. Production compilation/type checks passed locally and on the server. The broader backend run was interrupted and reported a temporary-directory fixture error during interruption cleanup; no complete full-suite result or new GitHub CI result is claimed.
- The mandatory additional-customer rollout requirements above remain unchecked. This pilot is for the existing installation, not authorization to onboard another bureau.

- Deployed application source `9921f0e` as **v.0.9** to the existing installation. The public Sufle page serves the new controls and exact version label; Sidebar marks Sufle active. Both example files return HTTP 200 and contain 1,002 dialogue turns / 120 cards. Desktop and 390px mobile checks passed without overflow or browser page errors.
- Public authenticated API checks passed with synthetic input: anonymous status is rejected (401), bureau status succeeds, real WAV transcription succeeds, GPT produces source-grounded advice, and Finish produces a summary. An additional check used Chromium's native AudioContext and MediaRecorder to create an actual WebM clip; the same public API recognized its synthetic Turkish speech successfully. No physical microphone was used.
- Public health passed (HTTP 200). The backend had zero restarts, zero HTTP 5xx and zero tracebacks in the reviewed five-minute window. Existing encrypted credential files and protected configuration match the pre-release backup byte-for-byte. No key was entered, replaced or activated.
- Protected pre-release backup: `/var/backups/casebridge/sufle-v0.9-20261110T165458Z`, including database dump, storage archive and matching configuration. Checksums, archive readability and dump listing passed; this release did not perform a new full recovery drill. Previous application images are retained under `before-sufle-v09` tags. Only the two Casebridge application services were recreated; the database schema and shared Autosense stack were unchanged.

## Bureau and platform management — local development, 11 November 2026, v.0.9

- Added the bureau administrator's `/buro` operations workspace: real case/task/calendar alerts and capacity, critical deadlines with primary/backup responsibility and verification, financial/time records, client/contact tracking, new-business stages and same-bureau party search, review/approval versions, dependent checklists, leave records, client publications, scoped invitations/access, AI usage/budget assumptions, support, append-only management history and reversible management-record trash.
- Added `/platform` search/status/invitation filters and summary counts; `/platform/[id]` provides contact/billing details, onboarding steps, manual subscription/payment tracking, enforced invitation/reactivation and document-storage limits, account ownership/follow-up, operational counts, support and platform-only history. Last-seen tracking starts with this update; no historical activity is invented. Platform profile/history do not expose customer case text, financial records or private management notes.
- Added `/calisma-alanim` for assigned work and restricted staff/client accounts. Scoped accounts are blocked at the shared authentication dependency from legacy case/search/report/AI/admin APIs. Client visibility requires an explicit published audience grant; documents are selected separately and downloads recheck the current publication and case grant. New scoped users receive the grant before their invitation is usable. Administrators cannot turn a user with open work into a client without transferring the work first.
- Extended work transfer and the existing deactivation workflow to include open management work. Added a recipient's delivery acknowledgement and the manager's receipt view. Financial records use Decimal and separate fee/payment, expense/reimbursement, advance/spend and currencies; case value is not revenue. AI cost is an explicitly user-entered estimate over recorded analysis/chat tokens, with incomplete voice/intake/courtroom coverage; its budget is an alert threshold, not a provider spending cap. Role presets are described in `docs/bureau-management.md`; this is not an unrestricted custom permission designer or payment/accounting integration.
- Migration `d8e9f0a1b2c3` adds the five management tables and last-seen metadata. A disposable SQLite upgrade/downgrade/upgrade and durable reopening test passed. PostgreSQL offline migration SQL generation passed; a live PostgreSQL migration has not been run for this change.
- Full backend suite: **1,041 passed** in an isolated test process using real bcrypt with cost 4 for synthetic fixtures only. The initial normal-cost full-suite run was interrupted because fixture hashing dominated runtime; it was not reported as a completed run. No production source/default was weakened. A fresh process separately verified the unchanged default bcrypt cost **12**, successful verification and rejection of an incorrect password. **51 focused bureau/platform/user-lifecycle tests passed at normal cost**, followed by a normal-cost portal test that verified actual shared-file download, no-store headers and immediate rejection after access revocation.
- Frontend: **725 tests passed**. After the form-label and lifecycle refinements, **38 affected component tests passed**; the final checklist cascade checks passed in the **5-test** workflow component suite. Type checking and the final production build passed. Existing dependency deprecation, jsdom navigation and chart-size test warnings were observed; they did not fail the suites.
- Browser: **3 Chromium scenarios passed** against a disposable local database and mock AI provider: existing firm creation/admin login/suspension, bureau fee/deadline/review/portal flow and mobile navigation, platform profile/support persistence. The first bureau run exposed an implicit-select-label lookup problem; explicit input-label associations fixed it and the rerun passed. Desktop/mobile screenshots were inspected; the dark summary card contrast and mobile section chooser were refined. Synthetic client publications remained private until published; internal review text did not appear in the client portal. Public production was not modified.
- Unreleased application manifest is **v.0.9**, following the local v.0.8 preview. Repeated development test-server version bumps were consolidated into this single proposed version; the manifest retains the final application source hash. Marketing files and their independent version were not changed by this work.
- [ ] Publish this application update and run its migration against production with protected backups and a rollback plan.
- [ ] Verify the public v.0.9 label, updated served application code and public health after any future deployment.
- No Git commit, push, production deployment, real customer onboarding or AI credential change occurred. The mandatory additional-customer release gate above remains unchanged and incomplete; this development is not approved for another customer rollout.

## Bureau management production preparation — 11 November 2026, v.0.10

- Release is based on the deployed Sufle source `9921f0e` and its verified release record `93baa28`, preserving Sufle routes, views, configuration and tests. The independent local five-design preview and marketing changes are excluded. Live already uses v.0.9; the combined release is v.0.10.
- Merged-source validation: 1,069 backend tests passed in the isolated synthetic-fixture bcrypt-cost-4 process; 733 frontend tests and TypeScript passed. The default production bcrypt-cost-12 checks and normal-cost management checks from the preceding development record remain applicable; production password settings are unchanged.
- No live credential is to be entered, rotated or activated by this deployment. Existing encrypted credential versions and matching encryption configuration must be preserved in protected backups and recovered in isolation without revealing their values.
- Production backup, live PostgreSQL migration rehearsal, browser release checks, public version/code/health and post-restart credential metadata checks are pending. The customer-rollout gate remains incomplete until its evidence is recorded.
