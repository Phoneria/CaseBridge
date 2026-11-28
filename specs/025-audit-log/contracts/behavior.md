# Behavior
- A successful audited write → exactly one `audit_events` row (two for a case update that also changes parties); a failed or no-op write → none.
- Values outside the allow-lists → `AuditDetailError`; a database error on the audit write → logged, the action stays committed.
- `GET /platform/audit-events.csv` and `GET /platform/firms/{id}/audit-events` → platform admins only (401/403 otherwise), 404 for unknown firms, 422 for a reversed or longer-than-366-day range or an unknown action.
