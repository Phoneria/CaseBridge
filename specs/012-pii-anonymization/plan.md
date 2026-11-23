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

## File-input plan
POST /privacy/extract-text consumes a bounded raw body, not multipart (no temporary upload spooling); session-scoped bureau access is identical to /anonymize. A dedicated in-memory extraction service uses existing pypdf plus bounded DOCX ZIP/XML readers including tables/headers/footnotes, and strict printable Unicode text detection (UTF-8/BOM UTF-16). No stored-document access, filename field, external/OCR/model call or required dependency is added. Reject limits, encryption and parse failures with fixed messages; suppress pypdf logs only in extraction context. Return {text, format, warnings} and no-store. UI uploads a Blob with explicit content type through the existing transport; respect explicit headers. One revision counter invalidates source/result for all async operations.
Validation: real synthetic PDF/DOCX/TXT round trips through extraction then masking; binary/scanned/encrypted/corrupt/oversized/expanded ZIP/Unicode cases; auth and no-storage/log assertions; frontend race/error/reset/file transport tests; production desktop/mobile browser flows with actual local endpoint and synthetic auth. Prepare next version, merge tested source, stage/activate/verify immutable main artifact, public code/version/health and protected rollback evidence.

PDF/DOCX parsing is run through a 15-second local subprocess with sanitized environment and pipes only (no files). Linux production additionally bounds address space to 512 MiB and CPU to 10 seconds. Child stderr is discarded; fixed errors are returned. This prevents compressed/malformed documents from exhausting the shared application process, without globally patching parser functions.
