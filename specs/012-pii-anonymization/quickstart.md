# Validation guide

Run `python3 scripts/check-specs.py` and `python3 scripts/check-spec-changes.py --base <sha> --head <sha> --run`. Targeted tests: `pytest backend/tests/unit/test_anonymizer.py`. To enable masking of external LLM prompts set `ANONYMIZE_LLM_INPUT=true` (and optionally `ANONYMIZE_USE_NER=false`).
