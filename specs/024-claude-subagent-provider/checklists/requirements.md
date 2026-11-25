# Requirements checklist
- [x] Personal use only, per Anthropic's documented terms; no per-firm token; site cat excluded (FR-001, FR-003).
- [x] Token encrypted with the existing mechanism; never returned, logged, audited or stored in the browser (FR-002).
- [x] Firm isolation unchanged: tools use the requesting user's firm (FR-005).
- [x] Sandbox and environment scrub (FR-004).
- [x] Every requirement has an automated acceptance test; the SDK is mocked in CI.
