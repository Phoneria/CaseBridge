# Tasks: S02 Main kaynaklı değişmez yayın

## Phase 1: Setup

- [x] T001 Read constitution and approved requirements in specs/001-main-release/spec.md.

## Phase 2: Foundational

- [x] T002 Validate boundaries and FeatureContract constraints in specs/001-main-release/data-model.md#featurecontract against the implementation.

## Phase 3: User Story 1 (P1)

- [x] T003 [US1] Implement data-model.md#featurecontract Release.commit, Release.scope, Release.state and file digest validation; Implement FR-001 through FR-008 in deployment/release.py, deployment/install-release.py, deployment/compose.production.yml, deployment/README.md.
- [x] T004 [US1] Verify primary acceptance scenario and record real evidence in specs/001-main-release/verification.md.

## Phase 4: User Story 2 (P2)

- [x] T005 [US2] Verify error/permission/accessibility boundaries in specs/001-main-release/quickstart.md and record failures/limits.

## Phase 5: Release and Convergence

- [x] T006 Verify source/main/public release consistency where applicable and record convergence in specs/001-main-release/verification.md.

## Dependencies and Execution

T001 → T002 → T003 → T004/T005 → T006. Independent fixture/research work may proceed separately; shared source edits remain sequential. See todo.md S01–S09 for cross-feature dependencies.

- [x] T007 [US2] Validate production Compose syntax and merged runtime config before image builds; add a no-secret Docker Compose CI validation after the staging gate caught invalid dependency indentation.

- [x] T008 [US2] Normalize clean archive permissions independent of caller umask; verify private umask 077 still yields readable code/assets for the nonroot frontend.

- [x] T009 [US2] Normalize runtime asset read permissions in frontend/Dockerfile and prove nonroot startup on the built image, including public/sufle.

- [x] T010 [US2] Reject invalid or unverified rollback candidates before entering recovery, so rejected caller input cannot restart the previous release.

- [x] T020 Implement data-model.md#featurecontract change record and FR-005 through FR-008 diff-to-requirement/named runnable acceptance validation.
- [x] T021 Verify actual effective main rules/provider and negative→fixed same PR without merging probe code.
- [x] T022 Merge governance implementation only through the protected PR path and record actual check/merge evidence.
