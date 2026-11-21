# CaseBridge Spec Kit work

Pinned tooling: GitHub Spec Kit 1.4.3 / Codex. The project constitution is
[constitution.md](../.specify/memory/constitution.md). Detailed approved scope and
cross-feature dependencies remain in [todo.md](../todo.md).

| ToDo | Feature |
| --- | --- |
| S01 | Tooling, constitution, AGENTS.md and scripts/check-specs.py |
| S02 | 001-main-release |
| S03 | 002-header-ai |
| S04 | 003-map-alignment |
| S05 | 004-scenario-tree |
| S06 | 005-logo-theme |
| S07 | 006-product-captures |
| S08 | 007-video-visibility |
| S09 | 008-turkish-faq |

Use the installed skills in order: constitution → specify/clarify → plan → tasks →
analyze → implement → converge. Codex invokes these as `$speckit-<command>`.
`specify` is setup/runtime inspection, not a substitute for those agent steps.
No automatic deployment trigger has been selected. CI verifies artifacts only.

## Pre-implementation consistency review (2026-11-22)

All eight requirements checklists were reviewed: 5/5 each, no unchecked items.
No critical ambiguity or constitution conflict remains. Data-contract field citations
were added to implementing tasks before implementation; old task records are not
used as acceptance evidence. Spec Kit integration status reports `ok` with no missing
or modified managed skill/template files. Real execution results belong in each
feature's verification.md; unimplemented tasks remain unchecked.

## Local implementation verification

Actual test/build/browser/capture results are recorded per feature and in `docs/validation/2026-11-22/local-checks.json`. Independent S05 legal-expert review and public rollout verification remain open. Technical tree capture is withheld from marketing until the review; unchanged current product features are verified and captured directly.
