# Requirements checklist
- [x] Separate from the in-app AI: no login, database, tools or bureau data (FR-002).
- [x] Platform key only, cheap model by setting; mock is deterministic (FR-005).
- [x] No invented facts: knowledge built from site/docs, unknowns marked TODO for the owner (FR-001, FR-003).
- [x] Abuse limits, daily budget, CORS and optional Turnstile (FR-006 to FR-008).
- [x] No stored conversations; logs hold labels and counts only (FR-009).
- [x] Every requirement has an automated acceptance test.
