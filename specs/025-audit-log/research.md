# Research
- main already has `ManagementAudit` (`management_service.audit`): a firm-facing history with before/after values and a reason, shown to bureau administrators. It holds content by design, so process analytics use a separate metadata-only table instead of extending it.
- Writing the audit row after the route's commit, in its own commit, keeps a failed audit write from undoing the user's action; the cost is that a crash between the two commits can leave an action unrecorded.
- `case_id` has no foreign key so a case's history survives its deletion; `actor_user_id` keeps one, so demo cleanup deletes the demo users' rows first.
