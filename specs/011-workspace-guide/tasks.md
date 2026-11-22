# Tasks
## Phase 1: Setup
- [x] T001 Specify FR-001 through FR-007 and source research in specs/011-workspace-guide/spec.md and research.md.
- [x] T002 Define contract in specs/011-workspace-guide/data-model.md#featurecontract and contracts/behavior.md.
## Phase 2: US1/US2/US3
- [x] T003 [US2] Implement sourced Turkish topics in frontend/src/lib/workspaceGuide.ts per data-model.md Topic.id, Topic.route, Topic.tab, Topic.steps (FR-003).
- [x] T004 [US3] Implement role and context matching in frontend/src/lib/workspaceGuide.ts per data-model.md GuideState.topicId (FR-002, FR-004).
- [x] T005 [US1] Implement frontend/src/components/WorkspaceGuide.tsx and WorkspaceHeader.tsx per data-model.md GuideState.step, GuideState.open; readonly controls, mobile header and focus (FR-001, FR-002, FR-005, FR-006).
## Phase 3: Validation/review
- [x] T006 Execute critical tests in frontend/src/components/__tests__/WorkspaceGuide.test.tsx and browser, record specs/011-workspace-guide/verification.md (FR-001 through FR-006).
- [x] T007 Prepare frontend/app-version.json, specs/changes/workspace-guide.json, todo.md; build, spec gate, review PR and Projects In Review (FR-007).
Dependencies: T001→T002→T003→T004→T005→T006→T007. US2 content and US3 scope independently tested; US1 browser tests their integration. No delegated work required.
