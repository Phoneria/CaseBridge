# Verification

## Scope and acceptance
Issue #34: personal data in case files is anonymized so identities cannot be determined from the text; verified on a fictional sample only.

## Actual local checks
- backend/tests/unit/test_anonymizer.py: all fictional values removed, consistent placeholders, leak check, restore, wrapper on/off, NER fallback; NER test with the real BERTurk model passed locally.
- Spec acceptance binding (check-spec-changes.py --run) passed locally.
- Not verified: behavior on real case files, upload/indexing wiring, external-provider round trip with a real key.

## Release
Not deployed by this change (no UI change; setting off by default).
