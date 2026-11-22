# Verification — 22 November 2026

Baseline: clean detached HEAD c994bb4 matched fetched origin/main; local main e78a21c was behind and was not used. Branch codex/interactive-workspace-guide starts at origin/main. No unrelated edits at start.

Spec Kit 1.4.3 specify/plan/tasks/analyze/implement/converge: requirement checklist 4/4; 7 FR linked to 7 dependency-ordered tasks. Analysis: 100% FR coverage; no material ambiguity, constitution violation or unlinked constrained field. Topic fields implemented by T003; topicId by T004; step/open by T005. No extension hooks file. Local ignored feature pointer is specs/011-workspace-guide.

- Targeted frontend: 23/23 (5 guide, 6 WorkspaceHeader, 7 AppShell, 5 AiNavigation). Existing asynchronous header act warnings are recorded; no failed tests. Final guide rerun 5/5 after copy refinement.
- Production Next build, static generation and TypeScript passed on final application source. Prepared v.0.24; marketing remains v.0.48. No dependency or backend changes.
- Actual built frontend Chromium: 30/30 combinations (bureau admin, lawyer, client, accountant, platform × 1440/390/320 × light/dark). Synthetic session and intercepted API only, no production account or provider. Source and unit tests cover remaining restricted positions.
- Context opens /buro?tab=deadline; all 17 bureau tabs and 20 main routes plus nested case route checked by named unit acceptance. Browser exercises critical steps, topic changes, back/restart/finish visibility, Shift+Tab/Tab wrap, Escape/focus return, header geometry, role exclusions, horizontal overflow and accessible controls through scroll.
- Zero requests attributable to guide reading, zero non-GET calls, unchanged browser storage/URL, zero page errors in all 30 scenarios. Only synthetic session and theme existed in browser storage.
- Native desktop/mobile screenshots in /tmp/casebridge-guide-browser reviewed in both light and dark; mobile content scrolls within existing ModalFrame. Results: docs/validation/2026-11-22/workspace-guide-browser.json. Repeatable browser harness tests/e2e/guide-check.cjs expects built frontend on localhost:3015 and mocks all localhost:8000 API requests.
- python3 scripts/check-specs.py passed for 11 feature sets. Executable diff acceptance: base c994bb4 → feature 4743904, 4 behavior files / 4 named acceptance tests executed successfully without skips.

Convergence review: 7 functional requirements, 3 success criteria and 3 user stories checked against implemented content, filter, panel and evidence; no remaining scoped implementation gap. Existing service role/credential scope and activation workflow unchanged. No actual workflow operations are exercised by guide tests because this feature is read-only instruction; original operation implementations are not changed.

Delivery: issue #54 on CaseBridge Projects, review PR https://github.com/Phoneria/CaseBridge/pull/55 (open, ready for review); issue #54 is In Review. Final browser evidence rerun passed 30/30. No merge, auto-merge or deployment; public version/code/health and production rollback not exercised or claimed. No new customer delivery or onboarding.

## Explicit replacement clarification — 22 November 2026
User screenshot and text require the header CaseBridge AI button to be replaced by Rehber, rather than showing both. WorkspaceHeader now places the existing interactive guide before UserMenu, in the former AI position. Sidebar AI tools remain. Constitution VI's header-only requirement has the explicit user-authorized exception documented in spec.md; no scope/auth changes.

Current origin/main b8038f9 merged while retaining both independent todo entries. App v.0.24 remains the unreleased review candidate. 22 targeted Header/Guide/Sidebar tests passed. Final production build/typecheck and version source check passed. Updated real Chromium harness explicitly asserts no header CaseBridge AI button; all 30 role/width/theme scenarios passed again, with zero guide network/write/URL/storage effects or page errors/overflow. Native screenshots reviewed at 320px light and 1440px light; prior two-theme checks retained. Evidence: docs/validation/2026-11-22/workspace-guide-replacement-results.json; screenshots /tmp/casebridge-guide-replacement. No release or merge is claimed.

The [verified v.0.26 production release](../001-main-release/verification.md#workspace-release-v026) supersedes the earlier review-stage status.

## Standalone handbook and screen tours

The v.0.27 candidate implements FR-008 and FR-009. From a workspace screen the header link opens the matching article on /rehber. Each role gets a permitted directory, searchable titles and purposes, location instructions, ordered steps and an application link. Cases, tasks, reports, admin and account have opt-in inline tours.

The production build passed, including /rehber, and the final frontend suite passed 771 tests across 84 files. Spec Kit validated 14 feature contracts and executed six bound acceptance tests for 11 changed behavior files.

Chromium passed 34 synthetic scenarios on the built application. Five session roles ran at 1440, 390 and 320 pixels in both themes, with four additional desktop/mobile checks for the admin and reports tours. Checks covered opening the full page, matching context, permission filtering, visible real targets, moving forward and backward, returning to the article, horizontal overflow and zero API writes. Desktop and mobile screenshots were inspected.

An initial browser attempt preceded server readiness. A missing win-rate field in the synthetic report response was corrected. The reports tour also exposed a real layout shift after the summary loaded. The final build rechecks the highlighted control after asynchronous rendering and resizing. The final run exercised all five tours successfully. PR 65 tracks review.

## Production release v.0.27

[PR 65](https://github.com/Phoneria/CaseBridge/pull/65) passed governance and the frontend and backend jobs before merging. The reviewed entrypoint staged, activated and verified application commit `24d576ea0f46202a4a96a5e322cd846ca0658874`. The public application marker returned 0.27. The verifier checked all 57 public JS/CSS assets and the running code. Public health returned ok. The backend and database retained their pre-release container identities. The backend continued to report its expected v.0.26 source. An isolated old → new → old image rehearsal passed.

In an existing authenticated Chrome session on the public application, the reports guide opened as a page. Starting its tour highlighted Önizle. Sonraki moved the visible outline to CSV Olarak İndir and Önceki restored it to Önizle. Turu bitir returned to the reports article. The operator used tour controls only.

The published frontend also passed 34 Chromium scenarios using isolated synthetic API responses. They covered the five supported tours, desktop and mobile layouts, both themes and five roles. Assertions checked each expected control's outline, visibility, step count, backward navigation and return to the matching guide article. The test issued zero application writes.
