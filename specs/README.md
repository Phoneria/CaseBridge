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

## Completed implementation and release

S01–S09 are implemented and verified. Application v.0.20 / marketing v.0.44 are served from main commit `70fabd06f695f03477203a3fc86291f06e3e2f7c`; public code/hash/health, runtime/role restrictions and isolated rollback cycle pass. All three CI jobs passed (1099 backend, 753 frontend, 14 release checks plus Compose/type/version/build). Evidence is in `docs/validation/2026-11-22/` and each verification.md.

User technical/screenshot acceptance and subsequent “İncelemeyi tamamladım ve kabul ediyorum” statement are recorded. No assistant-performed independent legal audit or model calibration is claimed; no extra legal-review publication gate is invented. The tested tree is accessible from the 12th product tab and actual application route, with uncomputed probabilities labelled explicitly.

No automatic deployment trigger/frequency was selected; current publication is manual through the restricted entrypoint. Root/izzet emergency administration remains. Final evidence-only changes do not require an application rebuild.
