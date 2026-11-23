# Data model
## FeatureContract
No table or column changes. Response `SimilarPrecedentOut`: precedent_id, case_number, case_name, case_type, court (str|null), outcome, decision_date (date|null), score (0–100), text_score (0–100), linked_to_case (bool), explanation {shared_terms: list[str] (≤8), shared_statutes: list[str], matching_fields: list[str], passages: list[{case_label, case_text, case_highlights: [{start, end}], precedent_label, precedent_text, precedent_highlights: [{start, end}]}] (≤3)}. Query: limit 1–20, default 5.
