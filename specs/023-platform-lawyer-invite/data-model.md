# Data model
## FeatureContract
No table or column changes. `POST /platform/firms/{id}/admins` body: `{full_name, email, role?: "admin" | "lawyer"}` (default `admin`). `PlatformAdminOut`: `{id, full_name, email, role, status, invited_at}`. `PlatformFirmOut` adds `lawyers: PlatformAdminOut[]`. Management audit action `lawyer.invited` (entity_type `platform_admin`, entity_id = user id). Frontend: `PlatformAdmin.role?`, `PlatformFirm.lawyers?`, `PlatformAdminPayload.role?`. No browser storage.
