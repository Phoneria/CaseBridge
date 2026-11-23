# Tasks: Case-text personal data anonymization

- [x] T001 Read issue #34, constitution and existing provider boundary; complete quality checklist.
- [x] T002 Implement data-model.md#featurecontract Entity/Result and placeholder consistency in anonymizer.py.
- [x] T003 Implement FR-001 through FR-004 across anonymizer.py, ner.py, provider_factory.py and config.py.
- [x] T004 Create the fictional sample file and verify every fictional value is absent from the output.
- [x] T005 Verify leak check, reversible placeholders, wrapper on/off behavior and NER fallback.
- [x] T006 Bind the behavior diff to requirements and named acceptance tests in specs/changes/pii-anonymization.json.
- [ ] T007 Manual review of the PR, then merge; wiring into upload/indexing and UI notice are follow-up work.

Dependencies: T001 → T002/T003 → T004/T005 → T006 → T007. No claim of guaranteed de-identification is made.

## Interactive screen tasks
- [x] T008 Implement stateless authenticated masking endpoint and authorization/validation tests (FR-007/008).
- [x] T009 Add sidebar route and accessible paste/mask/copy/reset screen with stale-result protection and tests (FR-007/008).
- [x] T010 Run tests/build/spec checks, prepare version, record actual results.
- [x] T011 Merge tested code to main and publish immutable application artifact; verify public version/code/health and rollback record.
Dependencies: T008 → T009 → T010 → T011.

## File-input tasks
- [x] T012 Implement bounded local extraction endpoint/service and meaningful format/auth/privacy/limit tests (FR-009/010).
- [x] T013 Add unrestricted file chooser, upload transport and stale-result/reset/error handling with tests (FR-011).
- [x] T014 Verify real synthetic PDF/TXT/DOCX and other text file browser flows, run tests/build/spec checks, prepare version and record results.
- [x] T015 Merge/publish the immutable main application artifact; verify public code/version/health, protected credentials and rollback source; record evidence.
Dependencies: T012 → T013 → T014 → T015.
