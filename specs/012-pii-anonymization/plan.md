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
