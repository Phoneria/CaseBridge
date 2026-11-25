# Requirements checklist
- [x] Bureau isolation and the REST read rules are stated per tool (FR-005, FR-006).
- [x] Read-only: no tool writes data; the only write is the audit row (FR-010).
- [x] Untrusted document text cannot trigger tool calls (FR-008).
- [x] Per-firm AI credentials only, no platform-key fallback (FR-011).
- [x] One additive nullable column, no new dependency or service; browser storage holds no secrets (data-model).
- [x] Answers written from bureau records do not enter the training export by default (FR-014).
- [x] Every requirement has an automated acceptance test.
