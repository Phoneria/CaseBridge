# Tasks: Case-text personal data anonymization

- [x] T001 Read issue #34, constitution and existing provider boundary; complete quality checklist.
- [x] T002 Implement data-model.md#featurecontract Entity/Result and placeholder consistency in anonymizer.py.
- [x] T003 Implement FR-001 through FR-004 across anonymizer.py, ner.py, provider_factory.py and config.py.
- [x] T004 Create the fictional sample file and verify every fictional value is absent from the output.
- [x] T005 Verify leak check, reversible placeholders, wrapper on/off behavior and NER fallback.
- [x] T006 Bind the behavior diff to requirements and named acceptance tests in specs/changes/pii-anonymization.json.
- [ ] T007 Manual review of the PR, then merge; wiring into upload/indexing and UI notice are follow-up work.

Dependencies: T001 → T002/T003 → T004/T005 → T006 → T007. No claim of guaranteed de-identification is made.
