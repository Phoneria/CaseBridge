# Data model
## FeatureContract
- DemoMember.id: deterministic UUID from firm id and roster key; 12 unique fixed slots; not inferred from name/email.
- DemoMember.scope: WorkspaceAccess lawyer position with only current firm's marked known sample case IDs. Never create a full-access member.
- AdminLawyer.demo_case_ids: nullable list[str]; null for existing eligible ordinary lawyer, explicit case ID allowlist for sample roster; only server-validated scope returned.
- Distribution.marker: deterministic tenant-bound ManagementAudit id, written once with initial redistribution; no second automatic assignment on repeat.
No migration. Existing User, WorkspaceAccess, Case and ManagementAudit tables reused. No shared password, invitation or access token created.
