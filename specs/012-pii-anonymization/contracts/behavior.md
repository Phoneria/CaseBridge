# Behavior contract

anonymize(text, entities, extra_detectors) returns text with placeholders, counts, a leak list and an in-memory map; restore(text) maps placeholders back. With ANONYMIZE_LLM_INPUT=true the prompt passed to qwen/openai/anthropic providers is anonymized and the response restored; otherwise prompts are unchanged. No HTTP or UI contract changes.

## Interactive HTTP contract
POST /privacy/anonymize accepts {text: string}, 1–30000 nonblank characters, no other fields. Requires active unrestricted bureau account. Returns {text, counts, report, ner_available, review_required: true}; no mapping, original metadata or persistence. 401 unauthenticated; 403 platform/restricted; 422 generic invalid content; Cache-Control no-store. This endpoint does not enable ANONYMIZE_LLM_INPUT or access stored bureau data.
