# Research
- Platform admins previously could create only `UserRole.ADMIN` users (`_new_admin`); firm admins invite lawyers via `/admin/users` → `create_pending_user`, which already enforces e-mail uniqueness and the seat limit, so the platform path reuses it.
- Case-scoped client/expert users are stored as `UserRole.LAWYER` with a `WorkspaceAccess` row whose `position` is not `lawyer`; they are excluded from the platform's lawyer list and resend.
