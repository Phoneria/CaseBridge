# Data model
## FeatureContract
No table or column changes. Response `SimilarCaseOut`: case_id, case_number, case_name, case_type, status, outcome, decision_date, duration_days (int|null), duration_ongoing (bool), assigned_lawyer_name (str|null), is_precedent, score (0–100), reasons (list[str]). Request `SimilarCaseSearch`: text (1–20000 chars after trimming), case_type (optional CaseType), limit (1–20, default 5).
