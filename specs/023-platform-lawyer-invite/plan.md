# Plan
- Backend: `schemas/platform.py` (`PlatformAdminCreate.role`, `PlatformAdminOut.role`, `PlatformFirmOut.lawyers`); `services/platform_service.py` (`firm_lawyers`, scoped-user exclusion via `WorkspaceAccess`, `add_firm_admin(role)`, `get_firm_admin` accepts admins and lawyers); `api/routes/platform.py` passes the role, audits `lawyer.invited`.
- Frontend: `types` (`role?`, `lawyers?`, payload `role?`), `FirmFormModal` Rol select, `FirmDetailModal` member lists, `PlatformView` notices/search/filter, `AuditPanel` label; e2e search label.
- No migration, no new dependency. Firm-admin invite flow (`/admin/users`) untouched.
