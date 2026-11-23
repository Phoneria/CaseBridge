# Feature Specification: Synthetic scenario weights

**Created**: 2026-11-22 | **Status**: User-authorized POC; implementation pending

## User Scenarios & Testing

### User Story 1 — Discover and inspect a demo (P1)
An authenticated ordinary bureau user opens the actual Olasılık Ağacı entry and discovers a separate fictional invoice/evidence example. Changing a document or payment-record assumption visibly changes the applicable scenario weights and explains the arithmetic.

Acceptance: deep link and visible example button work without creating bureau records; graph/text/detail views show identical Demo tahmini values, method, source and uncertainty; a previous snapshot/difference remains in session memory.

### User Story 2 — Boundaries (P1)
Normal bureau files retain null probability but display independent 0–100 Demo tahmini support weights, including mock/example records. Missing evidence yields a visible neutral 50/100 starting assumption; missing synthetic input yields an equal three-way partition. Platform/restricted/unauthenticated users retain existing denials.

### Functional Requirements

- **FR-001**: A dedicated immutable synthetic fixture is accessible from /ai/olasilik; no real case, document, analysis or firm identifiers are accepted by its calculator and no bureau record is created.
- **FR-002**: Every numerical output is labelled Demo tahmini / illustrative scenario weight; no real case-winning probability or empirical calibration claim.
- **FR-003**: A small versioned additive scoring rule and each assumption's contribution are visible; changing a supported/contradicted/unreviewed assumption changes the weight and context fingerprint deterministically.
- **FR-004**: Only the three mutually exclusive/exhaustive states of the same defined review question are normalized together; one-decimal percentages sum to exactly 100 using integer largest remainders. Root/action nodes and unrelated stored scenarios are never normalized.
- **FR-005**: If either required synthetic document/payment source is missing, all group weights use equal starting scores [1,1,1] with an explicit missing-record explanation; unknown/unreviewed is explicitly different from a missing source.
- **FR-006**: Real-case responses use independent support weights for every scenario branch: neutral 50; with directly linked eligible records, support/contradiction adds/subtracts 10 + min(10, 2 × distinct record count); no records always stays 50. These scores are not normalized or probabilities. This applies regardless of is_example/provider/number/name/client query flags; authenticated session guards and tenant boundaries remain unchanged.
- **FR-007**: Inputs/snapshots remain only in session memory, stale requests are ignored, graphical/text views remain keyboard/mobile usable; marketing/FAQ describe the actual limited demo and preserve real-case limits.

## Success Criteria

- **SC-001**: All supported input combinations have deterministic valid references, no negative/NaN values and exact 1000 percentage-tenths where calculated; missing combinations have equal starting weights [334,333,333] tenths.
- **SC-002**: HTTP and schema negative tests prove no forged query changes tenant scope or enables normalized real-case probabilities and existing 401/403/404 boundaries remain intact.
- **SC-003**: The actual entry/deep link, assumption change, explanation, empty-data case and switch back to real files pass desktop/mobile browser tests; public expected version/code/health and demo flow pass before release is complete.

## Assumptions and Limits

The user explicitly authorized a POC (Demo tahmini). Rule points are illustrative configuration, not learned frequencies or a legal expert's calibrated probabilities. No provider calls, migration, persisted synthetic cases, new customer delivery or independent-audit claim. Latest explicit user steering requires numeric Demo tahmini on all scenario branches in both modes. Roots/actions are context or steps rather than scored scenarios. No Hesaplanmadı appears in POC presentation.

- **FR-008**: Public marketing visitors can open an AI-authored fictional case from the restored homepage, rotate its perspective decision tree, select branches and outcomes, inspect fictional documents, edit event and conditional outcome weights, see the weighted whole-case distribution, and reset. No account or stored case is required.
