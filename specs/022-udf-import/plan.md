# Plan
- Backend: new `app/services/udf_reader.py` (`read_udf_text`, `is_udf`, `UdfReadError`, `INVALID_UDF`, `UDF_LIMIT`; streaming XMLParser target with DOCTYPE/depth guards and a codec fallback for encoding names expat does not know). `text_extraction.extract_text` gains the UDF branch; `DocumentType.UDF`; `document_service` maps `.udf` and owns one `MEDIA_TYPES`/`media_type_for` used by `documents.py` and `bureau.py`; `import_cases` accepts `.udf`; `privacy/files.extract_document` detects UDF before the DOCX path; `case_intake_service` returns `source_text`.
- Migrations: `e2b4d6f8a1c3_document_type_udf.py` and merge `f3a5c7e9b1d2_merge_udf_and_chat_sources_heads.py`.
- Frontend: `DOCUMENT_EXTENSIONS` adds `.udf` and feeds every picker; copy, `file_type`/privacy `format` unions and the documents filter; `IntakeFillBox` keeps the read text per fill and renders a `<details>` section.
- Tests: `backend/tests/udf_samples.py` builds synthetic UDFs (format 1.8 shape); unit, API, privacy-worker, CLI and migration tests; Vitest for pickers, filter, privacy view and the read-text section; `scripts/tests/test_udf_import.py` checks the version manifest.
- No new dependency or service.
