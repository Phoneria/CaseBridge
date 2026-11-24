# Requirements checklist
- [x] Bureau isolation and the REST read rules are stated per tool (FR-005, FR-006).
- [x] Read-only: no tool writes data; the only write is the audit row (FR-010).
- [x] Untrusted document text cannot trigger tool calls (FR-008).
- [x] Per-firm AI credentials only, no platform-key fallback (FR-011).
- [x] No migration, no new dependency or service; browser storage holds no secrets (data-model).
- [x] Every requirement has an automated acceptance test.
