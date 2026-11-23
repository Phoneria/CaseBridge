# Tasks: Ekip rolleri
## Setup
- [x] T001 Read constitution, todo.md and specs/011-team-roles/spec.md; inspect PDF outside repo and actual runtime team surfaces.
## Foundation
- [x] T002 Validate specs/011-team-roles/data-model.md#featurecontract; compare spec/plan/tasks and requirements checklist.
## US1
- [x] T003 [US1] Implement FR-001 through FR-004 in web-page/index.html and web-page/website-version.json, citing TeamMember.name, TeamMember.role and TeamMember.bio from data-model.md#featurecontract; preserve unrelated members and omit private CV material.
- [x] T004 [US1] Run meaningful roles/member/privacy acceptance in scripts/tests/test_team_roles.py and existing marketing checks; record specs/011-team-roles/verification.md.
## US2
- [x] T005 [US2] Inspect local/public JS on/off 1440/390/320, accessibility and normal URLs; record specs/011-team-roles/verification.md.
## Release
- [x] T006 Protected PR/main/timer marketing-only publication; verify public source/version/health and record specs/011-team-roles/verification.md and todo.md.

Dependencies: T001 → T002 → T003 → T004 → T005(local) → T006 → T005(public). No shared-source parallel work.

## Approved portrait follow-up
- [x] T007 [US1] Implement FR-005 using TeamMember.portrait from data-model.md#featurecontract in assets/team/emin-merden-web.jpg and index.html; preserve every card text and other members, bump only marketing version.
- [x] T008 [US2] Verify portrait source/hash/alt/decode and existing team roles contract, local desktop/mobile crop and JS-disabled image; record verification.md.
- [x] T009 Protected main marketing timer release; verify normal public portrait file/hash, desktop/mobile crop, version and health, record verification.md and todo.md.
Dependencies: T007 → T008 → T009. Prior T001–T006 evidence is historical and remains valid.
- [x] T010 FR-010 label change on team cards; test_team_roles updated (v.0.65).
