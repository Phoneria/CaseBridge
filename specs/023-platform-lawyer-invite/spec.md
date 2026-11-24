# Platform panel: invite a firm's lawyers as well as its admins (application v.0.54, unreleased)

User request (24 Nov 2026): in the platform panel the platform admin can only invite a firm's administrators; the platform admin must also be able to invite a user with the lawyer role. Today only the firm's own administrator invites lawyers; the platform admin should be able to do it too. The firm administrator's existing invite flow is unchanged.

## User Scenarios
1. A platform admin opens "Kaya Hukuk", presses "Kullanıcı davet et", chooses Rol "Avukat", enters name and e-mail and presses "Davet gönder". The lawyer receives the same invite e-mail a firm admin's invite sends, appears under "Avukatlar" as "Davet bekliyor", and the notice says "Avukat eklendi, davet gönderildi."
2. The same dialog with Rol "Yönetici" (the default) invites an admin exactly as before.
3. A pending lawyer's invite can be re-sent from the firm detail, like a pending admin's.
4. In a suspended firm the lawyer is created but no e-mail goes out; the notice says to send it after activation.
5. Case-scoped client/expert users of the firm are never listed in the platform panel and their invites cannot be re-sent from it.

### Functional Requirements
- **FR-001**: `POST /platform/firms/{firm_id}/admins` accepts an optional `role` (`admin` | `lawyer`, default `admin`; other values 422). It creates a pending user of that role through the same `create_pending_user` path as before (e-mail uniqueness, seat limit, suspended-firm rule unchanged) and records `admin.invited` or `lawyer.invited` in the firm's management history; the INFO log line keeps ids only (`yönetici_eklendi` / `avukat_eklendi`).
- **FR-002**: `PlatformAdminOut` gains `role`. `GET /platform/firms` adds `lawyers`: the firm's lawyer-role users without a case-scoped (non-lawyer) workspace access grant, sorted by name. `admins` keeps admins only.
- **FR-003**: `POST /platform/firms/{firm_id}/admins/{user_id}/invite` re-sends for a pending admin or lawyer of that firm; a scoped client/expert user or another firm's user is 404; the existing 409 rules (suspended firm, password already set, inactive) are unchanged.
- **FR-004**: Platform firm detail: "Kullanıcı davet et" opens a form with a Rol select (Yönetici default, Avukat), "Davet gönder"; the detail lists "Yöneticiler" and "Avukatlar" (or "Henüz avukat yok.") each with "Daveti yeniden gönder" for pending members; notices name the role; search and the pending filter include lawyers. The firm history labels `lawyer.invited` "Avukat davet edildi".
- **FR-005**: Application version: `frontend/app-version.json` regenerated with `frontend/scripts/update-version.mjs` (v.0.54), never hand-edited.

## Success Criteria
- Backend API tests prove lawyer invite + e-mail + listing + resend, the admin default and 422 for an unknown role, scoped users excluded and 404, and the `lawyer.invited` history record.
- Vitest proves the role select, the request payload, the Avukatlar list, the role-named notices and the resend button for a lawyer.
