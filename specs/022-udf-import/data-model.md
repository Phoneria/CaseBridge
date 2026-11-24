# Data model
## FeatureContract
`documents.file_type` (`documenttype` enum) gains the value `udf`; no other table or column changes. Stored file bytes are unchanged; `extracted_text` holds the normalized UDF text or null.

`POST /case-intake/extract` response: `{draft, truncated, source_chars, source_text}` — `source_text` is the exact model input (≤ `case_intake_max_chars`).

`POST /privacy/extract-text` response `format`: `pdf | docx | udf | text`; for `udf` the warnings are `["UDF içindeki tablolar düz metin olarak alındı; görseller ve biçimlendirme okunmadı."]`.

Reader errors: `INVALID_UDF` = "Bu dosya geçerli bir UDF değil. Belgeyi UYAP'tan yeniden indirip yükleyin."; `UDF_LIMIT` = "UDF açılmış içerik sınırını aşıyor (16 MB / 512 öğe); belge işlenmedi."

Frontend: `DocumentItem.file_type` adds `"udf"`; `CaseIntakeResult.source_text: string`; `ExtractedPrivacyText.format` adds `"udf"`. No browser storage.
