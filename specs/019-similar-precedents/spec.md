# Benzer Davalar sidebar: similar precedents, stages 1 and 2 (application v.0.49)

User request (24 Nov 2026): a "Benzer Davalar" sidebar on the case page that ranks the bureau's own precedents against the open case and explains, only from stored data, why each one is similar. Stage 1 is the backend similarity engine; stage 2 is the sidebar. Builds on specs/018-similar-cases (same normalisation and court types); no AI call, no new infrastructure.

## User Scenarios
1. A lawyer opens a case, clicks "Benzer Davalar" and sees the closest precedents of their bureau with a 0–100 score, category, court, result and decision date.
2. For each precedent the lawyer sees the matching structured fields and shared statute or Yargıtay references, and can expand "Neden benzer?" to read the shared key terms and 1–3 passage pairs (this case ↔ precedent) with the shared words highlighted.
3. A user who may edit the case links or unlinks a precedent from the sidebar; anyone can open the precedent.
4. Another bureau's precedents never appear and no explanation contains text that is not stored for the case or the precedent.

### Functional Requirements
- **FR-001**: Candidates are only the session bureau's precedents (`is_precedent`, filtered by `law_firm_id`); ordinary cases are never returned. Document text is read with the same bureau filter.
- **FR-002**: `GET /cases/{id}/similar-precedents?limit=5` (1–20). Access follows the existing read rules: another bureau's case, a precedent id or an unknown id is 404, restricted workspace accounts 403, anonymous 401. Every result opens through `GET /precedents/{id}` for the caller.
- **FR-003**: Turkish-aware normalisation: dotted/dotless I lower-casing, folding, punctuation removal, a small stopword list, simple suffix trimming (at most two suffixes, 4+ letter stem, a one-letter suffix only as the last one).
- **FR-004**: A case's text is case_name, claim, facts_summary, plaintiff_position, defendant_position, description, closing_note and up to 8000 characters of extracted document text.
- **FR-005**: Score 0–100 = 0.6 TF-IDF cosine (pure Python) + 0.2 same case_type + 0.1 court (same court or court type 1.0, same family 0.5) + 0.1 share of the source's statute references found in the precedent. A signal the source cannot provide (no court, no reference, no text) leaves the denominator. A precedent needs cosine ≥ 0.05 or the same category.
- **FR-006**: Statute references are extracted by regular expressions: "TBK 49", "İİK m. 67", "HMK md. 107", "TBK'nın 344. maddesi", "4857 sayılı … Kanunu'nun 18. maddesi" and "Yargıtay <daire> <yıl>/<no> E. <yıl>/<no> K." in either order; a Yargıtay reference without K. matches the same docket with K.
- **FR-007**: Each result returns precedent_id, case_number, case_name, case_type, court, outcome, decision_date, score, text_score, linked_to_case and an explanation: up to 8 shared key terms, shared statute references, matching structured fields (category, court, close case value) and 1–3 passage pairs with source labels and highlight offsets.
- **FR-008**: Anti-hallucination: every explanation string is copied from the stored case, precedent or document text; highlights mark only words both sentences share. No LLM is called (keeps the rule of `backend/app/ai/agents/common.py`).
- **FR-009**: The precedent corpus is cached in memory per bureau; the key includes the bureau's precedent count and latest `updated_at` and its precedent documents' count and latest upload, so a changed precedent or a new document rebuilds it.
- **FR-010**: The case overview has a "Benzer Davalar" button that opens a right-hand sidebar (dialog, Escape and close button, focus returns) listing up to 8 precedents with score, badges, matching fields and statutes, an expandable "Neden benzer?" with terms and highlighted passage pairs, "Emsali aç" (`/emsaller?karar=<id>`), and for users who may edit the case "Bu davaya bağla" / "Bağlantıyı kaldır". Loading, empty and error states; a note that explanations come only from stored data. All UI text is Turkish and uses existing theme tokens. Application version v.0.49.

## Success Criteria
Backend `tests/api/test_similar_precedents.py` and the full backend suite pass on SQLite; tsc and the full Vitest suite pass, including the sidebar and case-detail tests; check-specs and check-spec-changes pass.
