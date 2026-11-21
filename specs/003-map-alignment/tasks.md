# Tasks: S04 Emin Bilgi Haritası uyumu

## Phase 1: Setup

- [x] T001 Read constitution and approved requirements in specs/003-map-alignment/spec.md.

## Phase 2: Foundational

- [x] T002 Validate boundaries and FeatureContract constraints in specs/003-map-alignment/data-model.md#featurecontract against the implementation.

## Phase 3: User Story 1 (P1)

- [x] T003 [US1] Implement FR-001 through FR-003 in docs/map-comparison.md, frontend/src/components/lab/MapView.tsx, frontend/src/lib/graphLayout.ts, backend/app/legal_lab/graph.py.
- [x] T004 [US1] Verify primary acceptance scenario and record real evidence in specs/003-map-alignment/verification.md.

## Phase 4: User Story 2 (P2)

- [x] T005 [US2] Verify error/permission/accessibility boundaries in specs/003-map-alignment/quickstart.md and record failures/limits.

## Phase 5: Release and Convergence

- [ ] T006 Verify source/main/public release consistency where applicable and record convergence in specs/003-map-alignment/verification.md.

## Dependencies and Execution

T001 → T002 → T003 → T004/T005 → T006. Independent fixture/research work may proceed separately; shared source edits remain sequential. See todo.md S01–S09 for cross-feature dependencies.
