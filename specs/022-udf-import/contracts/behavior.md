# Behavior
- `.udf` upload → 201 `file_type: "udf"`, text extracted (or null when unreadable); download → original bytes, `application/octet-stream`, `.udf` name (case documents and workspace routes).
- `/case-intake/extract` with a `.udf` → 200 with `source_text` = model input; unreadable → 422 "Bu belgeden metin çıkarılamadı (taranmış olabilir). Metni yapıştırabilirsiniz."
- `/privacy/extract-text` with a UDF → 200 `format: "udf"` + fixed warning; ODT → 422 generic message; text-less UDF → 422 OCR message; malformed or hostile UDF → 422 `INVALID_UDF` or `UDF_LIMIT`, never document text.
- "Belgeden doldur" shows "Belgeden okunan metin (<file>)" closed after a file fill; never for pasted text.
