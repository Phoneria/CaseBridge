# Feature Specification: Case-text personal data anonymization

## User Scenarios
Personal data in case files must be anonymized so that the identity of the people involved cannot be determined from the text. The result is verified on a fictional sample file that contains only invented personal data (GitHub issue #34).

### Functional Requirements
- **FR-001**: Replace known identities (parties, lawyers, organizations, with Turkish suffixed and upper-case forms) and rule-detectable data (T.C. kimlik no with checksum, phone, e-mail, IBAN, plate, address, birth date) with consistent placeholders; the same person always receives the same placeholder.
- **FR-002**: Verify after replacement that no known identity or valid T.C. kimlik number remains in the output (leak check); the original-to-placeholder map is kept only in memory and never logged.
- **FR-003**: Detect person names that are not registered in the case with a local (offline) Turkish NER model when available; mask persons only, keep court and place names. When the model is unavailable, fall back silently to the rule layer.
- **FR-004**: When `ANONYMIZE_LLM_INPUT` is enabled, mask the prompt sent to external LLM providers (qwen, openai, anthropic; never local Ollama) and restore placeholders in the response. The setting is off by default.
- **FR-005**: Which categories are masked is configurable in `backend/app/privacy/policy.json` (`maskele` replaces, `işaretle` keeps the text but reports it, `kapalı` skips); cities are flagged by default. Each run produces a report (category, count, distinct values, labels) that never contains the original values.
- **FR-006**: Person-name heuristics complement the NER model: upper-case names and labelled lines (HAKİM/KATİP), role words (Davalı, Av.) are not part of a name, court names are not addresses, and a detected name is also masked where only its first or last name appears.

## Success Criteria
Every fictional value in `backend/tests/fixtures/ornek_dava_kurgusal.txt` is absent from the anonymized output while the legal text stays readable. Known limits: indirect identifiers are not detected and the NER layer is probabilistic.
