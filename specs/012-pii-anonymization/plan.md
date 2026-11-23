# Implementation Plan: Case-text personal data anonymization

## Summary
Add a local, offline anonymizer for case text (issue #34): known identities and rule-detectable data are replaced with consistent placeholders, an optional local Turkish NER finds unregistered person names, and an opt-in wrapper masks prompts sent to external LLM providers.

## Technical Context
Python 3.11 / FastAPI backend. Pure-Python core (regex, checksum) with no new required dependency. NER (BERTurk via transformers/torch) is optional and loaded lazily; absence falls back silently. No network call is made by the anonymizer.

## Constitution Check
PASS: personal data never leaves the process unmasked when the setting is on; the placeholder map lives only in memory; default behavior of the product is unchanged (setting is off by default).

## Research and Design
See research.md. Layers: known identities, rules, NER, leak check. Placeholders are consistent per person so the narrative stays readable.

## Project Structure
backend/app/privacy/{anonymizer,ner}.py; backend/app/ai/provider_factory.py (wrapper); backend/app/core/config.py (settings); backend/tests/unit/test_anonymizer.py; backend/tests/fixtures/ornek_dava_kurgusal.txt.

## Validation and Release
Targeted tests on the fictional fixture; spec acceptance binding in specs/changes/pii-anonymization.json. No UI change, so no VPS release is needed.

## Interactive screen plan
Extend the existing motor with an authenticated stateless POST /privacy/anonymize (30k characters, generic validation). Explicit response model excludes mapping and spans; counts/report contain category summaries only. Bureau session dependencies enforce existing restrictions; reject platform accounts. Use only an already loaded NER pipeline to prevent network/model downloads. Next.js /ai/anonimlestirme uses the shared authenticated API helper, in-memory state, reset and copy controls, stale-response protection and existing AppShell. Preserve the requested sidebar entry (explicit user request supersedes header-only principle for this bounded addition).
Validation: synthetic endpoint authorization/validation/redaction tests; UI success/error/reset/stale-result tests; existing sidebar/navigation suites, typecheck/build, spec gates. Release through pinned main artifact, no schema or credential changes; verify public code/version/health.
