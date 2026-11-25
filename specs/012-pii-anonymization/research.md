# Research

## Decision — layered approach
Known identities and checksummed/pattern data are deterministic and cover most risk; a local NER covers unregistered names probabilistically. An external LLM was rejected for detection because it would send the personal data being protected.

## Decision — persons only for NER
Court and place names are needed for legal analysis, so only PER entities are masked.

## Decision — opt-in wrapper
Masking every LLM call adds latency (CPU NER) and changes outputs, so it is controlled by ANONYMIZE_LLM_INPUT, default off. Local Ollama is excluded because data stays on the host.

## Alternatives
Rejected: cloud NER/LLM detection, persisting the placeholder map, masking dates and courts wholesale.

## Limits
Indirect identifiers are not detected; NER is probabilistic; streaming chat, uploads and indexing are not wired yet.
