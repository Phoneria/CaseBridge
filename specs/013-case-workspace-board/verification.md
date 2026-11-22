# Verification

Application candidate v.0.25, based on the review branch for #61. Tests used synthetic data and a local database.

- FR-001 and FR-002. API checks cover same-category suggestions, explicit cross-category links on a single case, repeated linking, unlinking, foreign bureaus and non-manager writes. The missing-outcome workflow writes one dated decision and rejects a second write. The browser opened a closed case from Davalar, checked the recorded result, unlinked/relinked a precedent and inspected a tree node.
- FR-003. Dragging a desktop card and using the stage menu on mobile both persisted the change. Editing notes, responsible lawyer, priority and due date survived reload. API checks cover all five stages, completion timestamps, outstanding work, conflicting fields, case grants and tenant denial. SQLite round-tripped pre-existing tasks through upgrade/downgrade. PostgreSQL DDL was generated offline.
- FR-004. The disposable bureau had category win rates of 66.67% for rent, 33.33% for employment, 60% for commercial, 25% for contracts and 33.33% for enforcement. Each rate was computed from stored wins and losses. Repeat import, confirmed removal, rollback and reload were exercised.
- FR-005. All four report kinds were compared cell-for-cell with the existing CSV exports. Checks included a quoted field, a comma, an empty report, tenant isolation and the download audit. All four previews opened in Chromium in both tested viewports.
- Final targeted backend run passed 104 tests covering task, precedent, report, lifecycle, scenario-tree, migration, template and removal paths. An earlier run used old template-size assertions and an admin test fixture missing a required case owner. Both were corrected before the green run.
- Frontend suite passed 763 tests across 83 files. Board and close-dialog tests were also rerun after the layout adjustment (36 passed). Production Next.js build, type checks and the application source-version check passed.
- 13 feature contracts passed Spec Kit governance. The diff gate for application commit ec61b3e executed 14 named acceptance tests binding 31 changed behavior files; all passed.
- Browser evidence: [local Chromium results](../../docs/validation/2026-11-22/case-workspace-board.json), 1440px light and 390px dark.
- Pre-release scope: local SQLite and PostgreSQL offline DDL. Public code, version, health and rollout are separate release gates.

The [verified v.0.26 production release](../001-main-release/verification.md#workspace-release-v026) supersedes the earlier review-stage status.
