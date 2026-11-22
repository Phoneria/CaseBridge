# Behavior contract

anonymize(text, entities, extra_detectors) returns text with placeholders, counts, a leak list and an in-memory map; restore(text) maps placeholders back. With ANONYMIZE_LLM_INPUT=true the prompt passed to qwen/openai/anthropic providers is anonymized and the response restored; otherwise prompts are unchanged. No HTTP or UI contract changes.
