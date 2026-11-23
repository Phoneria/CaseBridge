# Tasks: Müvekkiller

- [x] T001 Read approved design, constitution and existing case/party model; record scope and exclusions (merge, global search, client documents/notes).
- [x] T002 Implement data-model.md#featurecontract Client model, CaseParty.client_id, client_name_key and migration c8f2a4e6b0d1 with merge revisions eeb771ad79be and 0244bf696c5e (FR-001–FR-003).
- [x] T003 Implement FR-001 through FR-012 in backend: /clients routes/schemas/service, case party linking rules and client_id filter, precedent exclusion, seed/import/demo cleanup, id-only logging.
- [x] T004 Implement frontend: types/api, Müvekkiller sidebar item, ClientListView, ClientDetailView, ClientFormModal, ClientPicker, PartiesFields/caseIntake rules, NewCaseView ?muvekkil= prefill, CasePartiesCard links.
- [x] T005 Verify backend unit/API/migration tests including cross-firm 404/422, admin-only delete, 409 rule, rename propagation and offline SQL generation.
- [x] T006 Verify frontend tests (list, detail, picker keyboard/errors, form validation, payload, prefill) and TypeScript; increment application version (v.0.48 after main v.0.47).
- [ ] T007 Run E2E 19-clients and updated 01-case-lifecycle flows against a synthetic backend; record results.
- [ ] T008 Back up the pilot database, stage pinned main through the restricted release path, canary/rollback, verify public version/code/health and record results.

Dependencies: T001 → T002 → T003/T004 → T005/T006 → T007 → T008.
