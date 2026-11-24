# Behavior
- `POST /platform/firms/{id}/admins` `{role:"lawyer"}` → 201 `admin.role == "lawyer"`, pending, invite e-mail sent (not for a suspended firm); no `role` → admin; unknown role → 422.
- `GET /platform/firms` → `admins` (admins only) and `lawyers` (lawyers without scoped access).
- Resend → 200 for a pending admin/lawyer; 404 for scoped users or other firms; 409 unchanged.
