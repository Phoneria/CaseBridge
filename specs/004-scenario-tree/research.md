# Research: S05 Dosyaya özgü olasılık ağacı

- Decision: GET scoped tree derived from Case + explicitly firm-scoped CaseEvent/Document + latest completed SIMULATION_REPORT. No provider call or migration. Stored scenarios remain verbatim; no index-based causal pairing. Fallback conditional preparation paths are labelled, not predictions. Hash used content including document text for refresh detection.
- Rationale: meets approved scope while preserving existing data/roles and release evidence.
- Alternatives: wholesale redesign, fabricated UI/probabilities, mutable server checkout and credential changes rejected as outside scope or unsafe.
- Evidence: main fdf7333 and Emin 134e881; official Spec Kit 1.4.3. Release permissions and tree reuse additionally reviewed by read-only research agents.
- Unresolved blocking questions: none for non-destructive implementation; removing existing administrator access remains excluded pending explicit approval.
