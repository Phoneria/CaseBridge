# Tasks: S05 Dosyaya özgü olasılık ağacı

## Phase 1: Setup

- [x] T001 Read constitution and approved requirements in specs/004-scenario-tree/spec.md.

## Phase 2: Foundational

- [x] T002 Validate boundaries and FeatureContract constraints in specs/004-scenario-tree/data-model.md#featurecontract against the implementation.

## Phase 3: User Story 1 (P1)

- [x] T003 [US1] Implement data-model.md#featurecontract TreeNode.id, TreeNode.kind, TreeNode.probability, TreeNode.source_ids, ScenarioTree.context_version and ScenarioTree.case_id constraints; Implement FR-001 through FR-006 in backend/app/legal_lab/scenario_tree.py, backend/app/api/routes/legal_lab.py, frontend/src/components/lab/ScenarioTreeView.tsx, frontend/src/types/scenarioTree.ts, frontend/src/app/ai/olasilik/page.tsx.
- [x] T004 [US1] Verify primary acceptance scenario and record real evidence in specs/004-scenario-tree/verification.md.

## Phase 4: User Story 2 (P2)

- [x] T005 [US2] Verify error/permission/accessibility boundaries in specs/004-scenario-tree/quickstart.md and record failures/limits.

## Phase 5: Release and Convergence

- [x] T006 Verify source/main/public release consistency where applicable and record convergence in specs/004-scenario-tree/verification.md.

## Dependencies and Execution

T001 → T002 → T003 → T004/T005 → T006. Independent fixture/research work may proceed separately; shared source edits remain sequential. See todo.md S01–S09 for cross-feature dependencies.

- [x] T007 [US2] Verify FR-007: record the explicit user technical/capture acceptance and clarify that no independent legal-expert review is claimed or invented as a new release gate.
