# Research
- Stage 1 (spec 018) already ranks all bureau cases with prefix stems; the sidebar needs precedents only, document text, statute references and passage-level evidence, so a separate service reuses its normalisation primitives instead of changing its scoring.
- Prefix-5 stems merge unrelated words in short legal texts; suffix trimming keeps "kira"/"kiracı" apart while merging "bedel/bedeli/bedelinin". Two passes with a one-letter suffix allowed only as the last suffix make "tahliye/tahliyesi/tahliyenin" agree.
- scikit-learn is not in requirements.txt, so TF-IDF stays pure Python (as in stage 1).
- `turkish_lower` keeps string length for NFC text, so highlight offsets computed on the lowered text index the original; inputs are NFC-normalised and a per-character fallback keeps offsets exact otherwise.
- LLM-written explanations were not added: the request's anti-hallucination rule is met by construction with extractive output.
