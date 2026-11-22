# Tasks: S07 Güncel gerçek ürün görselleri

## Phase 1: Setup

- [x] T001 Read constitution and approved requirements in specs/006-product-captures/spec.md.

## Phase 2: Foundational

- [x] T002 Validate boundaries and FeatureContract constraints in specs/006-product-captures/data-model.md#featurecontract against the implementation.

## Phase 3: User Story 1 (P1)

- [x] T003 [US1] Implement FR-001 through FR-006 in web-page/index.html, web-page/assets/feature-screens/tr-current, web-page/assets/feature-screens/tr-current/CAPTURE_NOTES.md, tests/e2e/marketing.
- [x] T004 [US1] Verify primary acceptance scenario and record real evidence in specs/006-product-captures/verification.md.

## Phase 4: User Story 2 (P2)

- [x] T005 [US2] Verify error/permission/accessibility boundaries in specs/006-product-captures/quickstart.md and record failures/limits.

## Phase 5: Release and Convergence

- [x] T006 Verify source/main/public release consistency where applicable and record convergence in specs/006-product-captures/verification.md.

## Dependencies and Execution

T001 → T002 → T003 → T004/T005 → T006. Independent fixture/research work may proceed separately; shared source edits remain sequential. See todo.md S01–S09 for cross-feature dependencies.

- [x] T020 Implement FR-004 first/default tree tab and data-model.md#featurecontract selected tab/panel relation; targeted markup/browser acceptance, protected PR and marketing-only v.0.46 public release.

- [x] T021 Read actual public app/site identity, health, constitution and current gallery provenance; confirm outdated v.0.22 captures.
- [x] T022 Implement FR-001 through FR-006 / data-model.md#featurecontract public v.0.23 native 12 captures with synthetic API boundary and current provenance; verify targeted contracts and gallery browser flows.
- [ ] T023 Protected PR and marketing v.0.47 publication; verify 12 public hashes, default/mapping/dialog/keyboard, service health and served identity before completion.
