# Feature Specification: Case-text personal data anonymization

## User Scenarios
Personal data in case files must be anonymized so that the identity of the people involved cannot be determined from the text. The result is verified on a fictional sample file that contains only invented personal data (GitHub issue #34).

### Functional Requirements
- **FR-001**: Replace known identities (parties, lawyers, organizations, with Turkish suffixed and upper-case forms) and rule-detectable data (T.C. kimlik no with checksum, phone, e-mail, IBAN, plate, address, birth date) with consistent placeholders; the same person always receives the same placeholder.
- **FR-002**: Verify after replacement that no known identity or valid T.C. kimlik number remains in the output (leak check); the original-to-placeholder map is kept only in memory and never logged.
- **FR-003**: Detect person names that are not registered in the case with a local (offline) Turkish NER model when available; mask persons; places and organizations are only flagged (`işaretle`) by default. ALL-CAPS words are case-folded before the model runs (offsets preserved) so names such as "MEHMET YILMAZ" are found without document-specific rules. When the model is unavailable, fall back silently to the rule layer.
- **FR-004**: When `ANONYMIZE_LLM_INPUT` is enabled, mask the prompt sent to external LLM providers (qwen, openai, anthropic; never local Ollama) and restore placeholders in the response. The setting is off by default.
- **FR-005**: Which categories are masked is configurable in `backend/app/privacy/policy.json` (`maskele` replaces, `işaretle` keeps the text but reports it, `kapalı` skips); cities are flagged by default. Each run produces a report (category, count, distinct values, labels) that never contains the original values.
- **FR-006**: Person-name heuristics complement the NER model (`kisi_sezgisel`: `her_zaman` default, `yedek` only when no detector is available, `kapalı`): upper-case names and labelled lines (HAKİM/KATİP), role words (Davalı, Av.) are not part of a name, court names are not addresses, and a detected name is also masked where only its first or last name appears.

## Success Criteria
Every fictional value in `backend/tests/fixtures/ornek_dava_kurgusal.txt` is absent from the anonymized output while the legal text stays readable. Known limits: indirect identifiers are not detected and the NER layer is probabilistic.

## Interactive masking screen — authorized 23 November 2026
- **FR-007**: Bureau administrators and unrestricted lawyers can open Anonimleştirme from the existing sidebar and paste up to 30,000 characters, mask locally on the application server, inspect category counts and copy the result. Reject anonymous, platform and restricted accounts. No client bureau/case ID or stored document is accepted. Never persist input, output or mapping, and return no mapping or original values in metadata. Invalid input returns generic errors without echoing input. Clear stale results when input changes; clear resets all text.
- **FR-008**: Show detection limitations and NER availability. No external AI/provider call or automatic LLM masking setting changes. Use regex and heuristics plus an already loaded local NER if available; do not download models on this endpoint. Output requires human review and leaves flagged places/organizations unchanged under current policy. Return Cache-Control: no-store.
