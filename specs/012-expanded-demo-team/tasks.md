# Tasks
## Phase 1 Setup
- [x] T001 Specify FR-001 through FR-005 in specs/012-expanded-demo-team/spec.md and source research.md.
- [x] T002 Model contracts in specs/012-expanded-demo-team/data-model.md#featurecontract and contracts/behavior.md.
## Phase 2 US1/US2
- [x] T003 [US1] Implement backend/app/db/demo_team.py and demo_template.py per data-model.md DemoMember.id, DemoMember.scope, Distribution.marker (FR-001, FR-003).
- [x] T004 [US2] Enforce bounded output/assignment in backend/app/api/routes/admin.py and schemas/user.py per data-model.md AdminLawyer.demo_case_ids (FR-002).
- [x] T005 [US1] Adapt frontend/src/components/AdminView.tsx, SettingsView.tsx and types/index.ts to scoped options and readable chart (FR-004).
## Phase 3 Verification
- [x] T006 [US2] Verify isolation/repeat/legacy/real-data preservation in backend/tests/integration/test_demo_template.py (FR-001 through FR-003).
- [x] T007 [US1] Verify frontend tests, browser and build, record specs/012-expanded-demo-team/verification.md (FR-004, FR-005).
- [x] T008 Record frontend/app-version.json, todo.md, specs/changes/expanded-demo-team.json and separate PR/Projects In Review (FR-005).
Dependencies T001→T002→T003→T004→T005→T006→T007→T008. No delegation.

## Phase 4 Removal refinement
- [x] T009 [US2] Implement exact tenant-bounded removal planning/deletion in backend/app/db/demo_template_removal.py and admin.py per data-model.md RemovalPreview.token, RemovalPreview.counts, RemoveRequest.token, RemoveRequest.confirm (FR-006, FR-007).
- [x] T010 [US1] Add preview/cancel/confirm/busy/error/retry controls in frontend/src/components/SettingsView.tsx and lib/api.ts (FR-006).
- [ ] T011 Verify removal/isolation/stale-confirm/rollback/reload and UI confirmation with backend/tests/integration/test_demo_template_removal.py, SettingsView.test.tsx and browser; record verification.md and update review PR (FR-006, FR-007).
