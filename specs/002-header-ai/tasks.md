# Tasks: S03 Header yapay zekâ gezinmesi

## Phase 1: Setup

- [x] T001 Read constitution and approved requirements in specs/002-header-ai/spec.md.

## Phase 2: Foundational

- [x] T002 Validate boundaries and FeatureContract constraints in specs/002-header-ai/data-model.md#featurecontract against the implementation.

## Phase 3: User Story 1 (P1)

- [x] T003 [US1] Implement FR-001 through FR-004 in frontend/src/components/AiNavigation.tsx, frontend/src/lib/aiNavigation.ts, frontend/src/components/Sidebar.tsx, frontend/src/components/WorkspaceHeader.tsx.
- [x] T004 [US1] Verify primary acceptance scenario and record real evidence in specs/002-header-ai/verification.md.

## Phase 4: User Story 2 (P2)

- [x] T005 [US2] Verify error/permission/accessibility boundaries in specs/002-header-ai/quickstart.md and record failures/limits.

## Phase 5: Release and Convergence

- [x] T006 Verify source/main/public release consistency where applicable and record convergence in specs/002-header-ai/verification.md.

## Dependencies and Execution

T001 → T002 → T003 → T004/T005 → T006. Independent fixture/research work may proceed separately; shared source edits remain sequential. See todo.md S01–S09 for cross-feature dependencies.

- [x] T008 [US2] Verify FR-007: normalize a stale initial action at the courtroom submit boundary; keep explicit valid conversation choices, then rerun microphone and full frontend regression/CI.

- [x] T020 Implement FR-001 through FR-005 expanded compact sidebar and data-model.md#featurecontract shared AI navigation; critical role/active-state tests, geometry at 900/768px and short/mobile scroll, protected PR and public release.
