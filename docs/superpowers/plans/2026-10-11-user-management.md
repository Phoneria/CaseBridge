# Kullanıcı Yönetimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a real law firm start using CaseBridge: an administrator is created from the command line, administrators invite, edit, deactivate (with a hand-over of the work) and re-activate users, users set and reset their own passwords from e-mailed one-time links, change their profile and password, and sign out.

**Architecture:** Backend: `users` gains `password_set_at` / `invited_at` (a user without a password is "pending"), a new `user_tokens` table holds hashed one-time invite/reset tokens, and the JWT carries a `pwd` claim that must equal the user's current `password_set_at` so a password change ends every older session. New services (`user_token_service`, `password_policy`, `account_service`, `user_admin_service`, `user_lifecycle_service`) sit behind `/auth/*`, `/admin/users/*` and `PATCH /users/me`; the e-mail layer gains a `file` backend that writes `.eml` files (used by the E2E tests). Frontend: API client + pure password rules, public pages outside `AppShell` (login, forgot password, set password), a user menu in the header with logout, a Hesabım page, and a Kullanıcılar section in Ayarlar with create/edit/deactivate modals.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (`batch_alter_table` for SQLite), pydantic v2, python-jose JWT, passlib/bcrypt, pytest; Next.js 14 (app router), React 18, Tailwind, Vitest + Testing Library + user-event; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-user-management-design.md`

## Global Constraints

Every task's requirements include this section.

**Process**

- Work on branch `feature/user-management` (already checked out; do not switch branches, do not push, never use `git stash`). One commit per task. Every commit message ends with a blank line and then exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY`
- Always `git add` explicit paths, never `git add .` or `git add ..` (`backend/.venv`, `frontend/node_modules` and `tests/e2e/node_modules` may be symlinks and must never be committed).
- No new Python packages and no new npm packages.
- Backend commands run from `backend/` (`.venv/bin/python -m pytest ...`), frontend commands from `frontend/` (`npx vitest run ...`, `npx tsc --noEmit`, `npm run build`), E2E from `tests/e2e/` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` when a pinned Chromium is needed.

**Project rules (code review checks every one)**

- **Only `ApiError` messages are shown to users.** Anything else (a thrown `Error`, a network failure) is replaced by a Turkish fallback sentence. The helper is `userMessage(error, fallback)` in `frontend/src/lib/userMessages.ts` (Task 8); never render `error.message` of a plain `Error`.
- **A button the user just clicked uses `aria-disabled` plus a guard, never `disabled`.** The click handler returns early while a request is in flight (an `inFlight`/`busy` ref), so a second click does nothing and focus is not lost.
- **No ref reads inside React state updaters.** A functional `setState(prev => ...)` must be pure; read refs before calling it.
- **No stale state reads after an `await`.** After an await use the awaited value or a functional update, never a state variable captured before the await.
- **Tokens, passwords and links are never logged.** Log lines carry the exception type only. The one exception is the development-only console e-mail backend, which prints the body of the invite / password-reset e-mails (the `show_body_in_dev_console` flag) so a developer can follow the link; the `file` and `smtp` backends never log a body.
- **Every backend user-management query is firm-scoped.** A user, token or case of another firm answers 404 (never 403, never a different message), including through `transfer_to`.
- **Turkish UI and API copy is used exactly as written in this plan** (copied from the spec; strings the spec does not word are fixed in the code blocks below).

**Data model**

- `users.password_set_at` (DateTime, nullable): UTC, naive, whole seconds; `NULL` = never set (invited, "pending"). `users.invited_at` (DateTime, nullable). Migration fills `password_set_at` for existing users with `coalesce(created_at, now)`. A pending user's `hashed_password` holds a random, unusable bcrypt digest (the column stays `NOT NULL`); login is always refused while `password_set_at IS NULL`.
- Displayed status is derived, never stored: `inactive` (not `is_active`), else `pending` (no password yet), else `active`.
- `user_tokens`: `id`, `user_id` (FK, index), `law_firm_id` (FK, index), `purpose` (`invite` | `reset`, String(20)), `token_hash` (String(64), unique; SHA-256 hex), `expires_at`, `used_at` (nullable), `created_by` (FK users, nullable), `created_at`. Token = `secrets.token_urlsafe(32)`, only the digest is stored. Issuing a new token for the same user and purpose invalidates earlier unused ones (`used_at`). Lifetimes: invite 72 hours, reset 1 hour (`INVITE_TOKEN_HOURS`, `RESET_TOKEN_MINUTES`; defaults 72 and 60).
- JWT claim `pwd` = `password_set_at` in whole seconds (`calendar.timegm`, naive UTC). Every request compares it with the user's current value; a mismatch, a missing claim or a user without `password_set_at` is 401.
- Password rule: at least 10 and at most 128 characters; not equal (case-insensitive) to the account's e-mail. Messages: `Şifre en az 10 karakter olmalı.` / `Şifre en fazla 128 karakter olabilir.` / `Şifre e-posta adresinizle aynı olamaz.`

**API (all firm-scoped; admin routes answer 403 to lawyers)**

- `GET /admin/users` (every user: `id, email, full_name, department, role, is_active, status, invited_at, password_set_at, created_at`), `POST /admin/users` (`{email, full_name, department?, role}` → 201, pending user + invite, e-mail lower-cased, taken → 409 `Bu e-posta adresi zaten kayıtlı.`), `PATCH /admin/users/{id}` (`full_name?, department?, role?, email?`; own role 409 `Kendi rolünüzü değiştiremezsiniz.`; last active admin 409 `Büroda en az bir aktif yönetici kalmalı.`), `POST /admin/users/{id}/invite` (already has a password → 409 `Kullanıcı şifresini zaten belirlemiş.`), `POST /admin/users/{id}/password-reset`, `GET /admin/users/{id}/workload`, `POST /admin/users/{id}/deactivate` (`{transfer_to?}`), `POST /admin/users/{id}/activate`.
- Deactivation: not yourself (409 `Kendi hesabınızı pasifleştiremezsiniz.`), not the last active admin (409, message above); with work, `transfer_to` is required (422 `Açık davaları ve görevleri devretmek için bir avukat seçin.`); the target must be an active lawyer of the same firm who has set a password and is not the user (422 `Devredilecek avukat geçersiz.`). One transaction moves open cases' `assigned_lawyer_id`, pending tasks' `assigned_to` and precedents' `reviewer_lawyer_id` to the target, sets `is_active=false` and invalidates unused tokens. Answer: `{user, transferred: {cases, tasks, precedents}}`.
- `POST /auth/forgot-password` → always 202 with `Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.`; the e-mail goes only to an active user who has a password; 3 requests per minute per e-mail + IP, then 429. `GET /auth/token-info?token=` → `{purpose, email, full_name}` or 410 `Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.` `POST /auth/set-password` `{token, password}` → new access token (auto-login) or the same 410 (unknown, expired, used, inactive user). `POST /auth/change-password` `{current_password, new_password}` → 400 `Mevcut şifre hatalı.` or a new access token (other sessions end). `POST /auth/login`: a pending user is refused (401, generic message); messages `E-posta veya şifre hatalı.` and `Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.`; the login rate limit is 5 attempts per user per minute. `GET /auth/config` (no login) → `{demo_mode}` (`SEED_DEMO_DATA`). `POST /auth/logout` stays. `PATCH /users/me` `{full_name?, department?}`.
- E-mails (Turkish, text + simple HTML): invite subject `CaseBridge davetiniz — <büro adı>` (inviter, firm, `Şifrenizi belirleyin` link, validity 72 hours); reset subject `CaseBridge şifre sıfırlama` (link, validity 1 hour, `Bu isteği siz yapmadıysanız dikkate almayın.`). Link: `{FRONTEND_BASE_URL}/sifre-belirle?token=<token>` (`FRONTEND_BASE_URL`, default `http://localhost:3000`). A failed e-mail does not fail the action: user and token are created and the answer carries `email_sent: false`.
- `EMAIL_BACKEND=file` writes every message as its own `.eml` file under `EMAIL_FILE_DIR` (default `./var/mail`); no test-only HTTP endpoint is added to the application.
- Setup: `python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"` (exit 0 on success, 1 on error, Turkish messages); `SEED_DEMO_DATA=false` creates no demo firm or users.

**UI strings (exact)**

- Settings: `Kullanıcılar`, `Kullanıcı ekle`, columns `Ad`, `E-posta`, `Departman`, `Rol`, `Durum`, statuses `Aktif` / `Davet bekliyor` / `Pasif`, roles `Avukat` / `Yönetici`, form labels `Ad soyad *`, `E-posta *`, `Departman`, `Rol *`, notice `Davet gönderildi.`, warning `Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.`, row actions `Düzenle`, `Daveti yeniden gönder`, `Şifre sıfırlama bağlantısı gönder`, `Pasifleştir`, `Aktifleştir`, deactivation select `Devredilecek avukat`, button `Devret ve pasifleştir`. Pasifleştir and role change are not shown on the admin's own row.
- Identity pages: login form empty, link `Şifremi unuttum`, hint `Demo hesapları` only when `demo_mode`; `/sifremi-unuttum` answer `Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.`; `/sifre-belirle?token=` greets `Merhaba <ad>, CaseBridge şifrenizi belirleyin.` with `Yeni şifre` and `Yeni şifre (tekrar)`, auto-login and redirect by role (`/admin` or `/dashboard`); an expired or used link explains itself and offers `Giriş sayfasına dön` and `Şifremi unuttum`.
- Account: user menu (name + role) with `Hesabım` and `Çıkış yap`; `/hesabim` edits name and department and has `Şifre değiştir` (current, new, new again); success `Şifreniz değiştirildi.`
- Strings the spec leaves open are chosen in the code below and must be copied exactly: `Şifreler eşleşmiyor.`, `Bilgileriniz güncellendi.`, `Ad soyad boş olamaz.`, `E-posta adresi gerekli.`, `Geçerli bir e-posta adresi girin.`, `Kullanıcı güncellendi.`, `Kullanıcı aktifleştirildi.`, `Kullanıcı pasifleştirildi.`, `Sıfırlama bağlantısı gönderildi.`, `Devredilecek avukatı seçin.`, and every Turkish fallback sentence (`... Lütfen tekrar deneyin.`).

**Out of scope:** two-factor authentication, self-registration, multi-firm administration, a session list, server-side token revocation on logout.

---

## Decisions made while planning

The spec leaves these open; the plan fixes them. Each one was built and verified in a scratch worktree (backend suite, frontend suite, `tsc`, `npm run build`, Playwright) before being written down here.

1. **How the `pwd` claim compares.** The claim is `calendar.timegm(password_set_at.utctimetuple())`, an integer of whole seconds of the naive-UTC `password_set_at`, produced by `password_epoch()` in `app/core/security.py`. `get_current_user` accepts a token only when `payload["pwd"]` is an `int` (a `bool` is refused) equal to `password_epoch(user.password_set_at)`. `password_set_at` is stored in whole seconds, and `next_password_set_at()` guarantees the new value is strictly later than the previous one even when two password changes happen inside the same second, so an older session can never survive a change.
2. **Tokens without `pwd`.** They are refused with 401, like any mismatch. Every session issued before this release therefore ends once, and everybody signs in again after the deploy (the migration gives every existing user a `password_set_at`, so they can). A user whose `password_set_at` is `NULL` has no valid token at all.
3. **Demo purge versus non-demo firms.** `SEED_DEMO_DATA=false` removes demo data only for the demo firm (`Demo Hukuk Bürosu`) and the four known demo e-mails (`admin@`, `avukat@`, `kerem@`, `zeynep@demo.casebridge.dev`). Only the seeded demo cases (matched by their known case numbers) and the showcase hearings (`prompt_version = "showcase-v1"`) are deleted. A demo user is deleted only when nothing in the database references it (a metadata-driven scan of every foreign key to `users.id`, ignoring the user's own tokens); otherwise the user is kept and listed in the log. The demo firm is deleted only when nothing references it. Every other firm and every other user is untouched. The step that assigns unassigned cases to the demo lawyers now runs in demo mode only.
4. **`create_admin` when the firm exists.** A firm with the same (whitespace-normalised) name is reused, so a second administrator can be added to an existing firm; the e-mail must be unique across all firms (taken → Turkish error, exit 1). The administrator is created pending and the invite is sent. If the invite e-mail cannot be sent the whole command rolls back (no firm, no user, no token) and exits 1 with a message that says nothing was created, because the command-line caller has no "resend" button. `EMAIL_BACKEND=console` prints the link to the console.
5. **Deactivation transfer.** Only *open* work moves: cases that are not closed, not archived and not precedents; every pending task assigned to the user; every precedent the user reviews (any state). Cases the target already owns are not touched (nothing to move, the counts only count rows that changed owner). Closed and archived cases stay with the deactivated user (history stays truthful). A `transfer_to` that is sent without any work is still validated (invalid target → 422) but moves nothing. Deactivating a *pending* user is allowed (it revokes an invite); activating a pending user keeps it pending. A lawyer who is promoted to administrator keeps the cases they own.
6. **Where the frontend stores the new token.** In the API layer: `setPassword()` and `changePassword()` in `src/lib/api.ts` call `setToken()` themselves with the access token of the response, so no page can forget it; the login page calls `setToken()` itself after `login()`. `logout()` clears the token even when the request fails.
7. **Where the user menu lives.** `UserMenu` is rendered by `WorkspaceHeader` (so every page behind `AppShell` has it). The Hesabım page tells the header about a new name through a small window event (`src/lib/userEvents.ts`); `AppShell` subscribes and updates its `user` state.
8. **Public pages are outside `AppShell`.** `/login`, `/sifremi-unuttum` and `/sifre-belirle` are plain app-router pages that render `AuthCard`; only the pages under the existing authenticated layout use `AppShell`. A 401 from `/auth/login` is a failed sign-in, not an expired session: it neither redirects nor clears the stored token.
9. **Pending invitees in lawyer lists and case reassignment.** A pending user cannot own work yet, so they are excluded from `GET /admin/lawyers` and `GET /users` (via `UserRepository.list_in_firm`; both also drop inactive users), the by-lawyer analytics, the admin case and precedent assignment queries, and the `assigned_lawyer_id` check of `POST /cases`: all of them require `is_active` and `password_set_at IS NOT NULL`, so a pending user is refused as a target exactly like an unknown user. Task and calendar assignee validation is unchanged (not needed by this feature).
10. **A pending user is created with `password_set_at=sqlalchemy.null()`.** The model default (`now`, whole seconds) keeps every existing fixture and the seed working unchanged, but SQLAlchemy applies a column default to a plain `None`, so only an explicit `null()` produces a pending row (verified by a test).
11. **Settings > Kullanıcılar is a section, not a tab.** `SettingsView` has no tab bar; the section replaces the old read-only list for administrators and is hidden (with the old "only administrators" sentence) for lawyers. The users table loads its own data (`GET /admin/users`).
12. **Last-admin guard.** `ensure_not_last_admin` is defense in depth: through the API the actor is always an active administrator, so it is unreachable there and is unit-tested at service level.
13. **Changing a user's e-mail invalidates that user's unused tokens**, so an old link cannot be used for the new address.
14. **The console e-mail backend prints a body only for flagged messages** (`EmailMessage.show_body_in_dev_console`, set by the invite and reset builders). Reminder and test e-mails keep logging recipient and subject only.
15. **`import_cases` keeps working in real-data mode:** `--firm` and `--lawyer` choose the target firm and lawyer (the importer used to assume the demo firm).
16. **bcrypt truncates passwords longer than 72 bytes** silently; accepted limitation (the policy allows 10–128 characters).
17. **Found by the E2E run:** `GET /notifications/status` and the test e-mail rejected `EMAIL_BACKEND=file` (their response schemas listed only `console`/`smtp`) and the Ayarlar page broke. Task 12 widens the schemas and the Ayarlar labels first, test-first. The user form also validates the e-mail shape on the client (the server's 422 would only say `İstek başarısız oldu (422).`).
18. **The shared router mock returns one stable router object**, like Next's `useRouter()`; otherwise `AppShell`'s `[router]` effect re-ran on every render in tests and overwrote the name announced by the Hesabım page.
19. **E2E specs 02–05 were failing before this work** at `login()`: it expected `/dashboard`, but an administrator lands on `/admin`. Task 12 makes `login()` accept both; spec 05 additionally opens `/dashboard` itself.

## File Map

Each task below lists its own files; this map shows what each unit is responsible for. All paths are relative to the repository root.

**Backend — data and security**

| File | Task | Responsibility |
|---|---|---|
| `backend/app/models/user.py` | 1 | `password_set_at`, `invited_at`, derived `status`, `UserStatus` |
| `backend/app/models/user_token.py` | 1 | `UserToken` (hashed one-time tokens), `TokenPurpose` |
| `backend/alembic/versions/d5b2f8a1c3e6_add_user_invites_and_tokens.py` | 1 | columns + table; existing users get `password_set_at` |
| `backend/app/core/timeutil.py` | 1 | `utc_now()` (naive UTC) |
| `backend/app/core/config.py` | 2 | `file` e-mail backend setting, token lifetimes, `frontend_base_url` |
| `backend/app/core/security.py` | 2 | `password_epoch()` (the `pwd` claim value) |
| `backend/app/core/rate_limit.py` | 3 | `is_rate_limited(key, max_attempts)` |
| `backend/app/api/deps.py` | 3 | `get_current_user` checks `pwd` |
| `backend/app/services/auth_service.py` | 3 | refuses pending users, signs `pwd` |
| `backend/app/repositories/user_repository.py` | 3, 5 | case-insensitive `get_by_email`; `list_in_firm` skips pending/inactive |

**Backend — services and routes**

| File | Task | Responsibility |
|---|---|---|
| `backend/app/services/password_policy.py` | 2 | length / e-mail rule |
| `backend/app/services/user_token_service.py` | 2 | issue, find, consume, invalidate tokens |
| `backend/app/services/email.py` | 2 | `file` backend, dev-console body flag |
| `backend/app/services/notification_content.py` | 2 | invite and reset e-mails |
| `backend/app/services/account_service.py` | 4, 5 | apply a new password, deliver e-mail, prepare reset/invite e-mails |
| `backend/app/api/routes/auth.py` | 3, 4 | login messages, `/auth/config`, forgot / token-info / set / change password |
| `backend/app/schemas/auth.py` | 3, 4 | request/response models of the auth routes |
| `backend/app/schemas/admin_user.py`, `admin_user_lifecycle.py` | 5, 6 | admin user models, workload and deactivation models |
| `backend/app/services/user_admin_service.py` | 5 | create pending user, edit, last-admin guard |
| `backend/app/services/user_lifecycle_service.py` | 6 | workload, deactivate with transfer, activate |
| `backend/app/api/routes/admin_users.py` | 5, 6 | `/admin/users/*` (admin only, firm-scoped) |
| `backend/app/api/routes/admin.py`, `cases.py`, `users.py`, `services/analytics_service.py` | 5, 7 | pending/inactive users are not assignable; `PATCH /users/me` |
| `backend/app/schemas/text_rules.py`, `schemas/user.py` | 7 | profile text cleaning, `ProfileUpdate` |
| `backend/app/main.py`, `backend/app/models/__init__.py` | 1, 5 | router registration, model exports |
| `backend/app/schemas/notification.py` | 12 | status/test-e-mail schemas accept the `file` backend |

**Backend — setup commands**

| File | Task | Responsibility |
|---|---|---|
| `backend/app/db/create_admin.py` | 7 | first administrator from the command line |
| `backend/app/db/demo_cleanup.py` | 7 | safe removal of demo data |
| `backend/app/db/seed.py`, `import_cases.py` | 7 | real-data mode seed; importer target firm/lawyer |

**Frontend**

| File | Task | Responsibility |
|---|---|---|
| `frontend/src/types/index.ts`, `src/lib/api.ts` | 8, 12 | types and API calls for everything above |
| `frontend/src/lib/passwordRules.ts`, `userMessages.ts` | 8 | client password rules, Turkish-fallback message helper |
| `frontend/src/components/auth/*`, `src/app/login`, `sifremi-unuttum`, `sifre-belirle` | 9 | public pages outside `AppShell` |
| `frontend/src/components/UserMenu.tsx`, `WorkspaceHeader.tsx`, `AppShell.tsx`, `src/lib/userEvents.ts` | 10 | menu, logout, header refresh |
| `frontend/src/components/AccountView.tsx`, `src/app/hesabim/page.tsx` | 10 | Hesabım (profile + change password) |
| `frontend/src/components/ModalFrame.tsx` | 11 | shared dialog frame |
| `frontend/src/components/users/*`, `SettingsView.tsx` | 11, 12 | Kullanıcılar section, modals |
| `frontend/src/test/navigation.ts` | 10 | shared router mock (stable router object) |

**E2E and docs**

| File | Task | Responsibility |
|---|---|---|
| `tests/e2e/playwright.config.ts` | 12 | backend runs with `EMAIL_BACKEND=file`, `EMAIL_FILE_DIR`, `FRONTEND_BASE_URL` |
| `tests/e2e/specs/helpers.ts` | 12 | `login()` accepts `/admin`; `newestPasswordLink(recipient)` reads the `.eml` |
| `tests/e2e/specs/05-click-through.spec.ts`, `10-user-management.spec.ts` | 12 | spec 05 opens the dashboard itself; new end-to-end flow |
| `README.md`, `.env.example`, `PROGRESS.md`, `.gitignore` | 2, 12 | user-management docs, new settings, ignored mail directories |

---

## Tasks

### Task 1: User invite state, `user_tokens` table and migration

Foundation for everything else: a user can exist without a password (pending), one-time tokens have a table, and existing databases are migrated. Nothing is exposed over HTTP yet.

**Files:**
- Create: `backend/alembic/versions/d5b2f8a1c3e6_add_user_invites_and_tokens.py`
- Create: `backend/app/models/user_token.py`
- Modify: `backend/app/core/timeutil.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/user.py`
- Test (create): `backend/tests/integration/test_user_management_migration.py`
- Test (create): `backend/tests/unit/test_user_model.py`

**Interfaces:**
- Consumes: existing `User`, `Base`, `LawFirm`, Alembic head `c8f2a6d4e1b7`.
- Produces: `app.core.timeutil.utc_now() -> datetime` (naive UTC); `User.password_set_at: datetime | None` (default: now in whole seconds, so existing fixtures and the seed keep working; pass `sqlalchemy.null()` for a pending user), `User.invited_at: datetime | None`, `User.status -> UserStatus`; `app.models.UserStatus` (`PENDING`/`ACTIVE`/`INACTIVE`, values `pending`/`active`/`inactive`); `app.models.TokenPurpose` (`INVITE`/`RESET`) and `app.models.UserToken` (columns as in Global Constraints); Alembic revision `d5b2f8a1c3e6` (down revision `c8f2a6d4e1b7`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/test_user_management_migration.py`:

```python
"""The Alembic chain adds users.password_set_at / invited_at and user_tokens;
existing users count as "password already set"."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "c8f2a6d4e1b7"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _insert_user(conn, user_id, email, created_at):
    conn.execute(
        sa.text(
            "INSERT INTO users (id, law_firm_id, email, hashed_password, full_name, role, is_active, created_at) "
            "VALUES (:id, 'firm-1', :email, 'hash', 'Ad Soyad', 'lawyer', 1, :created_at)"
        ),
        {"id": user_id, "email": email, "created_at": created_at},
    )


def test_migration_marks_existing_users_as_password_set_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES ('firm-1', 'Büro', '2026-01-01 00:00:00')"))
        _insert_user(conn, "u-dated", "dated@example.com", "2026-03-04 05:06:07")
        _insert_user(conn, "u-second", "second@example.com", "2026-05-06 07:08:09")

    command.upgrade(config, "head")
    inspector = sa.inspect(sa.create_engine(url))
    assert {"password_set_at", "invited_at"} <= {column["name"] for column in inspector.get_columns("users")}
    assert {column["name"] for column in inspector.get_columns("user_tokens")} >= {
        "id", "user_id", "law_firm_id", "purpose", "token_hash", "expires_at", "used_at", "created_by", "created_at",
    }
    indexes = {index["name"]: index for index in inspector.get_indexes("user_tokens")}
    assert {"ix_user_tokens_user_id", "ix_user_tokens_law_firm_id", "ix_user_tokens_token_hash"} <= set(indexes)
    assert indexes["ix_user_tokens_token_hash"]["unique"]

    with sa.create_engine(url).connect() as conn:
        rows = dict(conn.execute(sa.text("SELECT id, password_set_at FROM users")).all())
        assert str(rows["u-dated"]).startswith("2026-03-04 05:06:07")
        assert str(rows["u-second"]).startswith("2026-05-06 07:08:09")
        assert conn.execute(sa.text("SELECT COUNT(*) FROM users WHERE invited_at IS NOT NULL")).scalar_one() == 0

    command.downgrade(config, PREVIOUS_HEAD)
    inspector = sa.inspect(sa.create_engine(url))
    assert "user_tokens" not in inspector.get_table_names()
    assert not ({"password_set_at", "invited_at"} & {column["name"] for column in inspector.get_columns("users")})
    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar_one() == 2
```

Create `backend/tests/unit/test_user_model.py`:

```python
"""users.password_set_at / invited_at and the derived status; user_tokens table."""
from datetime import timedelta

import pytest
from sqlalchemy import null
from sqlalchemy.exc import IntegrityError

from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole, UserStatus
from app.models.user_token import TokenPurpose, UserToken


@pytest.fixture()
def firm(db_session):
    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    return firm


def _user(firm, email, **kwargs):
    return User(law_firm_id=firm.id, email=email, hashed_password="x", full_name="Ad Soyad", **kwargs)


def test_user_without_password_set_at_counts_as_password_set_now(db_session, firm):
    user = _user(firm, "a@example.com")
    db_session.add(user)
    db_session.commit()

    assert user.password_set_at is not None
    assert user.password_set_at.microsecond == 0
    assert abs(utc_now() - user.password_set_at) < timedelta(seconds=5)
    assert user.invited_at is None
    assert user.status == UserStatus.ACTIVE


def test_invited_user_is_created_with_a_null_password_set_at(db_session, firm):
    user = _user(firm, "b@example.com", password_set_at=null(), invited_at=utc_now())
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.password_set_at is None
    assert user.status == UserStatus.PENDING


def test_status_is_derived_from_is_active_and_password_set_at(db_session, firm):
    pending = _user(firm, "c@example.com", password_set_at=null())
    inactive_pending = _user(firm, "d@example.com", password_set_at=null(), is_active=False)
    inactive = _user(firm, "e@example.com", is_active=False)
    db_session.add_all([pending, inactive_pending, inactive])
    db_session.commit()

    assert pending.status == UserStatus.PENDING
    assert inactive_pending.status == UserStatus.INACTIVE
    assert inactive.status == UserStatus.INACTIVE
    assert UserStatus.PENDING.value == "pending"


def test_user_token_stores_a_unique_digest(db_session, firm):
    user = _user(firm, "f@example.com", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.flush()
    expires = utc_now() + timedelta(hours=1)
    db_session.add(UserToken(
        user_id=user.id, law_firm_id=firm.id, purpose=TokenPurpose.INVITE.value,
        token_hash="a" * 64, expires_at=expires,
    ))
    db_session.commit()
    stored = db_session.query(UserToken).one()
    assert stored.used_at is None and stored.created_by is None and stored.created_at is not None

    db_session.add(UserToken(
        user_id=user.id, law_firm_id=firm.id, purpose=TokenPurpose.RESET.value,
        token_hash="a" * 64, expires_at=expires,
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/integration/test_user_management_migration.py tests/unit/test_user_model.py -q
```

Expected: FAIL — collection error in `tests/unit/test_user_model.py` (`ImportError: cannot import name 'UserStatus'` / no module `app.models.user_token`).

- [ ] **Step 3: Implement**

Create `backend/alembic/versions/d5b2f8a1c3e6_add_user_invites_and_tokens.py`:

```python
"""add user invite state and one-time user tokens

Revision ID: d5b2f8a1c3e6
Revises: c8f2a6d4e1b7
Create Date: 2026-10-11 00:00:00

users.password_set_at is NULL while a user has been invited but has not chosen
a password yet. Every existing user already has a working password, so the
column is filled with created_at (the migration time if it were ever empty).
user_tokens holds the one-time invite / password reset tokens (digest only).
"""
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5b2f8a1c3e6"
down_revision: Union[str, Sequence[str], None] = "c8f2a6d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("password_set_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("invited_at", sa.DateTime(), nullable=True))

    users = sa.table(
        "users",
        sa.column("created_at", sa.DateTime()),
        sa.column("password_set_at", sa.DateTime()),
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    op.execute(users.update().values(password_set_at=sa.func.coalesce(users.c.created_at, now)))

    op.create_table(
        "user_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_tokens_user_id", "user_tokens", ["user_id"])
    op.create_index("ix_user_tokens_law_firm_id", "user_tokens", ["law_firm_id"])
    op.create_index("ix_user_tokens_token_hash", "user_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_tokens_token_hash", table_name="user_tokens")
    op.drop_index("ix_user_tokens_law_firm_id", table_name="user_tokens")
    op.drop_index("ix_user_tokens_user_id", table_name="user_tokens")
    op.drop_table("user_tokens")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("invited_at")
        batch.drop_column("password_set_at")
```

Modify `backend/app/core/timeutil.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/core/timeutil.py
+++ b/backend/app/core/timeutil.py
@@ -3,7 +3,7 @@
 Calendar event times are stored as naive datetimes in this zone, and
 "today" for the calendar and reminders is the date in this zone.
 """
-from datetime import date, datetime
+from datetime import date, datetime, timezone
 from zoneinfo import ZoneInfo
 
 from app.core.config import settings
@@ -28,3 +28,9 @@ def to_local_naive(value: datetime) -> datetime:
     if value.tzinfo is None:
         return value
     return value.astimezone(app_zone()).replace(tzinfo=None)
+
+
+def utc_now() -> datetime:
+    """Current UTC time as a naive datetime - how every DateTime column of
+    the app is stored (the database holds UTC, never local time)."""
+    return datetime.now(timezone.utc).replace(tzinfo=None)
```

Modify `backend/app/models/__init__.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/models/__init__.py
+++ b/backend/app/models/__init__.py
@@ -1,7 +1,8 @@
 """SQLAlchemy ORM models. Importing this package registers all models
 on the shared declarative Base so Base.metadata.create_all() sees them."""
 from app.models.law_firm import LawFirm  # noqa: F401
-from app.models.user import User, UserRole  # noqa: F401
+from app.models.user import User, UserRole, UserStatus  # noqa: F401
+from app.models.user_token import TokenPurpose, UserToken  # noqa: F401
 from app.models.case import (  # noqa: F401
     Case,
     CaseEvent,
```

Modify `backend/app/models/user.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/models/user.py
+++ b/backend/app/models/user.py
@@ -5,6 +5,7 @@ from datetime import datetime, timezone
 from sqlalchemy import Boolean, DateTime, ForeignKey, String
 from sqlalchemy.orm import Mapped, mapped_column, relationship
 
+from app.core.timeutil import utc_now
 from app.db.base import Base
 from app.db.types import str_enum
 
@@ -14,6 +15,19 @@ class UserRole(str, enum.Enum):
     LAWYER = "lawyer"
 
 
+class UserStatus(str, enum.Enum):
+    """Derived display status; never stored."""
+
+    PENDING = "pending"
+    ACTIVE = "active"
+    INACTIVE = "inactive"
+
+
+def _password_set_now() -> datetime:
+    # Whole seconds: the JWT "pwd" claim carries this value as integer seconds.
+    return utc_now().replace(microsecond=0)
+
+
 class User(Base):
     __tablename__ = "users"
 
@@ -26,8 +40,25 @@ class User(Base):
     gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
     role: Mapped[UserRole] = mapped_column(str_enum(UserRole), default=UserRole.LAWYER, nullable=False)
     is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
+    # When the password was last set (UTC, whole seconds). NULL = never set:
+    # the user was invited and has not chosen a password yet. A new User that
+    # is built without this value counts as "password set now"; an invited
+    # user is created with password_set_at=sqlalchemy.null(), because the ORM
+    # applies the default to a plain None.
+    password_set_at: Mapped[datetime | None] = mapped_column(
+        DateTime, nullable=True, default=_password_set_now
+    )
+    invited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
     created_at: Mapped[datetime] = mapped_column(
         DateTime, default=lambda: datetime.now(timezone.utc)
     )
 
     law_firm: Mapped["LawFirm"] = relationship(back_populates="users")
+
+    @property
+    def status(self) -> UserStatus:
+        if not self.is_active:
+            return UserStatus.INACTIVE
+        if self.password_set_at is None:
+            return UserStatus.PENDING
+        return UserStatus.ACTIVE
```

Create `backend/app/models/user_token.py`:

```python
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.timeutil import utc_now
from app.db.base import Base


class TokenPurpose(str, enum.Enum):
    INVITE = "invite"
    RESET = "reset"


class UserToken(Base):
    """One-time link token (invite or password reset). Only the SHA-256 hex
    digest of the token is stored, never the token itself."""

    __tablename__ = "user_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    law_firm_id: Mapped[str] = mapped_column(String(36), ForeignKey("law_firms.id"), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/integration/test_user_management_migration.py tests/unit/test_user_model.py -q
```

Expected: PASS — 5 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/d5b2f8a1c3e6_add_user_invites_and_tokens.py backend/app/core/timeutil.py backend/app/models/__init__.py backend/app/models/user.py backend/app/models/user_token.py backend/tests/integration/test_user_management_migration.py backend/tests/unit/test_user_model.py
git commit -F - <<'EOF'
feat: user invite state, user_tokens table and migration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 2: Token service, password policy, account e-mails and the `file` e-mail backend

The building blocks that need no HTTP: hashing and consuming one-time tokens, the password rule, the Turkish invite/reset e-mails, the settings they need and an e-mail backend that writes `.eml` files.

**Files:**
- Create: `backend/app/services/password_policy.py`
- Create: `backend/app/services/user_token_service.py`
- Modify: `.gitignore`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/core/security.py`
- Modify: `backend/app/services/email.py`
- Modify: `backend/app/services/notification_content.py`
- Test (create): `backend/tests/unit/test_account_emails.py`
- Test (create): `backend/tests/unit/test_email_file_backend.py`
- Test (create): `backend/tests/unit/test_password_policy.py`
- Test (create): `backend/tests/unit/test_user_management_config.py`
- Test (create): `backend/tests/unit/test_user_token_service.py`

**Interfaces:**
- Consumes: Task 1 models (`User`, `UserToken`, `TokenPurpose`), `utc_now()`.
- Produces: settings `email_backend: Literal["console", "smtp", "file"]`, `email_file_dir: str = "./var/mail"`, `invite_token_hours: int = 72`, `reset_token_minutes: int = 60`, `frontend_base_url: str = "http://localhost:3000"`; `app.core.security.password_epoch(password_set_at: datetime) -> int`; `EmailMessage(..., show_body_in_dev_console: bool = False)` and `send_email(message)` handling `console`/`smtp`/`file`; `password_link(token: str) -> str`, `validity_phrase(lifetime: timedelta) -> str`, `build_invite_email(*, user: User, firm_name: str, inviter_name: str | None, token: str) -> EmailMessage`, `build_reset_email(*, user: User, token: str) -> EmailMessage` (in `notification_content.py`); `validate_password(password: str, email: str) -> None` raising `PasswordPolicyError(ValueError)` with the Turkish message; `hash_token(raw: str) -> str`, `token_lifetime(purpose) -> timedelta`, `invalidate_unused_tokens(db, user_id, purpose=None) -> None`, `issue_token(db, user, purpose, created_by=None) -> str` (flushes, the caller commits), `find_usable_token(db, raw) -> tuple[UserToken, User] | None`, `consume_token(db, token) -> bool` (`False` when the token was used meanwhile).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_account_emails.py`:

```python
from app.core.config import settings
from app.models.user import User
from app.services.notification_content import build_invite_email, build_reset_email, password_link, validity_phrase
from datetime import timedelta


def _user():
    return User(email="yeni@example.com", full_name="Ayşe <Demir>", hashed_password="x", law_firm_id="f")


def test_password_link_uses_the_frontend_base_url(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", "https://app.example.test/")
    assert password_link("tok") == "https://app.example.test/sifre-belirle?token=tok"


def test_validity_phrase():
    assert validity_phrase(timedelta(hours=72)) == "72 saat"
    assert validity_phrase(timedelta(minutes=60)) == "1 saat"
    assert validity_phrase(timedelta(minutes=45)) == "45 dakika"


def test_invite_email_names_the_inviter_firm_link_and_validity(monkeypatch):
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:3000")
    message = build_invite_email(user=_user(), firm_name="Demir Hukuk", inviter_name="Mehmet Kaya", token="TOKEN123")

    assert message.to == "yeni@example.com"
    assert message.subject == "CaseBridge davetiniz — Demir Hukuk"
    assert "Mehmet Kaya sizi Demir Hukuk bürosunun CaseBridge çalışma alanına davet etti." in message.text
    assert "Şifrenizi belirleyin: http://localhost:3000/sifre-belirle?token=TOKEN123" in message.text
    assert "72 saat geçerlidir" in message.text
    assert 'href="http://localhost:3000/sifre-belirle?token=TOKEN123"' in message.html
    assert "Ayşe &lt;Demir&gt;" in message.html and "<Demir>" not in message.html
    assert message.show_body_in_dev_console is True


def test_invite_email_without_an_inviter_is_still_complete():
    message = build_invite_email(user=_user(), firm_name="Demir Hukuk", inviter_name=None, token="T")
    assert "Demir Hukuk bürosunun CaseBridge çalışma alanına davet edildiniz." in message.text


def test_reset_email_has_the_link_validity_and_the_ignore_notice():
    message = build_reset_email(user=_user(), token="RESETTOKEN")

    assert message.subject == "CaseBridge şifre sıfırlama"
    assert "/sifre-belirle?token=RESETTOKEN" in message.text
    assert "1 saat geçerlidir" in message.text
    assert "Bu isteği siz yapmadıysanız dikkate almayın." in message.text
    assert message.show_body_in_dev_console is True
```

Create `backend/tests/unit/test_email_file_backend.py`:

```python
"""EMAIL_BACKEND=file writes one .eml per message; the console backend shows
the body only for messages that ask for it."""
import logging
import time
from email import policy
from email.parser import BytesParser

import pytest

from app.core.config import settings
from app.services.email import EmailMessage, EmailSendError, send_email


@pytest.fixture()
def mail_dir(tmp_path, monkeypatch):
    directory = tmp_path / "mail"
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(directory))
    return directory


def _message(to="a@example.com", subject="Konu — test", text="Merhaba https://x.test/sifre-belirle?token=abc"):
    return EmailMessage(to=to, subject=subject, text=text, html="<p>html</p>")


def test_file_backend_writes_one_parseable_eml_per_message(mail_dir):
    send_email(_message())
    time.sleep(0.002)
    send_email(_message(to="b@example.com"))

    files = sorted(mail_dir.glob("*.eml"))
    assert len(files) == 2
    first = BytesParser(policy=policy.default).parsebytes(files[0].read_bytes())
    assert first["To"] == "a@example.com"
    assert first["Subject"] == "Konu — test"
    assert "token=abc" in first.get_body(preferencelist=("plain",)).get_content()
    second = BytesParser(policy=policy.default).parsebytes(files[1].read_bytes())
    assert second["To"] == "b@example.com"


def test_file_backend_creates_the_directory(mail_dir):
    assert not mail_dir.exists()
    send_email(_message())
    assert mail_dir.is_dir()


def test_file_backend_failures_are_content_free_errors(mail_dir, monkeypatch):
    with pytest.raises(EmailSendError) as info:
        send_email(_message(subject="a\nb"))
    assert str(info.value) == "InvalidHeader"

    blocker = mail_dir.parent / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))
    with pytest.raises(EmailSendError) as info:
        send_email(_message())
    assert str(info.value) in {"FileExistsError", "NotADirectoryError"}


def test_file_backend_does_not_log_the_body(mail_dir, caplog):
    with caplog.at_level(logging.INFO, logger="casebridge"):
        send_email(_message(text="GIZLI-GOVDE"))
    assert "a@example.com" in caplog.text
    assert "GIZLI-GOVDE" not in caplog.text


def test_console_backend_logs_the_body_only_when_the_message_asks_for_it(monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_backend", "console")
    with caplog.at_level(logging.INFO, logger="casebridge"):
        send_email(EmailMessage(to="a@example.com", subject="Davet", text="PLAIN-GOVDE"))
        assert "PLAIN-GOVDE" not in caplog.text
        send_email(EmailMessage(to="a@example.com", subject="Davet", text="LINK-GOVDE", show_body_in_dev_console=True))
        assert "LINK-GOVDE" in caplog.text
```

Create `backend/tests/unit/test_password_policy.py`:

```python
import pytest

from app.services.password_policy import PasswordPolicyError, validate_password

EMAIL = "Avukat@Example.com"


def test_accepts_passwords_between_10_and_128_characters():
    validate_password("a" * 10, EMAIL)
    validate_password("ğüşiöç-1234", EMAIL)
    validate_password("x" * 128, EMAIL)


def test_rejects_short_passwords():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre en az 10 karakter olmalı\.$"):
        validate_password("a" * 9, EMAIL)


def test_rejects_passwords_over_128_characters():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre en fazla 128 karakter olabilir\.$"):
        validate_password("x" * 129, EMAIL)


def test_rejects_the_email_address_ignoring_case():
    with pytest.raises(PasswordPolicyError, match=r"^Şifre e-posta adresinizle aynı olamaz\.$"):
        validate_password("avukat@example.COM", EMAIL)
    with pytest.raises(PasswordPolicyError, match="e-posta adresinizle aynı"):
        validate_password("avukat@example.com", "avukat@example.com")
```

Create `backend/tests/unit/test_user_management_config.py`:

```python
import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_user_management_defaults(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    for name in ("INVITE_TOKEN_HOURS", "RESET_TOKEN_MINUTES", "FRONTEND_BASE_URL", "EMAIL_BACKEND", "EMAIL_FILE_DIR"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)
    assert settings.invite_token_hours == 72
    assert settings.reset_token_minutes == 60
    assert settings.frontend_base_url == "http://localhost:3000"
    assert settings.email_file_dir == "./var/mail"
    assert settings.email_backend == "console"


def test_file_is_an_email_backend(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv("EMAIL_BACKEND", "file")
    assert Settings(_env_file=None).email_backend == "file"


@pytest.mark.parametrize("name", ["INVITE_TOKEN_HOURS", "RESET_TOKEN_MINUTES"])
def test_token_lifetimes_must_be_positive(monkeypatch, name):
    monkeypatch.setenv("JWT_SECRET", "some-secret")
    monkeypatch.setenv(name, "0")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
```

Create `backend/tests/unit/test_user_token_service.py`:

```python
"""One-time tokens: only the digest is stored, they expire, work once, and a
newer token of the same purpose replaces the older one."""
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import password_epoch
from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User
from app.models.user_token import TokenPurpose, UserToken
from app.services.user_token_service import (
    consume_token,
    find_usable_token,
    hash_token,
    invalidate_unused_tokens,
    issue_token,
)


@pytest.fixture()
def user(db_session):
    firm = LawFirm(name="Büro")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="a@example.com", hashed_password="x", full_name="Ad Soyad")
    db_session.add(user)
    db_session.commit()
    return user


def test_issue_token_stores_only_the_sha256_digest(db_session, user):
    raw = issue_token(db_session, user, TokenPurpose.INVITE, created_by=user.id)
    db_session.commit()

    row = db_session.query(UserToken).one()
    assert len(raw) >= 43
    assert row.token_hash == hash_token(raw) and len(row.token_hash) == 64
    assert raw not in (row.token_hash, row.user_id, row.purpose)
    assert (row.user_id, row.law_firm_id, row.purpose, row.created_by) == (user.id, user.law_firm_id, "invite", user.id)
    assert row.used_at is None


def test_lifetimes_follow_the_settings(db_session, user, monkeypatch):
    monkeypatch.setattr(settings, "invite_token_hours", 72)
    monkeypatch.setattr(settings, "reset_token_minutes", 60)
    before = utc_now()
    issue_token(db_session, user, TokenPurpose.INVITE)
    issue_token(db_session, user, TokenPurpose.RESET)
    after = utc_now()

    invite = db_session.query(UserToken).filter_by(purpose="invite").one()
    reset = db_session.query(UserToken).filter_by(purpose="reset").one()
    assert before + timedelta(hours=72) <= invite.expires_at <= after + timedelta(hours=72)
    assert before + timedelta(minutes=60) <= reset.expires_at <= after + timedelta(minutes=60)


def test_a_new_token_invalidates_the_older_unused_one_of_the_same_purpose(db_session, user):
    first = issue_token(db_session, user, TokenPurpose.RESET)
    other_purpose = issue_token(db_session, user, TokenPurpose.INVITE)
    second = issue_token(db_session, user, TokenPurpose.RESET)
    db_session.commit()

    assert find_usable_token(db_session, first) is None
    assert find_usable_token(db_session, second) is not None
    assert find_usable_token(db_session, other_purpose) is not None


def test_find_usable_token_rejects_unknown_expired_used_and_inactive(db_session, user):
    assert find_usable_token(db_session, "") is None
    assert find_usable_token(db_session, "nope") is None
    assert find_usable_token(db_session, "x" * 500) is None

    raw = issue_token(db_session, user, TokenPurpose.RESET)
    db_session.commit()
    token, found_user = find_usable_token(db_session, raw)
    assert found_user.id == user.id

    token.expires_at = utc_now() - timedelta(seconds=1)
    db_session.commit()
    assert find_usable_token(db_session, raw) is None

    token.expires_at = utc_now() + timedelta(hours=1)
    user.is_active = False
    db_session.commit()
    assert find_usable_token(db_session, raw) is None


def test_a_token_can_be_consumed_only_once(db_session, user):
    raw = issue_token(db_session, user, TokenPurpose.INVITE)
    db_session.commit()
    token, _ = find_usable_token(db_session, raw)

    assert consume_token(db_session, token) is True
    assert consume_token(db_session, token) is False
    db_session.commit()
    assert find_usable_token(db_session, raw) is None


def test_invalidate_unused_tokens_by_purpose_or_all(db_session, user):
    invite = issue_token(db_session, user, TokenPurpose.INVITE)
    reset = issue_token(db_session, user, TokenPurpose.RESET)
    invalidate_unused_tokens(db_session, user.id, TokenPurpose.RESET)
    db_session.commit()
    assert find_usable_token(db_session, reset) is None
    assert find_usable_token(db_session, invite) is not None

    invalidate_unused_tokens(db_session, user.id)
    db_session.commit()
    assert find_usable_token(db_session, invite) is None


def test_password_epoch_is_the_utc_seconds_of_a_naive_datetime():
    from datetime import datetime

    assert password_epoch(datetime(2026, 10, 11, 12, 0, 0)) == 1791720000
    assert password_epoch(datetime(2026, 10, 11, 12, 0, 0, 999999)) == 1791720000
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/unit/test_account_emails.py tests/unit/test_email_file_backend.py tests/unit/test_password_policy.py tests/unit/test_user_management_config.py tests/unit/test_user_token_service.py -q
```

Expected: FAIL — collection errors (`ModuleNotFoundError: No module named 'app.services.password_policy'` and the other new modules / names).

- [ ] **Step 3: Implement**

Modify `.gitignore` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -47,3 +47,6 @@ _write_test.txt
 # Real case data - never commit (KVKK)
 data/import/*
 !data/import/README.md
+
+# Mail files written by EMAIL_BACKEND=file
+backend/var/
```

Modify `backend/app/core/config.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/core/config.py
+++ b/backend/app/core/config.py
@@ -93,10 +93,13 @@ class Settings(BaseSettings):
     # Monthly token budget for the sidebar AI usage box. 0 = no budget set.
     ai_monthly_token_budget: int = 0
 
-    # Outgoing e-mail (calendar reminders, test e-mail). "console" only logs
-    # the recipient and subject; "smtp" sends with the stdlib smtplib.
-    # SMTP_PASSWORD is never logged or returned by any endpoint.
-    email_backend: Literal["console", "smtp"] = "console"
+    # Outgoing e-mail (calendar reminders, test e-mail, invitations). "console"
+    # only logs the recipient and subject (invite / reset e-mails also log
+    # their body, so a developer can click the link); "smtp" sends with the
+    # stdlib smtplib; "file" writes every message as an .eml file into
+    # EMAIL_FILE_DIR (used by the E2E tests). SMTP_PASSWORD is never logged or
+    # returned by any endpoint.
+    email_backend: Literal["console", "smtp", "file"] = "console"
     smtp_host: str = ""
     smtp_port: PositiveInt = 587
     smtp_username: str = ""
@@ -104,6 +107,13 @@ class Settings(BaseSettings):
     smtp_use_tls: bool = True
     smtp_from: str = "CaseBridge <no-reply@casebridge.local>"
     smtp_timeout_seconds: PositiveFloat = 10
+    email_file_dir: str = "./var/mail"
+
+    # User management: lifetime of the one-time invite / password reset links
+    # and the frontend address those links point to.
+    invite_token_hours: PositiveInt = 72
+    reset_token_minutes: PositiveInt = 60
+    frontend_base_url: str = "http://localhost:3000"
 
     # Calendar and reminders. Event times are stored as naive local times
     # in APP_TIMEZONE; the reminder worker computes "now" in this zone.
```

Modify `backend/app/core/security.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/core/security.py
+++ b/backend/app/core/security.py
@@ -2,6 +2,7 @@
 
 Never log tokens, passwords, or the JWT secret.
 """
+import calendar
 from datetime import datetime, timedelta, timezone
 from typing import Any, Optional
 
@@ -21,6 +22,13 @@ def verify_password(plain_password: str, hashed_password: str) -> bool:
     return _pwd_context.verify(plain_password, hashed_password)
 
 
+def password_epoch(password_set_at: datetime) -> int:
+    """The value of the JWT "pwd" claim: users.password_set_at (naive UTC) as
+    integer seconds since the epoch. A token only works while it equals the
+    user's current value, so setting a new password ends every older session."""
+    return calendar.timegm(password_set_at.utctimetuple())
+
+
 def create_access_token(subject: str, extra_claims: Optional[dict[str, Any]] = None) -> str:
     now = datetime.now(timezone.utc)
     payload: dict[str, Any] = {
@@ -41,6 +49,7 @@ def decode_access_token(token: str) -> dict[str, Any]:
 __all__ = [
     "hash_password",
     "verify_password",
+    "password_epoch",
     "create_access_token",
     "decode_access_token",
     "JWTError",
```

Modify `backend/app/services/email.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/services/email.py
+++ b/backend/app/services/email.py
@@ -1,16 +1,22 @@
 """Outgoing e-mail.
 
 EMAIL_BACKEND=console only logs the recipient and subject (never the
-body); EMAIL_BACKEND=smtp sends with the stdlib smtplib (STARTTLS when
-SMTP_USE_TLS, login when SMTP_USERNAME is set). SMTP_PASSWORD is never
-logged. Failures raise EmailSendError whose message is only the
-exception type name, so it is safe to store and log.
+body, except for messages that set show_body_in_dev_console - the invite
+and password reset e-mails, whose link a developer needs); EMAIL_BACKEND=smtp
+sends with the stdlib smtplib (STARTTLS when SMTP_USE_TLS, login when
+SMTP_USERNAME is set); EMAIL_BACKEND=file writes each message as its own .eml
+file into EMAIL_FILE_DIR (E2E tests read their links from there).
+SMTP_PASSWORD is never logged. Failures raise EmailSendError whose message is
+only the exception type name, so it is safe to store and log.
 """
 import logging
 import smtplib
 import ssl
+import time
+import uuid
 from dataclasses import dataclass
 from email.message import EmailMessage as MimeMessage
+from pathlib import Path
 from typing import Optional
 
 from app.core.config import settings
@@ -24,6 +30,8 @@ class EmailMessage:
     subject: str
     text: str
     html: Optional[str] = None
+    #: Console backend only: also log the body (invite / reset e-mails).
+    show_body_in_dev_console: bool = False
 
 
 class EmailSendError(Exception):
@@ -41,9 +49,31 @@ def _build_mime(message: EmailMessage) -> MimeMessage:
     return mime
 
 
+def _write_eml(message: EmailMessage) -> None:
+    logger.info("E-posta (file): alıcı=%r konu=%r", message.to, message.subject)
+    try:
+        mime = _build_mime(message)
+        directory = Path(settings.email_file_dir)
+        directory.mkdir(parents=True, exist_ok=True)
+        # Nanosecond timestamp first so the newest message sorts last.
+        path = directory / f"{time.time_ns():020d}-{uuid.uuid4().hex[:8]}.eml"
+        path.write_bytes(bytes(mime))
+    except ValueError as exc:
+        logger.warning("E-posta gönderilemedi: InvalidHeader")
+        raise EmailSendError("InvalidHeader") from exc
+    except OSError as exc:
+        logger.warning("E-posta gönderilemedi: %s", type(exc).__name__)
+        raise EmailSendError(type(exc).__name__) from exc
+
+
 def send_email(message: EmailMessage) -> None:
     if settings.email_backend == "console":
         logger.info("E-posta (console): alıcı=%r konu=%r", message.to, message.subject)
+        if message.show_body_in_dev_console:
+            logger.info("E-posta içeriği (yalnızca konsol modu):\n%s", message.text)
+        return
+    if settings.email_backend == "file":
+        _write_eml(message)
         return
     if not settings.smtp_host:
         raise EmailSendError("SMTPHostMissing")
```

Modify `backend/app/services/notification_content.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/services/notification_content.py
+++ b/backend/app/services/notification_content.py
@@ -1,7 +1,7 @@
 """Turkish e-mail content for notifications (test e-mail, reminders)."""
 from __future__ import annotations
 
-from datetime import date
+from datetime import date, timedelta
 from html import escape
 from typing import TYPE_CHECKING
 
@@ -74,3 +74,64 @@ def build_reminder_email(due: DueReminder, today: date) -> EmailMessage:
         + f'</p><p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
     )
     return EmailMessage(to=due.recipient_email, subject=subject, text=text, html=html)
+
+
+def password_link(token: str) -> str:
+    return f"{settings.frontend_base_url.rstrip('/')}/sifre-belirle?token={token}"
+
+
+def validity_phrase(lifetime: timedelta) -> str:
+    minutes = int(lifetime.total_seconds() // 60)
+    if minutes % 60 == 0:
+        return f"{minutes // 60} saat"
+    return f"{minutes} dakika"
+
+
+def build_invite_email(*, user: User, firm_name: str, inviter_name: str | None, token: str) -> EmailMessage:
+    link = password_link(token)
+    validity = validity_phrase(timedelta(hours=settings.invite_token_hours))
+    if inviter_name:
+        intro = f"{inviter_name} sizi {firm_name} bürosunun CaseBridge çalışma alanına davet etti."
+    else:
+        intro = f"{firm_name} bürosunun CaseBridge çalışma alanına davet edildiniz."
+    expiry = f"Bu bağlantı {validity} geçerlidir ve yalnızca bir kez kullanılabilir."
+    text = (
+        f"Merhaba {user.full_name},\n\n{intro}\n\n"
+        f"Şifrenizi belirleyin: {link}\n\n{expiry}\n\n{FOOTER}\n"
+    )
+    html = (
+        f"<p>Merhaba {escape(user.full_name)},</p><p>{escape(intro)}</p>"
+        f'<p><a href="{escape(link)}">Şifrenizi belirleyin</a></p><p>{escape(expiry)}</p>'
+        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
+    )
+    return EmailMessage(
+        to=user.email,
+        subject=f"CaseBridge davetiniz — {firm_name}",
+        text=text,
+        html=html,
+        show_body_in_dev_console=True,
+    )
+
+
+def build_reset_email(*, user: User, token: str) -> EmailMessage:
+    link = password_link(token)
+    validity = validity_phrase(timedelta(minutes=settings.reset_token_minutes))
+    expiry = f"Bu bağlantı {validity} geçerlidir ve yalnızca bir kez kullanılabilir."
+    ignore = "Bu isteği siz yapmadıysanız dikkate almayın."
+    text = (
+        f"Merhaba {user.full_name},\n\nCaseBridge şifrenizi sıfırlamak için bağlantıyı kullanın.\n\n"
+        f"Şifrenizi belirleyin: {link}\n\n{expiry}\n{ignore}\n\n{FOOTER}\n"
+    )
+    html = (
+        f"<p>Merhaba {escape(user.full_name)},</p>"
+        "<p>CaseBridge şifrenizi sıfırlamak için bağlantıyı kullanın.</p>"
+        f'<p><a href="{escape(link)}">Şifrenizi belirleyin</a></p><p>{escape(expiry)}<br>{escape(ignore)}</p>'
+        f'<p style="color:#6b7280;font-size:12px">{FOOTER}</p>'
+    )
+    return EmailMessage(
+        to=user.email,
+        subject="CaseBridge şifre sıfırlama",
+        text=text,
+        html=html,
+        show_body_in_dev_console=True,
+    )
```

Create `backend/app/services/password_policy.py`:

```python
"""Password rules for choosing or changing a password."""

MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128


class PasswordPolicyError(ValueError):
    """str(exc) is the Turkish message shown to the user."""


def validate_password(password: str, email: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Şifre en az {MIN_PASSWORD_LENGTH} karakter olmalı.")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Şifre en fazla {MAX_PASSWORD_LENGTH} karakter olabilir.")
    if password.casefold() == email.strip().casefold():
        raise PasswordPolicyError("Şifre e-posta adresinizle aynı olamaz.")
```

Create `backend/app/services/user_token_service.py`:

```python
"""One-time invite / password reset tokens.

The token itself (secrets.token_urlsafe(32)) is only ever returned to the
caller that e-mails it; the database keeps its SHA-256 hex digest. Never log
a token.
"""
import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utc_now
from app.models.user import User
from app.models.user_token import TokenPurpose, UserToken

_MAX_RAW_LENGTH = 200


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def token_lifetime(purpose: TokenPurpose) -> timedelta:
    if purpose == TokenPurpose.INVITE:
        return timedelta(hours=settings.invite_token_hours)
    return timedelta(minutes=settings.reset_token_minutes)


def invalidate_unused_tokens(db: Session, user_id: str, purpose: TokenPurpose | None = None) -> None:
    """Marks the user's unused tokens (of one purpose, or all) as used."""
    statement = update(UserToken).where(UserToken.user_id == user_id, UserToken.used_at.is_(None))
    if purpose is not None:
        statement = statement.where(UserToken.purpose == purpose.value)
    db.execute(statement.values(used_at=utc_now()).execution_options(synchronize_session=False))


def issue_token(db: Session, user: User, purpose: TokenPurpose, created_by: str | None = None) -> str:
    """Creates a token for the user and invalidates the earlier unused ones of
    the same purpose. Flushes; the caller commits."""
    invalidate_unused_tokens(db, user.id, purpose)
    raw_token = secrets.token_urlsafe(32)
    now = utc_now()
    db.add(UserToken(
        user_id=user.id,
        law_firm_id=user.law_firm_id,
        purpose=purpose.value,
        token_hash=hash_token(raw_token),
        expires_at=now + token_lifetime(purpose),
        created_by=created_by,
        created_at=now,
    ))
    db.flush()
    return raw_token


def find_usable_token(db: Session, raw_token: str) -> tuple[UserToken, User] | None:
    """The token row and its user when the token exists, is unused, is not
    expired and its user is active; otherwise None (callers answer 410)."""
    if not raw_token or len(raw_token) > _MAX_RAW_LENGTH:
        return None
    token = db.query(UserToken).filter(UserToken.token_hash == hash_token(raw_token)).first()
    if token is None or token.used_at is not None or token.expires_at <= utc_now():
        return None
    user = db.query(User).filter(User.id == token.user_id, User.law_firm_id == token.law_firm_id).first()
    if user is None or not user.is_active:
        return None
    return token, user


def consume_token(db: Session, token: UserToken) -> bool:
    """Marks the token used. False when it was used in the meantime (two
    requests with the same link); the caller then answers 410."""
    result = db.execute(
        update(UserToken)
        .where(UserToken.id == token.id, UserToken.used_at.is_(None))
        .values(used_at=utc_now())
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/unit/test_account_emails.py tests/unit/test_email_file_backend.py tests/unit/test_password_policy.py tests/unit/test_user_management_config.py tests/unit/test_user_token_service.py -q
```

Expected: PASS — 25 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend/app/core/config.py backend/app/core/security.py backend/app/services/email.py backend/app/services/notification_content.py backend/app/services/password_policy.py backend/app/services/user_token_service.py backend/tests/unit/test_account_emails.py backend/tests/unit/test_email_file_backend.py backend/tests/unit/test_password_policy.py backend/tests/unit/test_user_management_config.py backend/tests/unit/test_user_token_service.py
git commit -F - <<'EOF'
feat: token service, password policy, account e-mails and file e-mail backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 3: Password-bound sessions, Turkish login messages and `GET /auth/config`

Sessions become bound to the password (`pwd` claim), a pending user cannot sign in, login messages are Turkish, and the login page can ask whether to show the demo hint.

**Files:**
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/api/routes/auth.py`
- Modify: `backend/app/core/rate_limit.py`
- Modify: `backend/app/repositories/user_repository.py`
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/services/auth_service.py`
- Test (create): `backend/tests/api/test_auth_sessions.py`

**Interfaces:**
- Consumes: `password_epoch()` (Task 2), `User.password_set_at` (Task 1).
- Produces: `rate_limit.is_rate_limited(key: str, max_attempts: int = 5) -> bool`; `UserRepository.get_by_email` is case-insensitive; `AuthService.authenticate` refuses a user whose `password_set_at is None`; `AuthService.issue_token_for(user)` adds `pwd`; `get_current_user` answers 401 for a missing, boolean or mismatching `pwd`; `POST /auth/login` messages `E-posta veya şifre hatalı.` / `Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.`; `GET /auth/config -> AuthConfigOut{demo_mode: bool}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_auth_sessions.py`:

```python
"""Sessions are tied to the password (JWT "pwd" claim); invited users cannot
log in; login messages are Turkish; GET /auth/config is public."""
from datetime import timedelta

from jose import jwt
from sqlalchemy import null

from app.core.config import settings
from app.core.rate_limit import reset_all
from app.core.security import create_access_token, hash_password, password_epoch
from app.models.user import User


def _login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_token_carries_the_password_epoch(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]

    claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert claims["pwd"] == password_epoch(data["user_a"].password_set_at)
    assert client.get("/users/me", headers=_bearer(token)).status_code == 200


def test_token_without_a_pwd_claim_is_rejected(client, two_firms_two_users):
    user = two_firms_two_users["user_a"]
    legacy = create_access_token(subject=user.id, extra_claims={"law_firm_id": user.law_firm_id, "role": "lawyer"})

    assert client.get("/users/me", headers=_bearer(legacy)).status_code == 401


def test_token_with_a_wrong_or_malformed_pwd_claim_is_rejected(client, two_firms_two_users):
    user = two_firms_two_users["user_a"]
    epoch = password_epoch(user.password_set_at)
    for bad in (epoch - 1, epoch + 1, str(epoch), True, None):
        token = create_access_token(subject=user.id, extra_claims={"pwd": bad})
        assert client.get("/users/me", headers=_bearer(token)).status_code == 401, bad


def test_changing_password_set_at_ends_older_sessions(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    assert client.get("/users/me", headers=_bearer(token)).status_code == 200

    user = db_session.get(User, data["user_a"].id)
    user.password_set_at = user.password_set_at + timedelta(seconds=1)
    db_session.commit()

    assert client.get("/users/me", headers=_bearer(token)).status_code == 401
    fresh = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    assert client.get("/users/me", headers=_bearer(fresh)).status_code == 200


def test_user_without_a_password_set_at_cannot_use_a_token(client, db_session, two_firms_two_users):
    user = db_session.get(User, two_firms_two_users["user_a"].id)
    token = create_access_token(subject=user.id, extra_claims={"pwd": password_epoch(user.password_set_at)})
    user.password_set_at = None
    db_session.commit()

    assert client.get("/users/me", headers=_bearer(token)).status_code == 401


def test_invited_user_cannot_log_in_even_with_the_placeholder_password(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    pending = User(
        law_firm_id=data["firm_a"].id, email="davetli@example.com",
        hashed_password=hash_password("placeholder-1234"), full_name="Davetli",
        password_set_at=null(), invited_at=None,
    )
    db_session.add(pending)
    db_session.commit()

    response = _login(client, "davetli@example.com", "placeholder-1234")
    assert response.status_code == 401
    assert response.json()["detail"] == "E-posta veya şifre hatalı."


def test_login_messages_are_turkish(client, two_firms_two_users):
    data = two_firms_two_users
    wrong = _login(client, data["user_a"].email, "yanlis-sifre")
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "E-posta veya şifre hatalı."
    assert _login(client, "kimse@example.com", "x").json()["detail"] == "E-posta veya şifre hatalı."

    reset_all()
    for _ in range(5):
        _login(client, data["user_a"].email, "yanlis-sifre")
    limited = _login(client, data["user_a"].email, "yanlis-sifre")
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin."


def test_login_ignores_the_case_of_the_email(client, two_firms_two_users):
    data = two_firms_two_users
    assert _login(client, data["user_a"].email.upper(), data["password"]).status_code == 200


def test_auth_config_is_public_and_reports_demo_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "seed_demo_data", True)
    assert client.get("/auth/config").json() == {"demo_mode": True}
    monkeypatch.setattr(settings, "seed_demo_data", False)
    assert client.get("/auth/config").json() == {"demo_mode": False}
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_auth_sessions.py -q
```

Expected: FAIL — 9 failures (the token has no `pwd` claim, English login messages, `/auth/config` is 404, pending users are not refused).

- [ ] **Step 3: Implement**

Modify `backend/app/api/deps.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/deps.py
+++ b/backend/app/api/deps.py
@@ -13,7 +13,7 @@ from app.ai.case_intake import UNCONFIGURED_MESSAGE
 from app.ai.errors import AIProviderConfigError
 from app.ai.provider_factory import get_case_intake_provider, get_llm_provider
 from app.ai.providers.base import LLMProvider
-from app.core.security import decode_access_token
+from app.core.security import decode_access_token, password_epoch
 from app.db.session import SessionLocal, get_db
 from app.models.user import User, UserRole
 from app.repositories.user_repository import UserRepository
@@ -47,6 +47,18 @@ def get_current_user(
     user = db.query(User).filter(User.id == user_id).first()
     if user is None or not user.is_active:
         raise _CREDENTIALS_EXCEPTION
+
+    # "pwd" is the password_set_at of the session's login, in whole seconds.
+    # Setting or changing the password moves it, which ends every older
+    # session. Tokens without it (issued before this check existed) and
+    # users who have no password yet are rejected: the user logs in again.
+    pwd = payload.get("pwd")
+    if (
+        user.password_set_at is None
+        or isinstance(pwd, bool)
+        or pwd != password_epoch(user.password_set_at)
+    ):
+        raise _CREDENTIALS_EXCEPTION
     return user
```

Modify `backend/app/api/routes/auth.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/auth.py
+++ b/backend/app/api/routes/auth.py
@@ -2,10 +2,11 @@ from fastapi import APIRouter, Depends, HTTPException, Request, status
 from sqlalchemy.orm import Session
 
 from app.api.deps import get_current_user
+from app.core.config import settings
 from app.core.rate_limit import is_rate_limited, record_attempt
 from app.db.session import get_db
 from app.models.user import User
-from app.schemas.auth import LoginRequest, TokenResponse
+from app.schemas.auth import AuthConfigOut, LoginRequest, TokenResponse
 from app.services.auth_service import AuthService
 
 router = APIRouter(prefix="/auth", tags=["auth"])
@@ -19,7 +20,7 @@ def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)
     if is_rate_limited(limiter_key):
         raise HTTPException(
             status_code=status.HTTP_429_TOO_MANY_REQUESTS,
-            detail="Too many login attempts. Please wait a minute and try again.",
+            detail="Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.",
         )
 
     record_attempt(limiter_key)
@@ -29,12 +30,18 @@ def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)
     if user is None:
         raise HTTPException(
             status_code=status.HTTP_401_UNAUTHORIZED,
-            detail="Invalid email or password",
+            detail="E-posta veya şifre hatalı.",
         )
     token = service.issue_token_for(user)
     return TokenResponse(access_token=token)
 
 
+@router.get("/config", response_model=AuthConfigOut)
+def get_auth_config():
+    """Public: lets the login page show the demo accounts hint."""
+    return AuthConfigOut(demo_mode=settings.seed_demo_data)
+
+
 @router.post("/logout")
 def logout(current_user: User = Depends(get_current_user)):
     # MVP: JWTs are stateless and short-lived; logout is a client-side
```

Modify `backend/app/core/rate_limit.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/core/rate_limit.py
+++ b/backend/app/core/rate_limit.py
@@ -20,16 +20,17 @@ _attempts: dict[str, list[float]] = defaultdict(list)
 _lock = Lock()
 
 
-def is_rate_limited(key: str) -> bool:
-    """Returns True if `key` has already made >= _MAX_ATTEMPTS login
-    attempts within the current sliding window. Does NOT record this
-    call as an attempt - call record_attempt() separately once the
-    request is actually being processed."""
+def is_rate_limited(key: str, max_attempts: int = _MAX_ATTEMPTS) -> bool:
+    """Returns True if `key` has already made >= max_attempts attempts
+    (default 5, the login limit) within the current sliding window. Does
+    NOT record this call as an attempt - call record_attempt() separately
+    once the request is actually being processed. Keys of different
+    endpoints must differ (e.g. a "forgot:" prefix)."""
     now = time.monotonic()
     with _lock:
         recent = [t for t in _attempts[key] if now - t < _WINDOW_SECONDS]
         _attempts[key] = recent
-        return len(recent) >= _MAX_ATTEMPTS
+        return len(recent) >= max_attempts
 
 
 def record_attempt(key: str) -> None:
```

Modify `backend/app/repositories/user_repository.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/repositories/user_repository.py
+++ b/backend/app/repositories/user_repository.py
@@ -6,6 +6,7 @@ its id. This is the pattern later Case/Document repositories follow.
 """
 from typing import Optional
 
+from sqlalchemy import func
 from sqlalchemy.orm import Session
 
 from app.models.user import User
@@ -16,7 +17,9 @@ class UserRepository:
         self.db = db
 
     def get_by_email(self, email: str) -> Optional[User]:
-        return self.db.query(User).filter(User.email == email).first()
+        """Case-insensitive: e-mail addresses are stored lower-case, but older
+        rows may not be."""
+        return self.db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
 
     def get_by_id_in_firm(self, user_id: str, law_firm_id: str) -> Optional[User]:
         return (
```

Modify `backend/app/schemas/auth.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/schemas/auth.py
+++ b/backend/app/schemas/auth.py
@@ -9,3 +9,7 @@ class LoginRequest(BaseModel):
 class TokenResponse(BaseModel):
     access_token: str
     token_type: str = "bearer"
+
+
+class AuthConfigOut(BaseModel):
+    demo_mode: bool
```

Modify `backend/app/services/auth_service.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/services/auth_service.py
+++ b/backend/app/services/auth_service.py
@@ -2,7 +2,7 @@ from typing import Optional
 
 from sqlalchemy.orm import Session
 
-from app.core.security import create_access_token, verify_password
+from app.core.security import create_access_token, password_epoch, verify_password
 from app.models.user import User
 from app.repositories.user_repository import UserRepository
 
@@ -14,14 +14,23 @@ class AuthService:
 
     def authenticate(self, email: str, password: str) -> Optional[User]:
         user = self.users.get_by_email(email)
-        if user is None or not user.is_active:
+        # Invited users have no password yet (password_set_at is NULL): their
+        # placeholder hash must never be usable, whatever is typed.
+        if user is None or not user.is_active or user.password_set_at is None:
             return None
         if not verify_password(password, user.hashed_password):
             return None
         return user
 
     def issue_token_for(self, user: User) -> str:
+        """"pwd" ties the token to the current password: see get_current_user."""
+        if user.password_set_at is None:
+            raise ValueError("A user without a password cannot get a token")
         return create_access_token(
             subject=user.id,
-            extra_claims={"law_firm_id": user.law_firm_id, "role": user.role.value},
+            extra_claims={
+                "law_firm_id": user.law_firm_id,
+                "role": user.role.value,
+                "pwd": password_epoch(user.password_set_at),
+            },
         )
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_auth_sessions.py -q
```

Expected: PASS — 9 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/deps.py backend/app/api/routes/auth.py backend/app/core/rate_limit.py backend/app/repositories/user_repository.py backend/app/schemas/auth.py backend/app/services/auth_service.py backend/tests/api/test_auth_sessions.py
git commit -F - <<'EOF'
feat: password-bound sessions, Turkish login messages and GET /auth/config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 4: Forgot-password, token-info, set-password and change-password endpoints

The four password endpoints plus the test fixtures (`MailOutbox`, `mail_outbox`) that read the `.eml` files a test caused.

**Files:**
- Create: `backend/app/services/account_service.py`
- Modify: `backend/app/api/routes/auth.py`
- Modify: `backend/app/schemas/auth.py`
- Test (create): `backend/tests/api/test_password_flows.py`
- Test (modify): `backend/tests/conftest.py`

**Interfaces:**
- Consumes: Tasks 1–3 (`issue_token`, `find_usable_token`, `consume_token`, `validate_password`, `build_reset_email`, `send_email` file backend, `is_rate_limited`, `password_epoch`).
- Produces: `account_service.next_password_set_at(previous: datetime | None) -> datetime` (strictly later than `previous`), `apply_new_password(db, user, new_password) -> None` (hash, move `password_set_at`, invalidate unused tokens; caller commits), `deliver(message: EmailMessage) -> bool` (never raises; logs the error type only), `prepare_reset_email(db, user, created_by: str | None) -> EmailMessage` (commits the token); endpoints `POST /auth/forgot-password` (202, e-mail as a `BackgroundTask`, limit 3 per `forgot:{ip}:{email}`, 429 `Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.`), `GET /auth/token-info`, `POST /auth/set-password` (returns `TokenResponse`), `POST /auth/change-password` (limit 5 per `change-password:{user.id}`, 429 `Çok fazla deneme. Lütfen bir dakika sonra tekrar deneyin.`, 400 `Mevcut şifre hatalı.`, policy errors 422 with the policy message); fixtures `mail_outbox` (switches the app to the file backend in a temp directory) with `MailOutbox.messages(to=None)` and `MailOutbox.latest_token(to) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_password_flows.py`:

```python
"""forgot-password, token-info, set-password and change-password."""
from datetime import timedelta

import pytest
from jose import jwt
from sqlalchemy import null

from app.core.config import settings
from app.core.rate_limit import reset_all
from app.core.security import hash_password, password_epoch, verify_password
from app.core.timeutil import utc_now
from app.models.user import User
from app.models.user_token import TokenPurpose, UserToken
from app.services.user_token_service import hash_token, issue_token

LINK_GONE = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış."
FORGOT_OK = "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi."
NEW_PASSWORD = "yeni-guclu-sifre"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


@pytest.fixture()
def pending_user(db_session, two_firms_two_users):
    user = User(
        law_firm_id=two_firms_two_users["firm_a"].id, email="davetli@example.com",
        hashed_password=hash_password("placeholder-not-usable"), full_name="Davetli Avukat",
        password_set_at=null(), invited_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    return user


# --- forgot-password --------------------------------------------------------

def test_forgot_password_sends_a_reset_link_to_an_active_user(client, mail_outbox, two_firms_two_users):
    user = two_firms_two_users["user_a"]
    response = client.post("/auth/forgot-password", json={"email": user.email.upper()})

    assert response.status_code == 202
    assert response.json() == {"message": FORGOT_OK}
    [message] = mail_outbox.messages(user.email)
    assert message["Subject"] == "CaseBridge şifre sıfırlama"
    assert mail_outbox.latest_token(user.email)


def test_forgot_password_answers_the_same_and_sends_nothing_for_other_addresses(
    client, db_session, mail_outbox, two_firms_two_users, pending_user
):
    inactive = db_session.get(User, two_firms_two_users["user_b"].id)
    inactive.is_active = False
    db_session.commit()

    for email in ("nobody@example.com", pending_user.email, inactive.email):
        response = client.post("/auth/forgot-password", json={"email": email})
        assert response.status_code == 202
        assert response.json() == {"message": FORGOT_OK}
    assert mail_outbox.messages() == []
    assert db_session.query(UserToken).count() == 0


def test_forgot_password_is_limited_to_three_requests_per_address_and_ip(client, mail_outbox, two_firms_two_users):
    email = two_firms_two_users["user_a"].email
    for _ in range(3):
        assert client.post("/auth/forgot-password", json={"email": email}).status_code == 202

    limited = client.post("/auth/forgot-password", json={"email": email})
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin."
    assert client.post("/auth/forgot-password", json={"email": "other@example.com"}).status_code == 202
    assert len(mail_outbox.messages(email)) == 3


def test_forgot_password_ignores_a_failing_mail_backend(client, monkeypatch, two_firms_two_users, tmp_path):
    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))

    response = client.post("/auth/forgot-password", json={"email": two_firms_two_users["user_a"].email})
    assert response.status_code == 202


# --- token-info --------------------------------------------------------------

def test_token_info_describes_a_valid_link(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()

    response = client.get("/auth/token-info", params={"token": raw})
    assert response.status_code == 200
    assert response.json() == {"purpose": "invite", "email": "davetli@example.com", "full_name": "Davetli Avukat"}


def test_token_info_is_410_for_unknown_expired_used_and_inactive_links(client, db_session, pending_user):
    assert client.get("/auth/token-info", params={"token": "bilinmeyen"}).status_code == 410
    assert client.get("/auth/token-info").status_code == 410

    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()
    row = db_session.query(UserToken).filter_by(token_hash=hash_token(raw)).one()

    row.expires_at = utc_now() - timedelta(seconds=1)
    db_session.commit()
    gone = client.get("/auth/token-info", params={"token": raw})
    assert gone.status_code == 410
    assert gone.json()["detail"] == LINK_GONE

    row.expires_at = utc_now() + timedelta(hours=1)
    row.used_at = utc_now()
    db_session.commit()
    assert client.get("/auth/token-info", params={"token": raw}).status_code == 410

    row.used_at = None
    pending_user.is_active = False
    db_session.commit()
    assert client.get("/auth/token-info", params={"token": raw}).status_code == 410


# --- set-password ------------------------------------------------------------

def test_set_password_with_an_invite_sets_the_password_and_logs_in(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()

    response = client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD})
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert client.get("/users/me", headers=_bearer(token)).json()["email"] == "davetli@example.com"

    db_session.refresh(pending_user)
    assert pending_user.password_set_at is not None and pending_user.status.value == "active"
    assert verify_password(NEW_PASSWORD, pending_user.hashed_password)
    claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert claims["pwd"] == password_epoch(pending_user.password_set_at)
    assert _login(client, "davetli@example.com", NEW_PASSWORD).status_code == 200


def test_a_link_works_only_once(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()

    assert client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).status_code == 200
    again = client.post("/auth/set-password", json={"token": raw, "password": "baska-bir-sifre-1"})
    assert again.status_code == 410
    assert again.json()["detail"] == LINK_GONE


def test_set_password_with_a_reset_link_ends_the_older_sessions(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    old_token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    raw = issue_token(db_session, data["user_a"], TokenPurpose.RESET)
    db_session.commit()

    new_token = client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).json()["access_token"]

    assert client.get("/users/me", headers=_bearer(old_token)).status_code == 401
    assert client.get("/users/me", headers=_bearer(new_token)).status_code == 200
    assert _login(client, data["user_a"].email, data["password"]).status_code == 401


def test_set_password_invalidates_the_users_other_unused_links(client, db_session, pending_user):
    invite = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    reset = issue_token(db_session, pending_user, TokenPurpose.RESET)
    db_session.commit()

    assert client.post("/auth/set-password", json={"token": invite, "password": NEW_PASSWORD}).status_code == 200
    assert client.post("/auth/set-password", json={"token": reset, "password": "baska-bir-sifre-1"}).status_code == 410


def test_set_password_rejects_bad_links_and_keeps_the_link_after_a_rule_violation(client, db_session, pending_user):
    assert client.post("/auth/set-password", json={"token": "bilinmeyen", "password": NEW_PASSWORD}).status_code == 410

    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    db_session.commit()
    short = client.post("/auth/set-password", json={"token": raw, "password": "kisa"})
    assert short.status_code == 422
    assert short.json()["detail"] == "Şifre en az 10 karakter olmalı."
    same = client.post("/auth/set-password", json={"token": raw, "password": pending_user.email})
    assert same.status_code == 422
    assert same.json()["detail"] == "Şifre e-posta adresinizle aynı olamaz."
    db_session.refresh(pending_user)
    assert pending_user.password_set_at is None

    assert client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).status_code == 200


def test_set_password_is_410_for_an_inactive_user(client, db_session, pending_user):
    raw = issue_token(db_session, pending_user, TokenPurpose.INVITE)
    pending_user.is_active = False
    db_session.commit()

    assert client.post("/auth/set-password", json={"token": raw, "password": NEW_PASSWORD}).status_code == 410


# --- change-password ---------------------------------------------------------

def test_change_password_returns_a_new_token_and_ends_other_sessions(client, db_session, two_firms_two_users):
    data = two_firms_two_users
    first = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    other_device = _login(client, data["user_a"].email, data["password"]).json()["access_token"]

    response = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": NEW_PASSWORD},
        headers=_bearer(first),
    )
    assert response.status_code == 200
    fresh = response.json()["access_token"]

    assert client.get("/users/me", headers=_bearer(fresh)).status_code == 200
    assert client.get("/users/me", headers=_bearer(first)).status_code == 401
    assert client.get("/users/me", headers=_bearer(other_device)).status_code == 401
    assert _login(client, data["user_a"].email, data["password"]).status_code == 401
    assert _login(client, data["user_a"].email, NEW_PASSWORD).status_code == 200


def test_two_password_changes_within_one_second_still_end_the_older_session(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    second = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": NEW_PASSWORD},
        headers=_bearer(token),
    ).json()["access_token"]
    third = client.post(
        "/auth/change-password",
        json={"current_password": NEW_PASSWORD, "new_password": "ucuncu-sifre-123"},
        headers=_bearer(second),
    )
    assert third.status_code == 200
    assert client.get("/users/me", headers=_bearer(second)).status_code == 401


def test_change_password_rejects_a_wrong_current_password(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]

    response = client.post(
        "/auth/change-password",
        json={"current_password": "yanlis-sifre-1", "new_password": NEW_PASSWORD},
        headers=_bearer(token),
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Mevcut şifre hatalı."
    assert client.get("/users/me", headers=_bearer(token)).status_code == 200


def test_change_password_applies_the_password_rules(client, two_firms_two_users):
    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    headers = _bearer(token)

    short = client.post("/auth/change-password", json={"current_password": data["password"], "new_password": "kisa"}, headers=headers)
    assert (short.status_code, short.json()["detail"]) == (422, "Şifre en az 10 karakter olmalı.")
    same = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": data["user_a"].email},
        headers=headers,
    )
    assert (same.status_code, same.json()["detail"]) == (422, "Şifre e-posta adresinizle aynı olamaz.")


def test_change_password_requires_login_and_limits_wrong_guesses(client, two_firms_two_users):
    assert client.post("/auth/change-password", json={"current_password": "a", "new_password": "b"}).status_code == 401

    data = two_firms_two_users
    token = _login(client, data["user_a"].email, data["password"]).json()["access_token"]
    reset_all()
    for _ in range(5):
        wrong = client.post(
            "/auth/change-password",
            json={"current_password": "yanlis-sifre-1", "new_password": NEW_PASSWORD},
            headers=_bearer(token),
        )
        assert wrong.status_code == 400
    limited = client.post(
        "/auth/change-password",
        json={"current_password": data["password"], "new_password": NEW_PASSWORD},
        headers=_bearer(token),
    )
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Çok fazla deneme. Lütfen bir dakika sonra tekrar deneyin."
```

Modify `backend/tests/conftest.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/tests/conftest.py
+++ b/backend/tests/conftest.py
@@ -125,3 +125,42 @@ def two_firms_two_users(db_session):
         "user_b": user_b,
         "password": "password123",
     }
+
+
+class MailOutbox:
+    """The .eml files written by EMAIL_BACKEND=file during a test."""
+
+    def __init__(self, directory):
+        self.directory = directory
+
+    def messages(self, to=None):
+        from email import policy
+        from email.parser import BytesParser
+
+        parsed = [
+            BytesParser(policy=policy.default).parsebytes(path.read_bytes())
+            for path in sorted(self.directory.glob("*.eml"))
+        ] if self.directory.exists() else []
+        return [m for m in parsed if to is None or m["To"] == to]
+
+    def latest_token(self, to):
+        """The token in the newest link e-mailed to `to`."""
+        import re
+
+        messages = self.messages(to)
+        assert messages, f"no e-mail was sent to {to}"
+        body = messages[-1].get_body(preferencelist=("plain",)).get_content()
+        match = re.search(r"/sifre-belirle\?token=([A-Za-z0-9_-]+)", body)
+        assert match, body
+        return match.group(1)
+
+
+@pytest.fixture()
+def mail_outbox(tmp_path, monkeypatch):
+    """Switches the e-mail backend to files in a temp directory."""
+    from app.core.config import settings
+
+    directory = tmp_path / "outbox"
+    monkeypatch.setattr(settings, "email_backend", "file")
+    monkeypatch.setattr(settings, "email_file_dir", str(directory))
+    return MailOutbox(directory)
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_password_flows.py -q
```

Expected: FAIL — 17 failures (`404` for the four new routes).

- [ ] **Step 3: Implement**

Modify `backend/app/api/routes/auth.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/auth.py
+++ b/backend/app/api/routes/auth.py
@@ -1,13 +1,31 @@
-from fastapi import APIRouter, Depends, HTTPException, Request, status
+from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
 from sqlalchemy.orm import Session
 
 from app.api.deps import get_current_user
 from app.core.config import settings
 from app.core.rate_limit import is_rate_limited, record_attempt
+from app.core.security import verify_password
 from app.db.session import get_db
 from app.models.user import User
-from app.schemas.auth import AuthConfigOut, LoginRequest, TokenResponse
+from app.repositories.user_repository import UserRepository
+from app.schemas.auth import (
+    AuthConfigOut,
+    ChangePasswordRequest,
+    ForgotPasswordRequest,
+    LoginRequest,
+    MessageOut,
+    SetPasswordRequest,
+    TokenInfoOut,
+    TokenResponse,
+)
+from app.services.account_service import apply_new_password, deliver, prepare_reset_email
 from app.services.auth_service import AuthService
+from app.services.password_policy import PasswordPolicyError, validate_password
+from app.services.user_token_service import consume_token, find_usable_token
+
+LINK_INVALID = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış."
+FORGOT_PASSWORD_MESSAGE = "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi."
+FORGOT_PASSWORD_LIMIT = 3
 
 router = APIRouter(prefix="/auth", tags=["auth"])
 
@@ -49,3 +67,81 @@ def logout(current_user: User = Depends(get_current_user)):
     # contract and so we can add server-side revocation later without
     # a breaking API change.
     return {"status": "logged_out"}
+
+
+@router.post("/forgot-password", response_model=MessageOut, status_code=status.HTTP_202_ACCEPTED)
+def forgot_password(
+    payload: ForgotPasswordRequest,
+    request: Request,
+    background_tasks: BackgroundTasks,
+    db: Session = Depends(get_db),
+):
+    """Always answers the same, whether or not the address is registered. The
+    e-mail is sent after the response so timing does not give it away either."""
+    client_ip = request.client.host if request.client else "unknown"
+    limiter_key = f"forgot:{client_ip}:{payload.email.lower()}"
+    if is_rate_limited(limiter_key, FORGOT_PASSWORD_LIMIT):
+        raise HTTPException(
+            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
+            detail="Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.",
+        )
+    record_attempt(limiter_key)
+
+    user = UserRepository(db).get_by_email(payload.email)
+    if user is not None and user.is_active and user.password_set_at is not None:
+        background_tasks.add_task(deliver, prepare_reset_email(db, user, created_by=None))
+    return MessageOut(message=FORGOT_PASSWORD_MESSAGE)
+
+
+@router.get("/token-info", response_model=TokenInfoOut)
+def token_info(token: str = Query(default=""), db: Session = Depends(get_db)):
+    found = find_usable_token(db, token)
+    if found is None:
+        raise HTTPException(status_code=status.HTTP_410_GONE, detail=LINK_INVALID)
+    row, user = found
+    return TokenInfoOut(purpose=row.purpose, email=user.email, full_name=user.full_name)
+
+
+@router.post("/set-password", response_model=TokenResponse)
+def set_password(payload: SetPasswordRequest, db: Session = Depends(get_db)):
+    """Chooses the password with an invite or reset link, then logs in."""
+    found = find_usable_token(db, payload.token)
+    if found is None:
+        raise HTTPException(status_code=status.HTTP_410_GONE, detail=LINK_INVALID)
+    row, user = found
+    try:
+        validate_password(payload.password, user.email)
+    except PasswordPolicyError as exc:
+        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
+    if not consume_token(db, row):
+        db.rollback()
+        raise HTTPException(status_code=status.HTTP_410_GONE, detail=LINK_INVALID)
+    apply_new_password(db, user, payload.password)
+    db.commit()
+    return TokenResponse(access_token=AuthService(db).issue_token_for(user))
+
+
+@router.post("/change-password", response_model=TokenResponse)
+def change_password(
+    payload: ChangePasswordRequest,
+    current_user: User = Depends(get_current_user),
+    db: Session = Depends(get_db),
+):
+    """Returns a new token: the password change ends all other sessions."""
+    limiter_key = f"change-password:{current_user.id}"
+    if is_rate_limited(limiter_key):
+        raise HTTPException(
+            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
+            detail="Çok fazla deneme. Lütfen bir dakika sonra tekrar deneyin.",
+        )
+    record_attempt(limiter_key)
+
+    if not verify_password(payload.current_password, current_user.hashed_password):
+        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mevcut şifre hatalı.")
+    try:
+        validate_password(payload.new_password, current_user.email)
+    except PasswordPolicyError as exc:
+        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
+    apply_new_password(db, current_user, payload.new_password)
+    db.commit()
+    return TokenResponse(access_token=AuthService(db).issue_token_for(current_user))
```

Modify `backend/app/schemas/auth.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/schemas/auth.py
+++ b/backend/app/schemas/auth.py
@@ -13,3 +13,27 @@ class TokenResponse(BaseModel):
 
 class AuthConfigOut(BaseModel):
     demo_mode: bool
+
+
+class ForgotPasswordRequest(BaseModel):
+    email: EmailStr
+
+
+class MessageOut(BaseModel):
+    message: str
+
+
+class TokenInfoOut(BaseModel):
+    purpose: str
+    email: str
+    full_name: str
+
+
+class SetPasswordRequest(BaseModel):
+    token: str
+    password: str
+
+
+class ChangePasswordRequest(BaseModel):
+    current_password: str
+    new_password: str
```

Create `backend/app/services/account_service.py`:

```python
"""Account-level operations shared by the auth and admin routes: choosing a
password and e-mailing one-time links."""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.user import User
from app.models.user_token import TokenPurpose
from app.services.email import EmailMessage, EmailSendError, send_email
from app.services.notification_content import build_reset_email
from app.services.user_token_service import invalidate_unused_tokens, issue_token

logger = logging.getLogger("casebridge")


def next_password_set_at(previous: datetime | None) -> datetime:
    """Now in whole seconds, but always later than the previous value, so two
    password changes within the same second still end the older sessions."""
    now = utc_now().replace(microsecond=0)
    if previous is not None and now <= previous.replace(microsecond=0):
        return previous.replace(microsecond=0) + timedelta(seconds=1)
    return now


def apply_new_password(db: Session, user: User, new_password: str) -> None:
    """Stores the new password, moves password_set_at (which ends every older
    session) and invalidates the user's unused links. The caller commits."""
    user.hashed_password = hash_password(new_password)
    user.password_set_at = next_password_set_at(user.password_set_at)
    invalidate_unused_tokens(db, user.id)


def deliver(message: EmailMessage) -> bool:
    """Sends the message; False (never an exception) when sending fails. The
    log line carries the error type only - no address, link or token."""
    try:
        send_email(message)
    except EmailSendError as exc:
        logger.warning("Hesap e-postası gönderilemedi: %s", exc)
        return False
    return True


def prepare_reset_email(db: Session, user: User, created_by: str | None) -> EmailMessage:
    """Issues a reset token (committed) and returns the e-mail to send."""
    token = issue_token(db, user, TokenPurpose.RESET, created_by=created_by)
    db.commit()
    return build_reset_email(user=user, token=token)
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_password_flows.py -q
```

Expected: PASS — 17 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/auth.py backend/app/schemas/auth.py backend/app/services/account_service.py backend/tests/api/test_password_flows.py backend/tests/conftest.py
git commit -F - <<'EOF'
feat: forgot-password, token-info, set-password and change-password endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 5: Admin user management (create, edit, invite, password reset) and assignable-user lists

The administrator's `/admin/users` API and the rule that pending and inactive users are not offered as lawyers. Also adds the `office` / `auth_headers` fixtures (two firms) that the next tasks reuse.

**Files:**
- Create: `backend/app/api/routes/admin_users.py`
- Create: `backend/app/schemas/admin_user.py`
- Create: `backend/app/services/user_admin_service.py`
- Modify: `backend/app/api/routes/admin.py`
- Modify: `backend/app/api/routes/cases.py`
- Modify: `backend/app/api/routes/users.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/repositories/user_repository.py`
- Modify: `backend/app/services/account_service.py`
- Modify: `backend/app/services/analytics_service.py`
- Test (create): `backend/tests/api/test_admin_users.py`
- Test (modify): `backend/tests/conftest.py`

**Interfaces:**
- Consumes: Tasks 1–4 (`issue_token`, `build_invite_email`, `deliver`, `next_password_set_at`, `get_current_admin`).
- Produces: `app/schemas/admin_user.py` (`AdminUserOut`, `AdminUserWithEmailOut` = `AdminUserOut` + `email_sent: bool`, `EmailSentOut{email_sent}`, `AdminUserCreate`, `AdminUserUpdate`); `user_admin_service`: `UserAdminError(status_code: int, detail: str)`, `get_user_in_firm(db, law_firm_id, user_id) -> User` (404 `Kullanıcı bulunamadı`), `list_firm_users`, `count_other_active_admins`, `ensure_not_last_admin(db, user)`, `create_pending_user(db, law_firm_id, data) -> User`, `update_user(db, admin, user, data) -> User`; `account_service.prepare_invite_email(db, user, inviter: User | None) -> EmailMessage`; routes `GET/POST /admin/users`, `PATCH /admin/users/{id}`, `POST /admin/users/{id}/invite` (inactive user → 409 `Pasif kullanıcıya davet gönderilemez. Önce kullanıcıyı aktifleştirin.`), `POST /admin/users/{id}/password-reset` (not active + password set → 409 `Şifre sıfırlama bağlantısı yalnızca aktif ve şifresini belirlemiş kullanıcılara gönderilebilir.`); pending/inactive exclusions in `GET /admin/lawyers`, admin case/precedent assignment, `POST /cases` `assigned_lawyer_id`, `GET /users` (`UserRepository.list_in_firm`) and the by-lawyer analytics; conftest fixtures `office` (firm A: `admin_a`, `lawyer_a1`, `lawyer_a2`; firm B: `admin_b`, `lawyer_b`; `office.password == "password123"`) and `auth_headers(user) -> dict`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_admin_users.py`:

```python
"""/admin/users: list, create (invite), edit, resend invite, password reset,
admin guards, firm isolation and the assignable-user lists."""
import pytest
from sqlalchemy import null

from app.core.config import settings
from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.case import Case, CaseType
from app.models.user import User, UserRole
from app.models.user_token import UserToken

NEW_USER = {"email": "Yeni.Avukat@Example.com", "full_name": "  Yeni   Avukat ", "department": "İş Hukuku", "role": "lawyer"}


def _pending(db_session, firm, email="beklemede@example.com", role=UserRole.LAWYER, name="Bekleyen Avukat"):
    user = User(
        law_firm_id=firm.id, email=email, hashed_password=hash_password("placeholder-1234"),
        full_name=name, role=role, password_set_at=null(), invited_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    return user


# --- access ----------------------------------------------------------------------------

def test_only_admins_can_use_the_user_endpoints(client, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    other = office.lawyer_a2.id
    calls = [
        ("get", "/admin/users", None),
        ("post", "/admin/users", NEW_USER),
        ("patch", f"/admin/users/{other}", {"full_name": "X"}),
        ("post", f"/admin/users/{other}/invite", None),
        ("post", f"/admin/users/{other}/password-reset", None),
    ]
    for method, path, body in calls:
        kwargs = {"json": body} if body else {}
        assert getattr(client, method)(path, headers=lawyer, **kwargs).status_code == 403, (method, path)
        assert getattr(client, method)(path, **kwargs).status_code == 401, (method, path)


# --- list --------------------------------------------------------------------------------

def test_list_returns_every_user_of_the_firm_with_a_derived_status(client, db_session, office, auth_headers):
    pending = _pending(db_session, office.firm_a)
    office.lawyer_a2.is_active = False
    db_session.commit()

    rows = client.get("/admin/users", headers=auth_headers(office.admin_a)).json()

    assert {row["email"]: row["status"] for row in rows} == {
        office.admin_a.email: "active",
        office.lawyer_a1.email: "active",
        office.lawyer_a2.email: "inactive",
        pending.email: "pending",
    }
    row = next(r for r in rows if r["email"] == pending.email)
    assert set(row) == {
        "id", "email", "full_name", "department", "role", "is_active", "status",
        "invited_at", "password_set_at", "created_at",
    }
    assert row["password_set_at"] is None and row["invited_at"] is not None
    assert "hashed_password" not in row


# --- create ------------------------------------------------------------------------------

def test_create_user_makes_a_pending_user_and_e_mails_an_invite(client, db_session, office, auth_headers, mail_outbox):
    response = client.post("/admin/users", json=NEW_USER, headers=auth_headers(office.admin_a))

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "yeni.avukat@example.com"
    assert body["full_name"] == "Yeni Avukat"
    assert (body["department"], body["role"], body["status"], body["email_sent"]) == ("İş Hukuku", "lawyer", "pending", True)
    assert body["password_set_at"] is None and body["invited_at"] is not None

    user = db_session.query(User).filter_by(email="yeni.avukat@example.com").one()
    assert user.law_firm_id == office.firm_a.id and user.password_set_at is None
    [message] = mail_outbox.messages("yeni.avukat@example.com")
    assert message["Subject"] == "CaseBridge davetiniz — Demir Hukuk"
    assert "Yönetici A sizi Demir Hukuk bürosunun" in message.get_body(preferencelist=("plain",)).get_content()
    token = mail_outbox.latest_token("yeni.avukat@example.com")

    invited_login = client.post("/auth/login", json={"email": "yeni.avukat@example.com", "password": "anything-at-all"})
    assert invited_login.status_code == 401
    assert client.post("/auth/set-password", json={"token": token, "password": "secilen-sifre-123"}).status_code == 200


def test_create_user_rejects_a_taken_email_in_any_firm_and_case(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    for email in (office.lawyer_a1.email, office.lawyer_b.email.upper()):
        response = client.post("/admin/users", json={**NEW_USER, "email": email}, headers=headers)
        assert response.status_code == 409
        assert response.json()["detail"] == "Bu e-posta adresi zaten kayıtlı."


def test_create_user_reports_a_failed_invite_e_mail_but_still_creates_the_user(
    client, db_session, office, auth_headers, monkeypatch, tmp_path
):
    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))

    response = client.post("/admin/users", json=NEW_USER, headers=auth_headers(office.admin_a))

    assert response.status_code == 201
    assert response.json()["email_sent"] is False
    assert db_session.query(User).filter_by(email="yeni.avukat@example.com").count() == 1
    assert db_session.query(UserToken).count() == 1


def test_create_user_validates_input(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    assert client.post("/admin/users", json={**NEW_USER, "email": "not-an-email"}, headers=headers).status_code == 422
    assert client.post("/admin/users", json={**NEW_USER, "full_name": "   "}, headers=headers).status_code == 422
    assert client.post("/admin/users", json={**NEW_USER, "role": "owner"}, headers=headers).status_code == 422
    assert client.post("/admin/users", json={**NEW_USER, "department": "x" * 101}, headers=headers).status_code == 422
    blank = client.post("/admin/users", json={**NEW_USER, "department": "  "}, headers=headers)
    assert blank.status_code == 201 and blank.json()["department"] is None


# --- edit --------------------------------------------------------------------------------

def test_edit_changes_name_department_role_and_email(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    response = client.patch(
        f"/admin/users/{office.lawyer_a1.id}",
        json={"full_name": "Ayşe Yılmaz", "department": "Kira Hukuku", "role": "admin", "email": "AYSE.YILMAZ@example.com"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["full_name"], body["department"], body["role"], body["email"]) == (
        "Ayşe Yılmaz", "Kira Hukuku", "admin", "ayse.yilmaz@example.com",
    )

    cleared = client.patch(f"/admin/users/{office.lawyer_a1.id}", json={"department": None}, headers=headers)
    assert cleared.json()["department"] is None and cleared.json()["full_name"] == "Ayşe Yılmaz"


def test_edit_rejects_null_required_fields_and_taken_emails(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    path = f"/admin/users/{office.lawyer_a1.id}"
    for body in ({"full_name": None}, {"role": None}, {"email": None}, {"full_name": " "}):
        assert client.patch(path, json=body, headers=headers).status_code == 422, body
    taken = client.patch(path, json={"email": office.lawyer_a2.email}, headers=headers)
    assert taken.status_code == 409 and taken.json()["detail"] == "Bu e-posta adresi zaten kayıtlı."
    assert client.patch(path, json={"email": office.lawyer_a1.email.upper()}, headers=headers).status_code == 200


def test_an_admin_cannot_change_their_own_role(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    response = client.patch(f"/admin/users/{office.admin_a.id}", json={"role": "lawyer"}, headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"] == "Kendi rolünüzü değiştiremezsiniz."
    assert client.patch(f"/admin/users/{office.admin_a.id}", json={"role": "admin", "full_name": "Yeni Ad"}, headers=headers).status_code == 200


def test_the_last_active_admin_cannot_be_demoted(db_session, office):
    from app.services.user_admin_service import UserAdminError, count_other_active_admins, ensure_not_last_admin

    assert count_other_active_admins(db_session, office.firm_a.id, office.admin_a.id) == 0
    with pytest.raises(UserAdminError) as error:
        ensure_not_last_admin(db_session, office.admin_a)
    assert (error.value.status_code, error.value.detail) == (409, "Büroda en az bir aktif yönetici kalmalı.")

    second = _pending(db_session, office.firm_a, email="yonetici2@example.com", role=UserRole.ADMIN)
    assert count_other_active_admins(db_session, office.firm_a.id, office.admin_a.id) == 0  # still pending
    second.password_set_at = utc_now()
    db_session.commit()
    assert count_other_active_admins(db_session, office.firm_a.id, office.admin_a.id) == 1
    ensure_not_last_admin(db_session, office.admin_a)


def test_demoting_another_admin_works_while_an_admin_remains(client, db_session, office, auth_headers):
    second = User(
        law_firm_id=office.firm_a.id, email="yonetici2@example.com", hashed_password=hash_password("x"),
        full_name="İkinci Yönetici", role=UserRole.ADMIN,
    )
    db_session.add(second)
    db_session.commit()

    response = client.patch(f"/admin/users/{second.id}", json={"role": "lawyer"}, headers=auth_headers(office.admin_a))
    assert response.status_code == 200 and response.json()["role"] == "lawyer"


def test_changing_a_pending_users_email_invalidates_the_old_link(client, db_session, office, auth_headers, mail_outbox):
    headers = auth_headers(office.admin_a)
    created = client.post("/admin/users", json=NEW_USER, headers=headers).json()
    old_token = mail_outbox.latest_token("yeni.avukat@example.com")

    client.patch(f"/admin/users/{created['id']}", json={"email": "baska@example.com"}, headers=headers)

    assert client.get("/auth/token-info", params={"token": old_token}).status_code == 410
    client.post(f"/admin/users/{created['id']}/invite", headers=headers)
    new_token = mail_outbox.latest_token("baska@example.com")
    assert client.get("/auth/token-info", params={"token": new_token}).json()["email"] == "baska@example.com"


# --- resend invite -----------------------------------------------------------------------

def test_resend_invite_replaces_the_old_link(client, db_session, office, auth_headers, mail_outbox):
    headers = auth_headers(office.admin_a)
    created = client.post("/admin/users", json=NEW_USER, headers=headers).json()
    first = mail_outbox.latest_token("yeni.avukat@example.com")

    response = client.post(f"/admin/users/{created['id']}/invite", headers=headers)

    assert response.status_code == 200
    assert response.json()["email_sent"] is True and response.json()["status"] == "pending"
    second = mail_outbox.latest_token("yeni.avukat@example.com")
    assert first != second
    assert client.get("/auth/token-info", params={"token": first}).status_code == 410
    assert client.get("/auth/token-info", params={"token": second}).status_code == 200


def test_resend_invite_is_only_for_pending_active_users(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    done = client.post(f"/admin/users/{office.lawyer_a1.id}/invite", headers=headers)
    assert done.status_code == 409 and done.json()["detail"] == "Kullanıcı şifresini zaten belirlemiş."

    inactive = _pending(db_session, office.firm_a)
    inactive.is_active = False
    db_session.commit()
    assert client.post(f"/admin/users/{inactive.id}/invite", headers=headers).status_code == 409


# --- password reset ----------------------------------------------------------------------

def test_admin_can_send_a_reset_link_to_an_active_user(client, office, auth_headers, mail_outbox):
    old_session = auth_headers(office.lawyer_a1)
    response = client.post(f"/admin/users/{office.lawyer_a1.id}/password-reset", headers=auth_headers(office.admin_a))

    assert response.status_code == 200 and response.json() == {"email_sent": True}
    [message] = mail_outbox.messages(office.lawyer_a1.email)
    assert message["Subject"] == "CaseBridge şifre sıfırlama"
    assert client.get("/users/me", headers=old_session).status_code == 200  # sessions end only when the password is set


def test_password_reset_is_only_for_active_users_with_a_password(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    pending = _pending(db_session, office.firm_a)
    office.lawyer_a2.is_active = False
    db_session.commit()

    for user in (pending, office.lawyer_a2):
        assert client.post(f"/admin/users/{user.id}/password-reset", headers=headers).status_code == 409


# --- firm isolation ----------------------------------------------------------------------

def test_users_of_other_firms_are_invisible(client, office, auth_headers):
    headers = auth_headers(office.admin_a)
    foreign = office.lawyer_b.id

    rows = client.get("/admin/users", headers=headers).json()
    assert office.lawyer_b.email not in {row["email"] for row in rows}
    assert client.patch(f"/admin/users/{foreign}", json={"full_name": "X"}, headers=headers).status_code == 404
    assert client.post(f"/admin/users/{foreign}/invite", headers=headers).status_code == 404
    assert client.post(f"/admin/users/{foreign}/password-reset", headers=headers).status_code == 404
    assert client.patch("/admin/users/does-not-exist", json={"full_name": "X"}, headers=headers).status_code == 404


# --- pending users are not assignable ------------------------------------------------------

def test_pending_and_inactive_users_are_not_offered_or_accepted_as_assignees(client, db_session, office, auth_headers):
    admin = auth_headers(office.admin_a)
    pending = _pending(db_session, office.firm_a)
    office.lawyer_a2.is_active = False
    case = Case(
        law_firm_id=office.firm_a.id, case_number="2026/1", case_name="Dava", client_name="Müvekkil",
        case_type=CaseType.KIRA, assigned_lawyer_id=office.lawyer_a1.id,
    )
    db_session.add(case)
    db_session.commit()

    assert [row["id"] for row in client.get("/admin/lawyers", headers=admin).json()] == [office.lawyer_a1.id]
    assert {row["id"] for row in client.get("/users", headers=admin).json()} == {office.admin_a.id, office.lawyer_a1.id}
    for lawyer in (pending, office.lawyer_a2):
        assert client.patch(f"/admin/cases/{case.id}/lawyer", json={"assigned_lawyer_id": lawyer.id}, headers=admin).status_code == 422
        created = client.post("/cases", json={
            "case_number": "2026/2", "case_name": "Yeni", "client_name": "M", "case_type": "kira",
            "assigned_lawyer_id": lawyer.id,
        }, headers=admin)
        assert created.status_code == 422

    overview = client.get("/analytics/overview", headers=admin).json()
    assert pending.id not in {row["lawyer_id"] for row in overview["by_lawyer"]}
```

Modify `backend/tests/conftest.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/tests/conftest.py
+++ b/backend/tests/conftest.py
@@ -164,3 +164,51 @@ def mail_outbox(tmp_path, monkeypatch):
     monkeypatch.setattr(settings, "email_backend", "file")
     monkeypatch.setattr(settings, "email_file_dir", str(directory))
     return MailOutbox(directory)
+
+
+@pytest.fixture()
+def office(db_session):
+    """Two firms for user-management tests. Firm A: an admin and two lawyers;
+    firm B: an admin and a lawyer. Every password is `password` below."""
+    from types import SimpleNamespace
+
+    from app.core.security import hash_password
+    from app.models.law_firm import LawFirm
+    from app.models.user import User, UserRole
+
+    password = "password123"
+    firm_a = LawFirm(name="Demir Hukuk")
+    firm_b = LawFirm(name="Kaya Hukuk")
+    db_session.add_all([firm_a, firm_b])
+    db_session.flush()
+
+    def make(firm, email, name, role):
+        user = User(
+            law_firm_id=firm.id, email=email, hashed_password=hash_password(password),
+            full_name=name, role=role, is_active=True,
+        )
+        db_session.add(user)
+        return user
+
+    admin_a = make(firm_a, "yonetici.a@example.com", "Yönetici A", UserRole.ADMIN)
+    lawyer_a1 = make(firm_a, "ayse.a@example.com", "Ayşe Avukat", UserRole.LAWYER)
+    lawyer_a2 = make(firm_a, "mehmet.a@example.com", "Mehmet Avukat", UserRole.LAWYER)
+    admin_b = make(firm_b, "yonetici.b@example.com", "Yönetici B", UserRole.ADMIN)
+    lawyer_b = make(firm_b, "ali.b@example.com", "Ali Avukat", UserRole.LAWYER)
+    db_session.commit()
+    return SimpleNamespace(
+        password=password, firm_a=firm_a, firm_b=firm_b, admin_a=admin_a, lawyer_a1=lawyer_a1,
+        lawyer_a2=lawyer_a2, admin_b=admin_b, lawyer_b=lawyer_b,
+    )
+
+
+@pytest.fixture()
+def auth_headers(client, office):
+    """auth_headers(user) -> Authorization header for one of the office users."""
+
+    def _headers(user):
+        response = client.post("/auth/login", json={"email": user.email, "password": office.password})
+        assert response.status_code == 200, response.text
+        return {"Authorization": f"Bearer {response.json()['access_token']}"}
+
+    return _headers
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_admin_users.py -q
```

Expected: FAIL — 18 failures (`404` for every `/admin/users` route, pending users still listed).

- [ ] **Step 3: Implement**

Modify `backend/app/api/routes/admin.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/admin.py
+++ b/backend/app/api/routes/admin.py
@@ -14,9 +14,13 @@ router = APIRouter(prefix="/admin", tags=["admin"])
 
 @router.get("/lawyers", response_model=list[UserOut])
 def list_lawyers(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
+    """The lawyers cases can be given to: active and past the invitation
+    (a lawyer who has not chosen a password yet is not assignable)."""
     return db.query(User).filter(
         User.law_firm_id == admin.law_firm_id,
         User.role == UserRole.LAWYER,
+        User.is_active.is_(True),
+        User.password_set_at.isnot(None),
     ).order_by(User.full_name).all()
 
 
@@ -38,6 +42,7 @@ def assign_case_lawyer(
         User.law_firm_id == admin.law_firm_id,
         User.role == UserRole.LAWYER,
         User.is_active.is_(True),
+        User.password_set_at.isnot(None),
     ).first()
     if lawyer is None:
         raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
@@ -65,6 +70,7 @@ def assign_precedent_reviewer(
         User.law_firm_id == admin.law_firm_id,
         User.role == UserRole.LAWYER,
         User.is_active.is_(True),
+        User.password_set_at.isnot(None),
     ).first()
     if reviewer is None:
         raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
```

Create `backend/app/api/routes/admin_users.py`:

```python
"""Firm-scoped user administration (admins only)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User, UserStatus
from app.schemas.admin_user import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    AdminUserWithEmailOut,
    EmailSentOut,
)
from app.services.account_service import deliver, prepare_invite_email, prepare_reset_email
from app.services.user_admin_service import (
    UserAdminError,
    create_pending_user,
    get_user_in_firm,
    list_firm_users,
    update_user,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])

ALREADY_SET = "Kullanıcı şifresini zaten belirlemiş."
INACTIVE_INVITE = "Pasif kullanıcıya davet gönderilemez. Önce kullanıcıyı aktifleştirin."
RESET_NOT_POSSIBLE = "Şifre sıfırlama bağlantısı yalnızca aktif ve şifresini belirlemiş kullanıcılara gönderilebilir."


def _http(error: UserAdminError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


def _with_email(user: User, email_sent: bool) -> AdminUserWithEmailOut:
    return AdminUserWithEmailOut(**AdminUserOut.model_validate(user).model_dump(), email_sent=email_sent)


def _invite(db: Session, user: User, admin: User) -> AdminUserWithEmailOut:
    message = prepare_invite_email(db, user, admin)
    email_sent = deliver(message)
    db.refresh(user)
    return _with_email(user, email_sent)


@router.get("", response_model=list[AdminUserOut])
def list_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return list_firm_users(db, admin.law_firm_id)


@router.post("", response_model=AdminUserWithEmailOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    try:
        user = create_pending_user(db, admin.law_firm_id, payload)
    except UserAdminError as error:
        raise _http(error)
    db.commit()
    return _invite(db, user, admin)


@router.patch("/{user_id}", response_model=AdminUserOut)
def patch_user(
    user_id: str,
    payload: AdminUserUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        user = get_user_in_firm(db, admin.law_firm_id, user_id)
        update_user(db, admin, user, payload)
    except UserAdminError as error:
        db.rollback()
        raise _http(error)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/invite", response_model=AdminUserWithEmailOut)
def resend_invite(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    try:
        user = get_user_in_firm(db, admin.law_firm_id, user_id)
    except UserAdminError as error:
        raise _http(error)
    if user.password_set_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_SET)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=INACTIVE_INVITE)
    return _invite(db, user, admin)


@router.post("/{user_id}/password-reset", response_model=EmailSentOut)
def send_password_reset(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    try:
        user = get_user_in_firm(db, admin.law_firm_id, user_id)
    except UserAdminError as error:
        raise _http(error)
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=RESET_NOT_POSSIBLE)
    message = prepare_reset_email(db, user, created_by=admin.id)
    return EmailSentOut(email_sent=deliver(message))
```

Modify `backend/app/api/routes/cases.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/cases.py
+++ b/backend/app/api/routes/cases.py
@@ -34,6 +34,7 @@ def create_case(
         lawyer = db.query(User).filter(
             User.id == lawyer_id, User.law_firm_id == current_user.law_firm_id,
             User.role == UserRole.LAWYER, User.is_active.is_(True),
+            User.password_set_at.isnot(None),
         ).first()
         if lawyer is None:
             raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
```

Modify `backend/app/api/routes/users.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/users.py
+++ b/backend/app/api/routes/users.py
@@ -20,6 +20,8 @@ def list_users(
     law_firm_id: str = Depends(get_current_law_firm_id),
     db: Session = Depends(get_db),
 ):
+    """Colleagues who can be picked as assignee or attendee: active and past
+    the invitation. The admin user list is GET /admin/users."""
     return UserRepository(db).list_in_firm(law_firm_id)
```

Modify `backend/app/main.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/main.py
+++ b/backend/app/main.py
@@ -6,7 +6,7 @@ from fastapi.middleware.cors import CORSMiddleware
 
 from app.core.security_headers import SecurityHeadersMiddleware
 
-from app.api.routes import activity, admin, analytics, auth, calendar, case_intake, cases, chat, courtroom, documents, handover, health, notifications, precedents, reports, simulations, system, tasks, users
+from app.api.routes import activity, admin, admin_users, analytics, auth, calendar, case_intake, cases, chat, courtroom, documents, handover, health, notifications, precedents, reports, simulations, system, tasks, users
 from app.ai.provider_factory import get_ai_provider_status, get_courtroom_provider, get_llm_provider
 from app.core.config import settings
 from app.services.simulation_worker import start_worker_thread
@@ -82,6 +82,7 @@ app.include_router(health.router)
 app.include_router(auth.router)
 app.include_router(users.router)
 app.include_router(admin.router)
+app.include_router(admin_users.router)
 app.include_router(cases.router)
 app.include_router(case_intake.router)
 app.include_router(precedents.router)
```

Modify `backend/app/repositories/user_repository.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/repositories/user_repository.py
+++ b/backend/app/repositories/user_repository.py
@@ -29,4 +29,13 @@ class UserRepository:
         )
 
     def list_in_firm(self, law_firm_id: str) -> list[User]:
-        return self.db.query(User).filter(User.law_firm_id == law_firm_id).all()
+        """Active users who have chosen a password."""
+        return (
+            self.db.query(User)
+            .filter(
+                User.law_firm_id == law_firm_id,
+                User.is_active.is_(True),
+                User.password_set_at.isnot(None),
+            )
+            .all()
+        )
```

Create `backend/app/schemas/admin_user.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.user import UserRole, UserStatus


def _single_line(value: str) -> str:
    """Trims and collapses whitespace (also newlines, so a name can never
    inject a header into an e-mail)."""
    return " ".join(value.split())


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    department: str | None = None
    role: UserRole
    is_active: bool
    status: UserStatus
    invited_at: datetime | None = None
    password_set_at: datetime | None = None
    created_at: datetime | None = None


class AdminUserWithEmailOut(AdminUserOut):
    """Returned when an e-mail was attempted: email_sent is false when sending
    failed (the user and the link exist; the invite can be sent again)."""

    email_sent: bool


class EmailSentOut(BaseModel):
    email_sent: bool


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    department: str | None = None
    role: UserRole

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        value = _single_line(value)
        if not value or len(value) > 255:
            raise ValueError("Ad soyad 1-255 karakter olmalı.")
        return value

    @field_validator("department")
    @classmethod
    def _department(cls, value: str | None) -> str | None:
        return _clean_department(value)


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    department: str | None = None
    role: UserRole | None = None
    email: EmailStr | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Ad soyad boş olamaz.")
        value = _single_line(value)
        if not value or len(value) > 255:
            raise ValueError("Ad soyad 1-255 karakter olmalı.")
        return value

    @field_validator("department")
    @classmethod
    def _department(cls, value: str | None) -> str | None:
        return _clean_department(value)

    @field_validator("role", "email")
    @classmethod
    def _not_null(cls, value):
        if value is None:
            raise ValueError("Bu alan boş olamaz.")
        return value


def _clean_department(value: str | None) -> str | None:
    if value is None:
        return None
    value = _single_line(value)
    if len(value) > 100:
        raise ValueError("Departman en fazla 100 karakter olabilir.")
    return value or None
```

Modify `backend/app/services/account_service.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/services/account_service.py
+++ b/backend/app/services/account_service.py
@@ -10,7 +10,7 @@ from app.core.timeutil import utc_now
 from app.models.user import User
 from app.models.user_token import TokenPurpose
 from app.services.email import EmailMessage, EmailSendError, send_email
-from app.services.notification_content import build_reset_email
+from app.services.notification_content import build_invite_email, build_reset_email
 from app.services.user_token_service import invalidate_unused_tokens, issue_token
 
 logger = logging.getLogger("casebridge")
@@ -49,3 +49,18 @@ def prepare_reset_email(db: Session, user: User, created_by: str | None) -> Emai
     token = issue_token(db, user, TokenPurpose.RESET, created_by=created_by)
     db.commit()
     return build_reset_email(user=user, token=token)
+
+
+def prepare_invite_email(db: Session, user: User, inviter: User | None) -> EmailMessage:
+    """Issues an invite token, stamps invited_at (both committed) and returns
+    the e-mail to send."""
+    token = issue_token(db, user, TokenPurpose.INVITE, created_by=inviter.id if inviter else None)
+    user.invited_at = utc_now()
+    firm_name = user.law_firm.name
+    db.commit()
+    return build_invite_email(
+        user=user,
+        firm_name=" ".join(firm_name.split()),
+        inviter_name=inviter.full_name if inviter else None,
+        token=token,
+    )
```

Modify `backend/app/services/analytics_service.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/services/analytics_service.py
+++ b/backend/app/services/analytics_service.py
@@ -81,8 +81,10 @@ class AnalyticsService:
             status_counts[c.status] = status_counts.get(c.status, 0) + 1
         by_status = [StatusBreakdown(status=s, total=status_counts[s]) for s in CaseStatus if s in status_counts]
 
+        # Lawyers who have not chosen a password yet have no work to show.
         lawyers = self.db.query(User).filter(
-            User.law_firm_id == law_firm_id, User.role == UserRole.LAWYER
+            User.law_firm_id == law_firm_id, User.role == UserRole.LAWYER,
+            User.password_set_at.isnot(None),
         ).order_by(User.full_name).all()
         by_lawyer = []
         for lawyer in lawyers:
```

Create `backend/app/services/user_admin_service.py`:

```python
"""Administration of a firm's users. Every lookup is scoped to the admin's
firm: a user of another firm does not exist (404)."""
import secrets

from sqlalchemy import null
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.admin_user import AdminUserCreate, AdminUserUpdate
from app.services.user_token_service import invalidate_unused_tokens

EMAIL_TAKEN = "Bu e-posta adresi zaten kayıtlı."
OWN_ROLE = "Kendi rolünüzü değiştiremezsiniz."
LAST_ADMIN = "Büroda en az bir aktif yönetici kalmalı."
USER_NOT_FOUND = "Kullanıcı bulunamadı"


class UserAdminError(Exception):
    """A rule violation with the HTTP status and the Turkish message to return."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def get_user_in_firm(db: Session, law_firm_id: str, user_id: str) -> User:
    user = UserRepository(db).get_by_id_in_firm(user_id, law_firm_id)
    if user is None:
        raise UserAdminError(404, USER_NOT_FOUND)
    return user


def list_firm_users(db: Session, law_firm_id: str) -> list[User]:
    return db.query(User).filter(User.law_firm_id == law_firm_id).order_by(User.full_name, User.email).all()


def count_other_active_admins(db: Session, law_firm_id: str, excluding_user_id: str) -> int:
    """Admins who can act: active and past the invitation (password set)."""
    return db.query(User).filter(
        User.law_firm_id == law_firm_id,
        User.role == UserRole.ADMIN,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
        User.id != excluding_user_id,
    ).count()


def ensure_not_last_admin(db: Session, user: User) -> None:
    """Raises when `user` is an active admin and nobody else could act as one."""
    if user.role == UserRole.ADMIN and count_other_active_admins(db, user.law_firm_id, user.id) == 0:
        raise UserAdminError(409, LAST_ADMIN)


def _email_in_use(db: Session, email: str, except_user_id: str | None = None) -> bool:
    existing = UserRepository(db).get_by_email(email)
    return existing is not None and existing.id != except_user_id


def create_pending_user(db: Session, law_firm_id: str, data: AdminUserCreate) -> User:
    """A user who has to choose a password through the invite link. The stored
    hash is random and never revealed; login is refused while password_set_at
    is NULL anyway. Flushes; the caller commits."""
    email = str(data.email).lower()
    if _email_in_use(db, email):
        raise UserAdminError(409, EMAIL_TAKEN)
    user = User(
        law_firm_id=law_firm_id,
        email=email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        full_name=data.full_name,
        department=data.department,
        role=data.role,
        is_active=True,
        password_set_at=null(),
    )
    db.add(user)
    db.flush()
    return user


def update_user(db: Session, admin: User, user: User, data: AdminUserUpdate) -> User:
    fields = data.model_fields_set
    if "role" in fields and data.role != user.role:
        if user.id == admin.id:
            raise UserAdminError(409, OWN_ROLE)
        if user.role == UserRole.ADMIN:
            ensure_not_last_admin(db, user)
    if "email" in fields:
        email = str(data.email).lower()
        if email != user.email.lower():
            if _email_in_use(db, email, except_user_id=user.id):
                raise UserAdminError(409, EMAIL_TAKEN)
            user.email = email
            # Links already e-mailed went to the old address.
            invalidate_unused_tokens(db, user.id)
    if "full_name" in fields:
        user.full_name = data.full_name
    if "department" in fields:
        user.department = data.department
    if "role" in fields:
        user.role = data.role
    db.flush()
    return user
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_admin_users.py -q
```

Expected: PASS — 18 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/admin.py backend/app/api/routes/admin_users.py backend/app/api/routes/cases.py backend/app/api/routes/users.py backend/app/main.py backend/app/repositories/user_repository.py backend/app/schemas/admin_user.py backend/app/services/account_service.py backend/app/services/analytics_service.py backend/app/services/user_admin_service.py backend/tests/api/test_admin_users.py backend/tests/conftest.py
git commit -F - <<'EOF'
feat: admin user management (create, edit, invite, password reset) and assignable-user lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 6: User workload, deactivation with transfer and activation

Deactivation is one transaction with the hand-over of open work; see Decision 5 for exactly what moves.

**Files:**
- Create: `backend/app/schemas/admin_user_lifecycle.py`
- Create: `backend/app/services/user_lifecycle_service.py`
- Modify: `backend/app/api/routes/admin_users.py`
- Test (create): `backend/tests/api/test_admin_user_lifecycle.py`

**Interfaces:**
- Consumes: Task 5 (`get_user_in_firm`, `ensure_not_last_admin`, `UserAdminError`, `office` / `auth_headers` fixtures), Task 2 (`invalidate_unused_tokens`).
- Produces: `app/schemas/admin_user_lifecycle.py` (`WorkloadOut{open_cases: [{id, case_number, case_name}], pending_tasks: [{id, title, case_name}], precedents_reviewing: int}`, `DeactivateRequest{transfer_to: str | None}`, `TransferCounts{cases, tasks, precedents}`, `DeactivateOut{user, transferred}`); `user_lifecycle_service`: `get_workload(db, user) -> WorkloadOut`, `deactivate_user(db, admin, user, transfer_to: str | None) -> TransferCounts`, `activate_user(db, user) -> User`; routes `GET /admin/users/{id}/workload`, `POST /admin/users/{id}/deactivate`, `POST /admin/users/{id}/activate`; messages `Kendi hesabınızı pasifleştiremezsiniz.`, `Kullanıcı zaten pasif.`, `Açık davaları ve görevleri devretmek için bir avukat seçin.`, `Devredilecek avukat geçersiz.`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_admin_user_lifecycle.py`:

```python
"""Workload, deactivation with transfer, and re-activation."""
from datetime import date

import pytest
from sqlalchemy import null

from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.case import Case, CaseStatus, CaseType
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.models.user_token import TokenPurpose, UserToken
from app.services.user_token_service import find_usable_token, issue_token

CONFLICT_TRANSFER = "Açık davaları ve görevleri devretmek için bir avukat seçin."
INVALID_TARGET = "Devredilecek avukat geçersiz."


def _case(db_session, firm, number, owner=None, **kwargs):
    case = Case(
        law_firm_id=firm.id, case_number=number, case_name=f"Dava {number}", client_name="Müvekkil",
        case_type=CaseType.KIRA, assigned_lawyer_id=owner.id if owner else None, **kwargs,
    )
    db_session.add(case)
    db_session.flush()
    return case


def _task(db_session, case, assignee, title, status=TaskStatus.PENDING):
    task = Task(case_id=case.id, law_firm_id=case.law_firm_id, title=title, assigned_to=assignee.id, status=status)
    db_session.add(task)
    db_session.flush()
    return task


@pytest.fixture()
def busy(db_session, office):
    """Ayşe (lawyer_a1) owns two open cases, one closed, one archived, has two
    pending tasks and one done task, and reviews a precedent. Mehmet owns one."""
    ayse, mehmet = office.lawyer_a1, office.lawyer_a2
    open1 = _case(db_session, office.firm_a, "2026/1", ayse)
    open2 = _case(db_session, office.firm_a, "2026/2", ayse, status=CaseStatus.DURUSMA_BEKLEYEN)
    closed = _case(db_session, office.firm_a, "2026/3", ayse, status=CaseStatus.KAPALI)
    archived = _case(db_session, office.firm_a, "2026/4", ayse, is_archived=True)
    mehmets = _case(db_session, office.firm_a, "2026/5", mehmet)
    precedent = _case(db_session, office.firm_a, "Y9HD 2026/1", None, is_precedent=True, reviewer_lawyer_id=ayse.id)
    foreign = _case(db_session, office.firm_b, "2026/6", office.lawyer_b)
    pending1 = _task(db_session, open1, ayse, "Dilekçe hazırla")
    pending2 = _task(db_session, closed, ayse, "Arşive kaldır")
    done = _task(db_session, open1, ayse, "Eski görev", TaskStatus.COMPLETED)
    others = _task(db_session, mehmets, mehmet, "Mehmet'in görevi")
    db_session.commit()
    from types import SimpleNamespace
    return SimpleNamespace(
        open1=open1, open2=open2, closed=closed, archived=archived, mehmets=mehmets, precedent=precedent,
        foreign=foreign, pending1=pending1, pending2=pending2, done=done, others=others,
    )


def _deactivate(client, headers, user, transfer_to=None):
    body = {} if transfer_to is None else {"transfer_to": transfer_to}
    return client.post(f"/admin/users/{user.id}/deactivate", json=body, headers=headers)


# --- workload ----------------------------------------------------------------------------

def test_workload_lists_open_cases_pending_tasks_and_precedents(client, office, busy, auth_headers):
    response = client.get(f"/admin/users/{office.lawyer_a1.id}/workload", headers=auth_headers(office.admin_a))

    assert response.status_code == 200
    body = response.json()
    assert [(c["id"], c["case_number"], c["case_name"]) for c in body["open_cases"]] == [
        (busy.open1.id, "2026/1", "Dava 2026/1"),
        (busy.open2.id, "2026/2", "Dava 2026/2"),
    ]
    assert {(t["id"], t["title"], t["case_name"]) for t in body["pending_tasks"]} == {
        (busy.pending1.id, "Dilekçe hazırla", "Dava 2026/1"),
        (busy.pending2.id, "Arşive kaldır", "Dava 2026/3"),
    }
    assert body["precedents_reviewing"] == 1


def test_workload_is_empty_for_a_user_without_work(client, office, auth_headers):
    body = client.get(f"/admin/users/{office.lawyer_a2.id}/workload", headers=auth_headers(office.admin_a)).json()
    assert body == {"open_cases": [], "pending_tasks": [], "precedents_reviewing": 0}


def test_workload_is_admin_only_and_firm_scoped(client, office, busy, auth_headers):
    path = f"/admin/users/{office.lawyer_a1.id}/workload"
    assert client.get(path, headers=auth_headers(office.lawyer_a2)).status_code == 403
    assert client.get(path, headers=auth_headers(office.admin_b)).status_code == 404


# --- deactivate: rules ---------------------------------------------------------------------

def test_deactivating_a_user_without_work_needs_no_transfer(client, db_session, office, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["is_active"] is False and body["user"]["status"] == "inactive"
    assert body["transferred"] == {"cases": 0, "tasks": 0, "precedents": 0}
    assert client.post("/auth/login", json={"email": office.lawyer_a2.email, "password": office.password}).status_code == 401


def test_work_requires_a_transfer_target(client, db_session, office, busy, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1)

    assert response.status_code == 422
    assert response.json()["detail"] == CONFLICT_TRANSFER
    db_session.refresh(office.lawyer_a1)
    assert office.lawyer_a1.is_active is True


def test_only_pending_tasks_or_only_a_reviewed_precedent_also_require_a_target(client, db_session, office, auth_headers):
    case = _case(db_session, office.firm_a, "2026/9", office.lawyer_a2, status=CaseStatus.KAPALI)
    _task(db_session, case, office.lawyer_a1, "Tek görev")
    db_session.commit()
    assert _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1).json()["detail"] == CONFLICT_TRANSFER

    db_session.query(Task).delete()
    _case(db_session, office.firm_a, "Y9HD 2026/2", None, is_precedent=True, reviewer_lawyer_id=office.lawyer_a1.id)
    db_session.commit()
    assert _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1).json()["detail"] == CONFLICT_TRANSFER


def test_the_transfer_target_must_be_an_active_lawyer_of_the_same_firm(client, db_session, office, busy, auth_headers):
    headers = auth_headers(office.admin_a)
    pending = User(
        law_firm_id=office.firm_a.id, email="beklemede@example.com", hashed_password=hash_password("x"),
        full_name="Bekleyen", role=UserRole.LAWYER, password_set_at=null(), invited_at=utc_now(),
    )
    inactive = User(
        law_firm_id=office.firm_a.id, email="pasif@example.com", hashed_password=hash_password("x"),
        full_name="Pasif", role=UserRole.LAWYER, is_active=False,
    )
    db_session.add_all([pending, inactive])
    db_session.commit()

    for target in (office.lawyer_b.id, office.admin_a.id, office.lawyer_a1.id, pending.id, inactive.id, "yok"):
        response = _deactivate(client, headers, office.lawyer_a1, target)
        assert response.status_code == 422, target
        assert response.json()["detail"] == INVALID_TARGET
    db_session.refresh(office.lawyer_a1)
    assert office.lawyer_a1.is_active is True


def test_an_invalid_target_is_rejected_even_when_there_is_no_work(client, office, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2, office.lawyer_b.id)
    assert response.status_code == 422 and response.json()["detail"] == INVALID_TARGET


def test_an_admin_cannot_deactivate_themselves(client, office, auth_headers):
    response = _deactivate(client, auth_headers(office.admin_a), office.admin_a)
    assert response.status_code == 409
    assert response.json()["detail"] == "Kendi hesabınızı pasifleştiremezsiniz."


def test_the_last_active_admin_cannot_be_deactivated(db_session, office):
    from app.services.user_admin_service import UserAdminError
    from app.services.user_lifecycle_service import deactivate_user

    outsider = office.lawyer_a2  # any other user acting as the caller
    with pytest.raises(UserAdminError) as error:
        deactivate_user(db_session, outsider, office.admin_a, None)
    assert (error.value.status_code, error.value.detail) == (409, "Büroda en az bir aktif yönetici kalmalı.")


def test_an_inactive_user_cannot_be_deactivated_again(client, db_session, office, auth_headers):
    office.lawyer_a2.is_active = False
    db_session.commit()
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2)
    assert response.status_code == 409 and response.json()["detail"] == "Kullanıcı zaten pasif."


def test_deactivate_and_activate_are_admin_only_and_firm_scoped(client, office, auth_headers):
    for action in ("deactivate", "activate"):
        path = f"/admin/users/{office.lawyer_a2.id}/{action}"
        assert client.post(path, json={}, headers=auth_headers(office.lawyer_a1)).status_code == 403
    foreign = f"/admin/users/{office.lawyer_b.id}"
    assert client.post(f"{foreign}/deactivate", json={}, headers=auth_headers(office.admin_a)).status_code == 404
    assert client.post(f"{foreign}/activate", headers=auth_headers(office.admin_a)).status_code == 404


# --- deactivate: transfer ------------------------------------------------------------------

def test_deactivation_moves_open_cases_pending_tasks_and_precedents_in_one_step(
    client, db_session, office, busy, auth_headers
):
    response = _deactivate(client, auth_headers(office.admin_a), office.lawyer_a1, office.lawyer_a2.id)

    assert response.status_code == 200
    body = response.json()
    assert body["transferred"] == {"cases": 2, "tasks": 2, "precedents": 1}
    assert body["user"]["status"] == "inactive"

    mehmet = office.lawyer_a2.id
    owners = {c.case_number: (c.assigned_lawyer_id, c.reviewer_lawyer_id) for c in db_session.query(Case).all()}
    assert owners["2026/1"][0] == mehmet and owners["2026/2"][0] == mehmet
    assert owners["2026/3"][0] == office.lawyer_a1.id   # closed: history stays
    assert owners["2026/4"][0] == office.lawyer_a1.id   # archived: history stays
    assert owners["2026/5"][0] == mehmet                # already the target's own case
    assert owners["2026/6"][0] == office.lawyer_b.id    # other firm untouched
    assert owners["Y9HD 2026/1"][1] == mehmet
    tasks = {t.title: t.assigned_to for t in db_session.query(Task).all()}
    assert tasks["Dilekçe hazırla"] == mehmet and tasks["Arşive kaldır"] == mehmet
    assert tasks["Eski görev"] == office.lawyer_a1.id   # completed task stays
    assert tasks["Mehmet'in görevi"] == mehmet

    workload = client.get(f"/admin/users/{office.lawyer_a1.id}/workload", headers=auth_headers(office.admin_a)).json()
    assert workload == {"open_cases": [], "pending_tasks": [], "precedents_reviewing": 0}


def test_deactivation_ends_the_session_and_invalidates_unused_links(client, db_session, office, auth_headers):
    session = auth_headers(office.lawyer_a2)
    invite = issue_token(db_session, office.lawyer_a2, TokenPurpose.INVITE)
    reset = issue_token(db_session, office.lawyer_a2, TokenPurpose.RESET)
    db_session.commit()

    assert _deactivate(client, auth_headers(office.admin_a), office.lawyer_a2).status_code == 200

    assert client.get("/users/me", headers=session).status_code == 401
    assert db_session.query(UserToken).filter(UserToken.user_id == office.lawyer_a2.id, UserToken.used_at.is_(None)).count() == 0
    assert find_usable_token(db_session, invite) is None and find_usable_token(db_session, reset) is None


def test_a_pending_user_can_be_deactivated_to_revoke_the_invitation(client, db_session, office, auth_headers):
    created = client.post(
        "/admin/users", headers=auth_headers(office.admin_a),
        json={"email": "yeni@example.com", "full_name": "Yeni Kişi", "role": "lawyer"},
    ).json()
    response = client.post(f"/admin/users/{created['id']}/deactivate", json={}, headers=auth_headers(office.admin_a))
    assert response.status_code == 200 and response.json()["user"]["status"] == "inactive"


# --- activate ------------------------------------------------------------------------------

def test_activation_restores_login_and_keeps_pending_users_pending(client, db_session, office, auth_headers):
    headers = auth_headers(office.admin_a)
    assert _deactivate(client, headers, office.lawyer_a2).status_code == 200

    response = client.post(f"/admin/users/{office.lawyer_a2.id}/activate", headers=headers)
    assert response.status_code == 200 and response.json()["status"] == "active"
    assert client.post("/auth/login", json={"email": office.lawyer_a2.email, "password": office.password}).status_code == 200
    assert client.post(f"/admin/users/{office.lawyer_a2.id}/activate", headers=headers).status_code == 200

    created = client.post(
        "/admin/users", headers=headers, json={"email": "yeni@example.com", "full_name": "Yeni Kişi", "role": "lawyer"},
    ).json()
    client.post(f"/admin/users/{created['id']}/deactivate", json={}, headers=headers)
    assert client.post(f"/admin/users/{created['id']}/activate", headers=headers).json()["status"] == "pending"
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_admin_user_lifecycle.py -q
```

Expected: FAIL — 16 failures (`404`/`405` for the new routes).

- [ ] **Step 3: Implement**

Modify `backend/app/api/routes/admin_users.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/admin_users.py
+++ b/backend/app/api/routes/admin_users.py
@@ -12,6 +12,7 @@ from app.schemas.admin_user import (
     AdminUserWithEmailOut,
     EmailSentOut,
 )
+from app.schemas.admin_user_lifecycle import DeactivateOut, DeactivateRequest, WorkloadOut
 from app.services.account_service import deliver, prepare_invite_email, prepare_reset_email
 from app.services.user_admin_service import (
     UserAdminError,
@@ -20,6 +21,7 @@ from app.services.user_admin_service import (
     list_firm_users,
     update_user,
 )
+from app.services.user_lifecycle_service import activate_user, deactivate_user, get_workload
 
 router = APIRouter(prefix="/admin/users", tags=["admin-users"])
 
@@ -99,3 +101,42 @@ def send_password_reset(user_id: str, admin: User = Depends(get_current_admin),
         raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=RESET_NOT_POSSIBLE)
     message = prepare_reset_email(db, user, created_by=admin.id)
     return EmailSentOut(email_sent=deliver(message))
+
+
+@router.get("/{user_id}/workload", response_model=WorkloadOut)
+def user_workload(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
+    try:
+        user = get_user_in_firm(db, admin.law_firm_id, user_id)
+    except UserAdminError as error:
+        raise _http(error)
+    return get_workload(db, user)
+
+
+@router.post("/{user_id}/deactivate", response_model=DeactivateOut)
+def deactivate(
+    user_id: str,
+    payload: DeactivateRequest,
+    admin: User = Depends(get_current_admin),
+    db: Session = Depends(get_db),
+):
+    try:
+        user = get_user_in_firm(db, admin.law_firm_id, user_id)
+        counts = deactivate_user(db, admin, user, payload.transfer_to)
+    except UserAdminError as error:
+        db.rollback()
+        raise _http(error)
+    db.commit()
+    db.refresh(user)
+    return DeactivateOut(user=AdminUserOut.model_validate(user), transferred=counts)
+
+
+@router.post("/{user_id}/activate", response_model=AdminUserOut)
+def activate(user_id: str, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
+    try:
+        user = get_user_in_firm(db, admin.law_firm_id, user_id)
+    except UserAdminError as error:
+        raise _http(error)
+    activate_user(db, user)
+    db.commit()
+    db.refresh(user)
+    return user
```

Create `backend/app/schemas/admin_user_lifecycle.py`:

```python
from pydantic import BaseModel

from app.schemas.admin_user import AdminUserOut


class WorkloadCase(BaseModel):
    id: str
    case_number: str
    case_name: str


class WorkloadTask(BaseModel):
    id: str
    title: str
    case_name: str


class WorkloadOut(BaseModel):
    open_cases: list[WorkloadCase]
    pending_tasks: list[WorkloadTask]
    precedents_reviewing: int


class DeactivateRequest(BaseModel):
    transfer_to: str | None = None


class TransferCounts(BaseModel):
    cases: int
    tasks: int
    precedents: int


class DeactivateOut(BaseModel):
    user: AdminUserOut
    transferred: TransferCounts
```

Create `backend/app/services/user_lifecycle_service.py`:

```python
"""Deactivating and re-activating users. A user's open work has to move to
another lawyer in the same operation, so nothing is left with nobody."""
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.case import Case, CaseStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.admin_user_lifecycle import TransferCounts, WorkloadCase, WorkloadOut, WorkloadTask
from app.services.user_admin_service import UserAdminError, ensure_not_last_admin
from app.services.user_token_service import invalidate_unused_tokens

OWN_ACCOUNT = "Kendi hesabınızı pasifleştiremezsiniz."
ALREADY_INACTIVE = "Kullanıcı zaten pasif."
TRANSFER_REQUIRED = "Açık davaları ve görevleri devretmek için bir avukat seçin."
TRANSFER_INVALID = "Devredilecek avukat geçersiz."


def _open_cases_filter(user: User):
    """Open = not closed, not archived and not a precedent."""
    return (
        Case.law_firm_id == user.law_firm_id,
        Case.assigned_lawyer_id == user.id,
        Case.is_precedent.is_(False),
        Case.is_archived.is_(False),
        Case.status != CaseStatus.KAPALI,
    )


def _pending_tasks_filter(user: User):
    return (
        Task.law_firm_id == user.law_firm_id,
        Task.assigned_to == user.id,
        Task.status == TaskStatus.PENDING,
    )


def _reviewed_precedents_filter(user: User):
    return (
        Case.law_firm_id == user.law_firm_id,
        Case.is_precedent.is_(True),
        Case.reviewer_lawyer_id == user.id,
    )


def get_workload(db: Session, user: User) -> WorkloadOut:
    cases = db.query(Case).filter(*_open_cases_filter(user)).order_by(Case.case_number).all()
    tasks = (
        db.query(Task, Case.case_name)
        .join(Case, Case.id == Task.case_id)
        .filter(*_pending_tasks_filter(user))
        .order_by(Task.created_at, Task.title)
        .all()
    )
    precedents = db.query(Case).filter(*_reviewed_precedents_filter(user)).count()
    return WorkloadOut(
        open_cases=[WorkloadCase(id=c.id, case_number=c.case_number, case_name=c.case_name) for c in cases],
        pending_tasks=[WorkloadTask(id=t.id, title=t.title, case_name=name) for t, name in tasks],
        precedents_reviewing=precedents,
    )


def _transfer_target(db: Session, user: User, transfer_to: str) -> User:
    """An active lawyer of the same firm who has chosen a password, other
    than the user being deactivated."""
    target = db.query(User).filter(
        User.id == transfer_to,
        User.law_firm_id == user.law_firm_id,
        User.role == UserRole.LAWYER,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
        User.id != user.id,
    ).first()
    if target is None:
        raise UserAdminError(422, TRANSFER_INVALID)
    return target


def deactivate_user(db: Session, admin: User, user: User, transfer_to: str | None) -> TransferCounts:
    """Moves the open work to `transfer_to` and deactivates the user in one
    transaction (the caller commits). Closed and archived cases stay with the
    user, as history."""
    if user.id == admin.id:
        raise UserAdminError(409, OWN_ACCOUNT)
    if not user.is_active:
        raise UserAdminError(409, ALREADY_INACTIVE)
    ensure_not_last_admin(db, user)

    workload = get_workload(db, user)
    has_work = bool(workload.open_cases or workload.pending_tasks or workload.precedents_reviewing)
    if has_work and transfer_to is None:
        raise UserAdminError(422, TRANSFER_REQUIRED)
    target = _transfer_target(db, user, transfer_to) if transfer_to is not None else None

    counts = TransferCounts(cases=0, tasks=0, precedents=0)
    if target is not None and has_work:
        counts.cases = db.execute(
            update(Case).where(*_open_cases_filter(user)).values(assigned_lawyer_id=target.id)
            .execution_options(synchronize_session=False)
        ).rowcount
        counts.tasks = db.execute(
            update(Task).where(*_pending_tasks_filter(user)).values(assigned_to=target.id)
            .execution_options(synchronize_session=False)
        ).rowcount
        counts.precedents = db.execute(
            update(Case).where(*_reviewed_precedents_filter(user)).values(reviewer_lawyer_id=target.id)
            .execution_options(synchronize_session=False)
        ).rowcount

    user.is_active = False
    invalidate_unused_tokens(db, user.id)
    db.flush()
    return counts


def activate_user(db: Session, user: User) -> User:
    """Idempotent. A user who never chose a password stays 'pending'."""
    user.is_active = True
    db.flush()
    return user
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_admin_user_lifecycle.py -q
```

Expected: PASS — 16 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/admin_users.py backend/app/schemas/admin_user_lifecycle.py backend/app/services/user_lifecycle_service.py backend/tests/api/test_admin_user_lifecycle.py
git commit -F - <<'EOF'
feat: user workload, deactivation with transfer and activation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 7: Profile update, `create_admin` command, real-data mode seed and importer target firm

`PATCH /users/me`, the command that creates the first administrator, a seed that creates no demo users when `SEED_DEMO_DATA=false`, and an importer that can target a real firm (see Decisions 3, 4 and 15).

**Files:**
- Create: `backend/app/db/create_admin.py`
- Create: `backend/app/db/demo_cleanup.py`
- Create: `backend/app/schemas/text_rules.py`
- Modify: `backend/app/api/routes/users.py`
- Modify: `backend/app/db/import_cases.py`
- Modify: `backend/app/db/seed.py`
- Modify: `backend/app/schemas/admin_user.py`
- Modify: `backend/app/schemas/user.py`
- Test (create): `backend/tests/api/test_profile.py`
- Test (create): `backend/tests/integration/test_create_admin.py`
- Test (create): `backend/tests/integration/test_seed_real_data_mode.py`
- Test (create): `backend/tests/unit/test_import_cases_real_firm.py`

**Interfaces:**
- Consumes: Tasks 1–5 (`create_pending_user`, `prepare_invite_email`, `deliver`).
- Produces: `app/schemas/text_rules.py` (`clean_single_line(value: str) -> str`, `clean_full_name(value: str | None) -> str`, `clean_department(value: str | None) -> str | None`); `ProfileUpdate{full_name?, department?}` and `PATCH /users/me -> UserOut`; `app.db.create_admin.create_admin(db, firm_name: str, email: str, full_name: str) -> User` (raises `CreateAdminError`) and `main(argv: list[str] | None = None) -> int`; `app.db.demo_cleanup.remove_demo_data(db, *, firm_name, case_numbers, emails) -> DemoCleanup` and `count_references(db, table_name, row_id, ignore=()) -> int`; `app.db.import_cases.import_folder(folder, db, firm_name, lawyer_email)` with CLI `--firm` and `--lawyer`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_profile.py`:

```python
"""PATCH /users/me: a user edits their own name and department only."""


def test_user_updates_own_name_and_department(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    response = client.patch(
        "/users/me", json={"full_name": "  Ayşe   Yılmaz ", "department": " Kira Hukuku "}, headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["full_name"], body["department"]) == ("Ayşe Yılmaz", "Kira Hukuku")
    assert client.get("/users/me", headers=headers).json()["full_name"] == "Ayşe Yılmaz"


def test_only_the_sent_fields_change_and_a_null_department_clears_it(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    client.patch("/users/me", json={"department": "İş Hukuku"}, headers=headers)

    only_name = client.patch("/users/me", json={"full_name": "Yeni Ad"}, headers=headers).json()
    assert (only_name["full_name"], only_name["department"]) == ("Yeni Ad", "İş Hukuku")

    cleared = client.patch("/users/me", json={"department": None}, headers=headers).json()
    assert (cleared["full_name"], cleared["department"]) == ("Yeni Ad", None)
    assert client.patch("/users/me", json={"department": "   "}, headers=headers).json()["department"] is None


def test_profile_validation(client, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    for body in ({"full_name": "   "}, {"full_name": None}, {"full_name": "x" * 256}, {"department": "x" * 101}):
        assert client.patch("/users/me", json=body, headers=headers).status_code == 422, body


def test_role_email_and_active_flag_cannot_be_changed_through_the_profile(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    response = client.patch(
        "/users/me",
        json={"full_name": "Aynı Kişi", "role": "admin", "email": "baska@example.com", "is_active": False},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["role"], body["email"], body["is_active"]) == ("lawyer", office.lawyer_a1.email, True)


def test_profile_requires_login_and_stays_inside_the_own_account(client, db_session, office, auth_headers):
    assert client.patch("/users/me", json={"full_name": "X"}).status_code == 401

    client.patch("/users/me", json={"full_name": "Sadece Ayşe"}, headers=auth_headers(office.lawyer_a1))
    db_session.refresh(office.lawyer_a2)
    assert office.lawyer_a2.full_name == "Mehmet Avukat"
```

Create `backend/tests/integration/test_create_admin.py`:

```python
"""python -m app.db.create_admin: first firm + first administrator."""
import logging

import pytest

from app.core.config import settings
from app.db import create_admin as cli
from app.db.create_admin import CreateAdminError, create_admin
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.models.user_token import UserToken

ARGS = ["--firm", "  Demir   Hukuk ", "--email", "Yonetici@Example.com", "--name", "Ayşe Demir"]


@pytest.fixture()
def run(db_session, monkeypatch):
    """run(argv) -> exit code, with the command wired to the test database."""
    monkeypatch.setattr(cli, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(cli, "upgrade_to_head", lambda engine: None)
    return cli.main


def test_creates_the_firm_and_an_invited_admin_and_e_mails_the_link(run, client, db_session, mail_outbox, capsys):
    assert run(ARGS) == 0

    firm = db_session.query(LawFirm).one()
    user = db_session.query(User).one()
    assert firm.name == "Demir Hukuk"
    assert (user.email, user.full_name, user.role, user.law_firm_id) == (
        "yonetici@example.com", "Ayşe Demir", UserRole.ADMIN, firm.id,
    )
    assert user.password_set_at is None and user.invited_at is not None and user.status.value == "pending"
    assert capsys.readouterr().out.strip() == "Yönetici oluşturuldu: yonetici@example.com. Davet e-postası gönderildi."
    [message] = mail_outbox.messages("yonetici@example.com")
    assert message["Subject"] == "CaseBridge davetiniz — Demir Hukuk"

    token = mail_outbox.latest_token("yonetici@example.com")
    assert client.post("/auth/login", json={"email": "yonetici@example.com", "password": "bilinmiyor-123"}).status_code == 401
    chosen = client.post("/auth/set-password", json={"token": token, "password": "ilk-yonetici-sifresi"})
    assert chosen.status_code == 200
    me = client.get("/users/me", headers={"Authorization": f"Bearer {chosen.json()['access_token']}"}).json()
    assert me["role"] == "admin" and me["email"] == "yonetici@example.com"


def test_an_existing_firm_of_the_same_name_is_reused(run, db_session, mail_outbox):
    firm = LawFirm(name="Demir Hukuk")
    db_session.add(firm)
    db_session.commit()
    firm_id = firm.id

    assert run(ARGS) == 0

    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(User).one().law_firm_id == firm_id


def test_a_registered_email_is_an_error_and_changes_nothing(run, db_session, mail_outbox, capsys):
    assert run(ARGS) == 0
    capsys.readouterr()

    assert run(["--firm", "Başka Büro", "--email", "YONETICI@example.com", "--name", "Başka Kişi"]) == 1

    assert capsys.readouterr().err.strip() == "Hata: Bu e-posta adresi zaten kayıtlı."
    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(User).count() == 1
    assert len(mail_outbox.messages()) == 1


@pytest.mark.parametrize(
    "args,message",
    [
        (["--firm", "Büro", "--email", "gecersiz", "--name", "Ad Soyad"], "Geçersiz e-posta adresi."),
        (["--firm", "Büro", "--email", "a@example.com", "--name", "   "], "Ad soyad 1-255 karakter olmalı."),
        (["--firm", "   ", "--email", "a@example.com", "--name", "Ad Soyad"], "Büro adı 1-255 karakter olmalı."),
    ],
)
def test_invalid_input_is_a_turkish_error(run, db_session, mail_outbox, capsys, args, message):
    assert run(args) == 1

    assert capsys.readouterr().err.strip() == f"Hata: {message}"
    assert db_session.query(LawFirm).count() == 0 and db_session.query(User).count() == 0


def test_missing_arguments_exit_with_code_1_and_a_turkish_usage_message(run, capsys):
    with pytest.raises(SystemExit) as exit_info:
        run(["--firm", "Büro"])

    assert exit_info.value.code == 1
    assert capsys.readouterr().err.startswith("Hata: Eksik veya geçersiz bağımsız değişken. Kullanım: python -m app.db.create_admin")


def test_nothing_is_created_when_the_invite_e_mail_cannot_be_sent(run, db_session, monkeypatch, tmp_path, capsys):
    blocker = tmp_path / "blocked"
    blocker.write_text("not a directory")
    monkeypatch.setattr(settings, "email_backend", "file")
    monkeypatch.setattr(settings, "email_file_dir", str(blocker))

    assert run(ARGS) == 1

    error = capsys.readouterr().err
    assert error.startswith("Hata: Davet e-postası gönderilemedi (")
    assert "hiçbir kayıt oluşturulmadı" in error
    assert db_session.query(LawFirm).count() == 0
    assert db_session.query(User).count() == 0
    assert db_session.query(UserToken).count() == 0


def test_console_backend_prints_the_invite_with_its_link(run, monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_backend", "console")
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:3000")
    with caplog.at_level(logging.INFO, logger="casebridge"):
        assert run(ARGS) == 0

    assert "http://localhost:3000/sifre-belirle?token=" in caplog.text


def test_create_admin_function_rolls_back_on_failure(db_session, monkeypatch):
    def boom(message):
        raise cli.EmailSendError("SMTPServerDisconnected")

    monkeypatch.setattr(cli, "send_email", boom)
    with pytest.raises(CreateAdminError):
        create_admin(db_session, "Büro", "a@example.com", "Ad Soyad")
    assert db_session.query(LawFirm).count() == 0
```

Create `backend/tests/integration/test_seed_real_data_mode.py`:

```python
"""SEED_DEMO_DATA=false: no demo firm or users; an earlier demo is removed
without touching other firms, and demo accounts with real work are kept."""
import pytest

from app.core.config import settings
from app.core.security import hash_password
from app.db import seed as seed_module
from app.models.case import Case, CaseType
from app.models.courtroom import CourtroomSession
from app.models.law_firm import LawFirm
from app.models.task import Task
from app.models.user import User, UserRole


@pytest.fixture()
def run_seed(db_session, monkeypatch, tmp_path):
    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module, "upgrade_to_head", lambda engine: None)
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))

    def _run(demo: bool):
        monkeypatch.setattr(settings, "seed_demo_data", demo)
        seed_module.seed()
        db_session.expire_all()

    return _run


def test_real_data_mode_on_an_empty_database_creates_no_firm_and_no_users(run_seed, db_session, capsys):
    run_seed(False)

    assert db_session.query(LawFirm).count() == 0
    assert db_session.query(User).count() == 0
    assert db_session.query(Case).count() == 0
    out = capsys.readouterr().out
    assert "real data mode" in out and "python -m app.db.create_admin" in out


def test_real_data_mode_removes_an_earlier_demo_completely(run_seed, db_session):
    run_seed(True)
    assert db_session.query(User).count() == 4 and db_session.query(CourtroomSession).count() == 24

    run_seed(False)

    assert db_session.query(LawFirm).count() == 0
    assert db_session.query(User).count() == 0
    assert db_session.query(Case).count() == 0
    assert db_session.query(CourtroomSession).count() == 0
    run_seed(False)  # idempotent


def test_other_firms_and_their_users_are_never_touched(run_seed, db_session):
    other = LawFirm(name="Kaya Hukuk")
    db_session.add(other)
    db_session.flush()
    owner = User(law_firm_id=other.id, email="admin@kaya.example.com", hashed_password=hash_password("x"),
                 full_name="Kaya Yönetici", role=UserRole.ADMIN)
    db_session.add(owner)
    db_session.flush()
    db_session.add(Case(law_firm_id=other.id, case_number="2026/77", case_name="Kaya Davası", client_name="M",
                        case_type=CaseType.KIRA, assigned_lawyer_id=owner.id))
    db_session.commit()
    run_seed(True)

    run_seed(False)

    assert [f.name for f in db_session.query(LawFirm).all()] == ["Kaya Hukuk"]
    assert [u.email for u in db_session.query(User).all()] == ["admin@kaya.example.com"]
    assert [c.case_number for c in db_session.query(Case).all()] == ["2026/77"]


def test_demo_accounts_with_real_work_are_kept_and_the_rest_removed(run_seed, db_session, capsys):
    run_seed(True)
    emre = db_session.query(User).filter_by(email=seed_module.LAWYER_EMAIL).one()
    firm = emre.law_firm
    real = Case(law_firm_id=firm.id, case_number="GERCEK/1", case_name="Gerçek", client_name="Müvekkil",
                case_type=CaseType.KIRA, assigned_lawyer_id=emre.id)
    db_session.add(real)
    db_session.commit()
    capsys.readouterr()

    run_seed(False)

    assert [u.email for u in db_session.query(User).all()] == [seed_module.LAWYER_EMAIL]
    assert [c.case_number for c in db_session.query(Case).all()] == ["GERCEK/1"]
    assert db_session.query(LawFirm).count() == 1
    assert db_session.query(Task).count() == 0
    assert f"Demo users kept (they own records): {seed_module.LAWYER_EMAIL}" in capsys.readouterr().out


def test_demo_mode_still_creates_the_demo_accounts(run_seed, db_session):
    run_seed(True)

    assert {u.email for u in db_session.query(User).all()} == {
        seed_module.ADMIN_EMAIL, *(email for email, *_ in seed_module.DEMO_LAWYERS),
    }
    assert all(u.password_set_at is not None for u in db_session.query(User).all())
```

Create `backend/tests/unit/test_import_cases_real_firm.py`:

```python
"""After SEED_DEMO_DATA=false the importer targets a real firm and lawyer."""
import json

import pytest

from app.core.security import hash_password
from app.db.import_cases import ImportError_, import_folder
from app.models.case import Case
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole


@pytest.fixture()
def folder(tmp_path):
    manifest = {"cases": [{"case_number": "2026/1", "case_name": "Dava", "client_name": "Müvekkil", "case_type": "kira"}]}
    (tmp_path / "cases.json").write_text(json.dumps(manifest), encoding="utf-8")
    return str(tmp_path)


@pytest.fixture()
def real_office(db_session):
    firm = LawFirm(name="Demir Hukuk")
    db_session.add(firm)
    db_session.flush()
    lawyer = User(law_firm_id=firm.id, email="Ayse@Example.com", hashed_password=hash_password("x"),
                  full_name="Ayşe", role=UserRole.LAWYER)
    db_session.add(lawyer)
    db_session.commit()
    return firm, lawyer


def test_import_into_a_named_firm_assigns_the_named_lawyer(db_session, folder, real_office):
    firm, lawyer = real_office

    stats = import_folder(folder, db=db_session, firm_name="Demir Hukuk", lawyer_email="ayse@example.com")

    assert stats["created"] == 1 and stats["errors"] == []
    case = db_session.query(Case).one()
    assert (case.law_firm_id, case.assigned_lawyer_id) == (firm.id, lawyer.id)


def test_import_without_the_demo_firm_explains_what_to_do(db_session, folder, real_office):
    with pytest.raises(ImportError_, match="--firm and --lawyer"):
        import_folder(folder, db=db_session)


def test_the_lawyer_must_belong_to_the_named_firm(db_session, folder, real_office):
    other = LawFirm(name="Kaya Hukuk")
    db_session.add(other)
    db_session.commit()
    with pytest.raises(ImportError_):
        import_folder(folder, db=db_session, firm_name="Kaya Hukuk", lawyer_email="ayse@example.com")
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_profile.py tests/integration/test_create_admin.py tests/integration/test_seed_real_data_mode.py tests/unit/test_import_cases_real_firm.py -q
```

Expected: FAIL — a collection error in `tests/integration/test_create_admin.py` (`ModuleNotFoundError: No module named 'app.db.create_admin'`).

- [ ] **Step 3: Implement**

Modify `backend/app/api/routes/users.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/api/routes/users.py
+++ b/backend/app/api/routes/users.py
@@ -5,7 +5,7 @@ from app.api.deps import get_current_law_firm_id, get_current_user
 from app.db.session import get_db
 from app.models.user import User
 from app.repositories.user_repository import UserRepository
-from app.schemas.user import UserOut
+from app.schemas.user import ProfileUpdate, UserOut
 
 router = APIRouter(prefix="/users", tags=["users"])
 
@@ -15,6 +15,24 @@ def get_me(current_user: User = Depends(get_current_user)):
     return current_user
 
 
+@router.patch("/me", response_model=UserOut)
+def update_me(
+    payload: ProfileUpdate,
+    current_user: User = Depends(get_current_user),
+    db: Session = Depends(get_db),
+):
+    """Name and department only; role, e-mail and password have their own
+    endpoints (admin users, change-password)."""
+    fields = payload.model_fields_set
+    if "full_name" in fields:
+        current_user.full_name = payload.full_name
+    if "department" in fields:
+        current_user.department = payload.department
+    db.commit()
+    db.refresh(current_user)
+    return current_user
+
+
 @router.get("", response_model=list[UserOut])
 def list_users(
     law_firm_id: str = Depends(get_current_law_firm_id),
```

Create `backend/app/db/create_admin.py`:

```python
"""Creates the first administrator (and the firm) of a real installation.

Run with:
    python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"

The administrator is created in the invited state and receives the "set your
password" e-mail. With EMAIL_BACKEND=console the e-mail, link included, is
printed to the console. Exit code 0 on success, 1 on any error (message in
Turkish). If the e-mail cannot be sent nothing is created, so the command can
simply be run again once the mail settings are fixed.
"""
import argparse
import logging
import sys

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.timeutil import utc_now
from app.db.migrate import upgrade_to_head
from app.db.session import SessionLocal, engine
import app.models  # noqa: F401  (registers all models on Base.metadata)
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.models.user_token import TokenPurpose
from app.schemas.admin_user import AdminUserCreate
from app.schemas.text_rules import clean_single_line
from app.services.email import EmailSendError, send_email
from app.services.notification_content import build_invite_email
from app.services.user_admin_service import UserAdminError, create_pending_user
from app.services.user_token_service import issue_token

USAGE = 'python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"'


class CreateAdminError(Exception):
    """str(exc) is the Turkish message printed to the user."""


class _Parser(argparse.ArgumentParser):
    def error(self, message):  # argparse would print English text and exit 2
        print(f"Hata: Eksik veya geçersiz bağımsız değişken. Kullanım: {USAGE}", file=sys.stderr)
        raise SystemExit(1)


def create_admin(db: Session, firm_name: str, email: str, full_name: str) -> User:
    """Creates (or reuses by name) the firm, the invited admin and sends the
    invite. Commits only after the e-mail went out."""
    firm_name = clean_single_line(firm_name)
    if not firm_name or len(firm_name) > 255:
        raise CreateAdminError("Büro adı 1-255 karakter olmalı.")
    try:
        data = AdminUserCreate(email=email, full_name=full_name, role=UserRole.ADMIN)
    except ValidationError as exc:
        fields = {str(error["loc"][0]) for error in exc.errors()}
        if "email" in fields:
            raise CreateAdminError("Geçersiz e-posta adresi.") from exc
        raise CreateAdminError("Ad soyad 1-255 karakter olmalı.") from exc

    try:
        firm = db.query(LawFirm).filter(LawFirm.name == firm_name).first()
        if firm is None:
            firm = LawFirm(name=firm_name)
            db.add(firm)
            db.flush()
        try:
            user = create_pending_user(db, firm.id, data)
        except UserAdminError as exc:
            raise CreateAdminError(exc.detail) from exc
        token = issue_token(db, user, TokenPurpose.INVITE, created_by=None)
        user.invited_at = utc_now()
        try:
            send_email(build_invite_email(user=user, firm_name=firm.name, inviter_name=None, token=token))
        except EmailSendError as exc:
            raise CreateAdminError(
                f"Davet e-postası gönderilemedi ({exc}). E-posta ayarlarını denetleyip komutu yeniden çalıştırın; hiçbir kayıt oluşturulmadı."
            ) from exc
        db.commit()
    except Exception:
        db.rollback()
        raise
    return user


def main(argv: list[str] | None = None) -> int:
    parser = _Parser(description="İlk yöneticiyi (ve gerekirse büroyu) oluşturur ve davet e-postasını gönderir.")
    parser.add_argument("--firm", required=True, help="Büro adı")
    parser.add_argument("--email", required=True, help="Yöneticinin e-posta adresi")
    parser.add_argument("--name", required=True, help="Yöneticinin adı soyadı")
    args = parser.parse_args(argv)

    # The console e-mail backend prints through the logger.
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    upgrade_to_head(engine)
    db = SessionLocal()
    try:
        user = create_admin(db, args.firm, args.email, args.name)
        print(f"Yönetici oluşturuldu: {user.email}. Davet e-postası gönderildi.")
        return 0
    except CreateAdminError as exc:
        print(f"Hata: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
```

Create `backend/app/db/demo_cleanup.py`:

```python
"""Removes the seeded demo data when SEED_DEMO_DATA=false.

Only the demo firm is looked at; every other firm and its users are never
touched. A demo user (or the firm) that real work still points at - a case
somebody created, a task, a chat - is kept, so switching the flag never
destroys an office that kept using the demo accounts."""
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.purge import delete_cases
from app.models.case import Case
from app.models.courtroom import CourtroomSession
from app.models.law_firm import LawFirm
from app.models.user import User
from app.models.user_token import UserToken

SHOWCASE_PROMPT_VERSION = "showcase-v1"


@dataclass
class DemoCleanup:
    cases: int = 0
    hearings: int = 0
    users_removed: list[str] = field(default_factory=list)
    users_kept: list[str] = field(default_factory=list)
    firm_removed: bool = False


def count_references(db: Session, table_name: str, row_id: str, ignore: tuple[str, ...] = ()) -> int:
    """Rows in all tables whose foreign key points at `table_name`.id = row_id."""
    total = 0
    for table in Base.metadata.sorted_tables:
        if table.name in ignore:
            continue
        for key in table.foreign_keys:
            if key.column.table.name == table_name and key.column.name == "id":
                total += db.execute(
                    select(func.count()).select_from(table).where(table.c[key.parent.name] == row_id)
                ).scalar_one()
    return total


def remove_demo_data(
    db: Session, *, firm_name: str, case_numbers: list[str], emails: list[str]
) -> DemoCleanup:
    result = DemoCleanup()
    firm = db.query(LawFirm).filter(LawFirm.name == firm_name).first()
    if firm is None:
        return result

    stale = db.query(Case).filter(Case.law_firm_id == firm.id, Case.case_number.in_(case_numbers)).all()
    result.cases = delete_cases(db, stale)

    users = db.query(User).filter(User.law_firm_id == firm.id, User.email.in_(emails)).all()
    user_ids = [user.id for user in users]
    if user_ids:
        showcases = db.query(CourtroomSession).filter(
            CourtroomSession.user_id.in_(user_ids),
            CourtroomSession.prompt_version == SHOWCASE_PROMPT_VERSION,
        ).all()
        for session in showcases:
            db.delete(session)
        result.hearings = len(showcases)
        db.flush()

    for user in users:
        if count_references(db, "users", user.id, ignore=("user_tokens",)) > 0:
            result.users_kept.append(user.email)
            continue
        db.query(UserToken).filter(UserToken.user_id == user.id).delete(synchronize_session=False)
        db.query(UserToken).filter(UserToken.created_by == user.id).update(
            {UserToken.created_by: None}, synchronize_session=False
        )
        db.delete(user)
        result.users_removed.append(user.email)
    db.flush()

    if count_references(db, "law_firms", firm.id) == 0:
        db.delete(firm)
        result.firm_removed = True
        db.flush()
    return result
```

Modify `backend/app/db/import_cases.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/db/import_cases.py
+++ b/backend/app/db/import_cases.py
@@ -1,6 +1,7 @@
 """Import real cases and documents from a folder.
 
 Run with: python -m app.db.import_cases /data/import
+(after SEED_DEMO_DATA=false: python -m app.db.import_cases /data/import --firm "<büro adı>" --lawyer <e-posta>)
 
 Folder layout:
     cases.json            {"cases": [ {...}, ... ]}
@@ -16,6 +17,7 @@ Idempotent: existing case numbers are updated, not duplicated; documents
 and events are matched by filename/title. A manifest marked
 ``record_kind: precedent`` is kept out of the firm's case metrics.
 """
+import argparse
 import json
 import os
 import sys
@@ -23,6 +25,8 @@ import uuid
 from datetime import date, datetime, timezone
 from typing import Optional
 
+from sqlalchemy import func
+
 from app.core.config import settings
 from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
 from app.db.session import SessionLocal
@@ -180,7 +184,7 @@ def _import_case(db, firm: LawFirm, lawyer: User, item: dict, docs_dir: str, is_
     return created, doc_count
 
 
-def import_folder(folder: str, db=None) -> dict:
+def import_folder(folder: str, db=None, firm_name: str = DEMO_FIRM_NAME, lawyer_email: str = LAWYER_EMAIL) -> dict:
     manifest = os.path.join(folder, "cases.json")
     if not os.path.isfile(manifest):
         raise ImportError_(f"{manifest} not found")
@@ -194,10 +198,17 @@ def import_folder(folder: str, db=None) -> dict:
     own_session = db is None
     db = db or SessionLocal()
     try:
-        firm = db.query(LawFirm).filter(LawFirm.name == DEMO_FIRM_NAME).first()
-        lawyer = db.query(User).filter(User.email == LAWYER_EMAIL).first()
+        firm = db.query(LawFirm).filter(LawFirm.name == firm_name).first()
+        lawyer = None
+        if firm:
+            lawyer = db.query(User).filter(
+                User.law_firm_id == firm.id, func.lower(User.email) == lawyer_email.lower()
+            ).first()
         if not firm or not lawyer:
-            raise ImportError_("Run the seed first (python -m app.db.seed)")
+            raise ImportError_(
+                "Firm or lawyer not found. Run the seed (python -m app.db.seed) for the demo firm, "
+                "or pass --firm and --lawyer for a real one."
+            )
         stats = {"created": 0, "updated": 0, "documents": 0, "errors": []}
         docs_dir = os.path.join(folder, "documents")
         for index, item in enumerate(items):
@@ -216,8 +227,12 @@ def import_folder(folder: str, db=None) -> dict:
 
 
 if __name__ == "__main__":
-    target = sys.argv[1] if len(sys.argv) > 1 else "/data/import"
-    result = import_folder(target)
+    parser = argparse.ArgumentParser(description="Import cases and documents from a folder.")
+    parser.add_argument("folder", nargs="?", default="/data/import")
+    parser.add_argument("--firm", default=DEMO_FIRM_NAME, help="Firm to import into (default: the demo firm)")
+    parser.add_argument("--lawyer", default=LAWYER_EMAIL, help="E-mail of the lawyer who will own the cases")
+    args = parser.parse_args()
+    result = import_folder(args.folder, firm_name=args.firm, lawyer_email=args.lawyer)
     print(f"Imported: {result['created']} new, {result['updated']} updated, {result['documents']} documents")
     for err in result["errors"]:
         print(f"  ERROR {err}")
```

Modify `backend/app/db/seed.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/db/seed.py
+++ b/backend/app/db/seed.py
@@ -22,6 +22,7 @@ from app.models.user import User, UserRole
 from app.core.config import settings
 from app.db.courtroom_seed import seed_courtroom_scenarios
 from app.db.courtroom_showcase_seed import seed_courtroom_showcases
+from app.db.demo_cleanup import remove_demo_data
 from app.db.demo_case_detail_seed import CASE_EVIDENCE
 from app.db.purge import delete_cases
 from app.services.case_parties import legacy_parties, party_models
@@ -648,6 +649,27 @@ def seed() -> None:
     upgrade_to_head(engine)
     db = SessionLocal()
     try:
+        if not settings.seed_demo_data:
+            # Real data mode: no demo firm or users are created, and a
+            # previously seeded demo is removed (see app/db/demo_cleanup.py).
+            removed = remove_demo_data(
+                db,
+                firm_name=DEMO_FIRM_NAME,
+                case_numbers=[c["case_number"] for c in DEMO_CASES],
+                emails=[ADMIN_EMAIL, *(email for email, *_ in DEMO_LAWYERS)],
+            )
+            scenario_count = seed_courtroom_scenarios(db)
+            db.commit()
+            print("Seed complete (real data mode). No demo firm or users are created.")
+            print(f"  Demo cases removed: {removed.cases}")
+            print(f"  Demo hearings removed: {removed.hearings}")
+            print(f"  Demo users removed: {len(removed.users_removed)}")
+            if removed.users_kept:
+                print(f"  Demo users kept (they own records): {', '.join(removed.users_kept)}")
+            print(f"  Courtroom scenarios: {scenario_count}")
+            print('  Create the first administrator with: python -m app.db.create_admin --firm "<büro adı>" --email <e-posta> --name "<ad soyad>"')
+            return
+
         firm = _get_or_create_firm(db)
         admin = _get_or_create_user(db, firm, ADMIN_EMAIL, "Demo Yönetici", UserRole.ADMIN)
         legacy_lawyer = db.query(User).filter(User.email == LAWYER_EMAIL, User.full_name == "Demo Avukat").first()
@@ -658,7 +680,7 @@ def seed() -> None:
         lawyer = lawyers[0]
 
         # Preserve legacy case records while ensuring every existing case in
-        # the demo firm has an owner, including when demo data is disabled.
+        # the demo firm has an owner.
         unassigned = db.query(Case).filter(
             Case.law_firm_id == firm.id, Case.assigned_lawyer_id.is_(None),
             Case.is_precedent.is_(False),
@@ -666,19 +688,6 @@ def seed() -> None:
         for index, case in enumerate(unassigned):
             case.assigned_lawyer_id = lawyers[index % len(lawyers)].id
 
-        if not settings.seed_demo_data:
-            demo_numbers = [c["case_number"] for c in DEMO_CASES]
-            stale = db.query(Case).filter(Case.law_firm_id == firm.id, Case.case_number.in_(demo_numbers)).all()
-            removed = delete_cases(db, stale)
-            scenario_count = seed_courtroom_scenarios(db)
-            db.commit()
-            print(f"Seed complete (real data mode). Firm: {DEMO_FIRM_NAME}")
-            print(f"  Admin login:  {ADMIN_EMAIL} / {DEMO_PASSWORD}")
-            print(f"  Lawyer login: {LAWYER_EMAIL} / {DEMO_PASSWORD}")
-            print(f"  Demo cases removed: {removed}")
-            print(f"  Courtroom scenarios: {scenario_count}")
-            return
-
         demo_cases = {}
         for index, case_kwargs in enumerate(DEMO_CASES):
             case_type = case_kwargs["case_type"]
```

Modify `backend/app/schemas/admin_user.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/schemas/admin_user.py
+++ b/backend/app/schemas/admin_user.py
@@ -3,12 +3,7 @@ from datetime import datetime
 from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
 
 from app.models.user import UserRole, UserStatus
-
-
-def _single_line(value: str) -> str:
-    """Trims and collapses whitespace (also newlines, so a name can never
-    inject a header into an e-mail)."""
-    return " ".join(value.split())
+from app.schemas.text_rules import clean_department, clean_full_name
 
 
 class AdminUserOut(BaseModel):
@@ -46,15 +41,12 @@ class AdminUserCreate(BaseModel):
     @field_validator("full_name")
     @classmethod
     def _full_name(cls, value: str) -> str:
-        value = _single_line(value)
-        if not value or len(value) > 255:
-            raise ValueError("Ad soyad 1-255 karakter olmalı.")
-        return value
+        return clean_full_name(value)
 
     @field_validator("department")
     @classmethod
     def _department(cls, value: str | None) -> str | None:
-        return _clean_department(value)
+        return clean_department(value)
 
 
 class AdminUserUpdate(BaseModel):
@@ -65,18 +57,13 @@ class AdminUserUpdate(BaseModel):
 
     @field_validator("full_name")
     @classmethod
-    def _full_name(cls, value: str | None) -> str | None:
-        if value is None:
-            raise ValueError("Ad soyad boş olamaz.")
-        value = _single_line(value)
-        if not value or len(value) > 255:
-            raise ValueError("Ad soyad 1-255 karakter olmalı.")
-        return value
+    def _full_name(cls, value: str | None) -> str:
+        return clean_full_name(value)
 
     @field_validator("department")
     @classmethod
     def _department(cls, value: str | None) -> str | None:
-        return _clean_department(value)
+        return clean_department(value)
 
     @field_validator("role", "email")
     @classmethod
@@ -85,11 +72,3 @@ class AdminUserUpdate(BaseModel):
             raise ValueError("Bu alan boş olamaz.")
         return value
 
-
-def _clean_department(value: str | None) -> str | None:
-    if value is None:
-        return None
-    value = _single_line(value)
-    if len(value) > 100:
-        raise ValueError("Departman en fazla 100 karakter olabilir.")
-    return value or None
```

Create `backend/app/schemas/text_rules.py`:

```python
"""Shared cleaning rules for names typed by users."""


def clean_single_line(value: str) -> str:
    """Trims and collapses whitespace, newlines included, so a name can never
    inject a header into an e-mail."""
    return " ".join(value.split())


def clean_full_name(value: str | None) -> str:
    if value is None:
        raise ValueError("Ad soyad boş olamaz.")
    value = clean_single_line(value)
    if not value or len(value) > 255:
        raise ValueError("Ad soyad 1-255 karakter olmalı.")
    return value


def clean_department(value: str | None) -> str | None:
    if value is None:
        return None
    value = clean_single_line(value)
    if len(value) > 100:
        raise ValueError("Departman en fazla 100 karakter olabilir.")
    return value or None
```

Modify `backend/app/schemas/user.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/schemas/user.py
+++ b/backend/app/schemas/user.py
@@ -1,5 +1,6 @@
 from app.models.user import UserRole
-from pydantic import BaseModel, ConfigDict
+from app.schemas.text_rules import clean_department, clean_full_name
+from pydantic import BaseModel, ConfigDict, field_validator
 
 
 class UserOut(BaseModel):
@@ -13,3 +14,20 @@ class UserOut(BaseModel):
     role: UserRole
     law_firm_id: str
     is_active: bool
+
+
+class ProfileUpdate(BaseModel):
+    """What a user may change about themselves (PATCH /users/me)."""
+
+    full_name: str | None = None
+    department: str | None = None
+
+    @field_validator("full_name")
+    @classmethod
+    def _full_name(cls, value: str | None) -> str:
+        return clean_full_name(value)
+
+    @field_validator("department")
+    @classmethod
+    def _department(cls, value: str | None) -> str | None:
+        return clean_department(value)
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_profile.py tests/integration/test_create_admin.py tests/integration/test_seed_real_data_mode.py tests/unit/test_import_cases_real_firm.py -q
```

Expected: PASS — 23 passed.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (every test that existed before this task still passes).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/users.py backend/app/db/create_admin.py backend/app/db/demo_cleanup.py backend/app/db/import_cases.py backend/app/db/seed.py backend/app/schemas/admin_user.py backend/app/schemas/text_rules.py backend/app/schemas/user.py backend/tests/api/test_profile.py backend/tests/integration/test_create_admin.py backend/tests/integration/test_seed_real_data_mode.py backend/tests/unit/test_import_cases_real_firm.py
git commit -F - <<'EOF'
feat: profile update, create_admin command, real-data mode seed and importer target firm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 8: User management API client, types and password rules (frontend)

All frontend calls and pure helpers, so the pages can be built on tested functions.

**Files:**
- Create: `frontend/src/lib/passwordRules.ts`
- Create: `frontend/src/lib/userMessages.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types/index.ts`
- Test (create): `frontend/src/lib/__tests__/userApi.test.ts`

**Interfaces:**
- Consumes: the backend endpoints of Tasks 3–7 and the existing `request()`, `ApiError`, `getToken/setToken/clearToken` in `src/lib/api.ts`.
- Produces (`src/types/index.ts`): `UserStatus`, `ManagedUser`, `ManagedUserInvite` (+ `email_sent`), `ManagedUserPayload`, `ManagedUserUpdate`, `UserWorkload`, `DeactivateResult`, `AuthConfig`, `TokenInfo`, `ProfileUpdate`. (`src/lib/api.ts`): `getAuthConfig()`, `logout()` (always clears the token), `forgotPassword(email)`, `getTokenInfo(token)`, `setPassword(token, password)` and `changePassword(current, next)` (both store the returned token with `setToken`), `updateProfile(payload)`, `listManagedUsers()`, `createManagedUser(payload)`, `updateManagedUser(id, payload)`, `resendUserInvite(id)`, `sendUserPasswordReset(id)`, `getUserWorkload(id)`, `deactivateUser(id, transferTo?)`, `activateUser(id)`; a 401 from `/auth/login` no longer redirects or clears the token. `src/lib/passwordRules.ts`: `validateNewPassword(password: string, confirm: string, email?: string | null): string | null` (first problem or `null`), `PASSWORD_HINT`, `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`. `src/lib/userMessages.ts`: `userMessage(error: unknown, fallback: string): string`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/__tests__/userApi.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateNewPassword } from "@/lib/passwordRules";
import { userMessage } from "@/lib/userMessages";
import { ApiError } from "@/lib/apiError";

const originalFetch = global.fetch;
const originalLocation = window.location;

function mockFetch(body: unknown = {}, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url, init]) => [
    String(url).replace(/^https?:\/\/[^/]+/, ""),
    init?.method ?? "GET",
    init?.body ?? null,
  ]);
}

beforeEach(() => {
  window.localStorage.clear();
  // @ts-expect-error - jsdom allows redefining location for tests
  delete window.location;
  window.location = { ...originalLocation, href: "http://localhost:3000/ayarlar" } as Location;
});

afterEach(() => {
  global.fetch = originalFetch;
  window.location = originalLocation;
  vi.restoreAllMocks();
});

describe("user management API", () => {
  it("calls the admin user endpoints with the right methods and bodies", async () => {
    window.localStorage.setItem("casebridge_token", "tok");
    const fetchMock = mockFetch();
    const api = await import("@/lib/api");

    await api.listManagedUsers();
    await api.createManagedUser({ email: "a@b.co", full_name: "Ad Soyad", department: "İş", role: "lawyer" });
    await api.updateManagedUser("u1", { department: null });
    await api.resendUserInvite("u1");
    await api.sendUserPasswordReset("u1");
    await api.getUserWorkload("u1");
    await api.deactivateUser("u1");
    await api.deactivateUser("u1", "u2");
    await api.activateUser("u1");
    await api.updateProfile({ full_name: "Yeni Ad" });

    expect(calls(fetchMock)).toEqual([
      ["/admin/users", "GET", null],
      ["/admin/users", "POST", JSON.stringify({ email: "a@b.co", full_name: "Ad Soyad", department: "İş", role: "lawyer" })],
      ["/admin/users/u1", "PATCH", JSON.stringify({ department: null })],
      ["/admin/users/u1/invite", "POST", null],
      ["/admin/users/u1/password-reset", "POST", null],
      ["/admin/users/u1/workload", "GET", null],
      ["/admin/users/u1/deactivate", "POST", "{}"],
      ["/admin/users/u1/deactivate", "POST", JSON.stringify({ transfer_to: "u2" })],
      ["/admin/users/u1/activate", "POST", null],
      ["/users/me", "PATCH", JSON.stringify({ full_name: "Yeni Ad" })],
    ]);
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("calls the public auth endpoints and encodes the link token", async () => {
    const fetchMock = mockFetch();
    const api = await import("@/lib/api");

    await api.getAuthConfig();
    await api.forgotPassword("a@b.co");
    await api.getTokenInfo("a+b/c=");

    expect(calls(fetchMock)).toEqual([
      ["/auth/config", "GET", null],
      ["/auth/forgot-password", "POST", JSON.stringify({ email: "a@b.co" })],
      ["/auth/token-info?token=a%2Bb%2Fc%3D", "GET", null],
    ]);
  });

  it("stores the new token after set-password and change-password", async () => {
    const api = await import("@/lib/api");

    const first = mockFetch({ access_token: "from-set-password" });
    await api.setPassword("link-token", "yeni-sifre-123");
    expect(calls(first)).toEqual([["/auth/set-password", "POST", JSON.stringify({ token: "link-token", password: "yeni-sifre-123" })]]);
    expect(window.localStorage.getItem("casebridge_token")).toBe("from-set-password");

    const second = mockFetch({ access_token: "from-change-password" });
    await api.changePassword("eski-sifre-1", "yeni-sifre-456");
    expect(calls(second)).toEqual([
      ["/auth/change-password", "POST", JSON.stringify({ current_password: "eski-sifre-1", new_password: "yeni-sifre-456" })],
    ]);
    expect(window.localStorage.getItem("casebridge_token")).toBe("from-change-password");
  });

  it("logout calls the endpoint and always clears the token", async () => {
    window.localStorage.setItem("casebridge_token", "tok");
    const fetchMock = mockFetch({ status: "logged_out" });
    const api = await import("@/lib/api");

    await api.logout();
    expect(calls(fetchMock)).toEqual([["/auth/logout", "POST", null]]);
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();

    window.localStorage.setItem("casebridge_token", "tok");
    global.fetch = vi.fn().mockRejectedValue(new TypeError("network down")) as unknown as typeof fetch;
    await expect(api.logout()).resolves.toBeUndefined();
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();
  });

  it("a failed login (401) shows the message instead of reloading the page", async () => {
    window.localStorage.setItem("casebridge_token", "old-token");
    mockFetch({ detail: "E-posta veya şifre hatalı." }, 401);
    const api = await import("@/lib/api");

    await expect(api.login("a@b.co", "x")).rejects.toMatchObject({ status: 401, message: "E-posta veya şifre hatalı." });
    expect(window.location.href).toBe("http://localhost:3000/ayarlar");
    expect(window.localStorage.getItem("casebridge_token")).toBe("old-token");
  });

  it("any other 401 still clears the token and redirects to /login", async () => {
    window.localStorage.setItem("casebridge_token", "revoked");
    mockFetch({ detail: "Could not validate credentials" }, 401);
    const api = await import("@/lib/api");

    await expect(api.getMe()).rejects.toBeInstanceOf(ApiError);
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();
    expect(window.location.href).toContain("/login");
  });
});

describe("validateNewPassword", () => {
  it("returns the first problem in the order length, e-mail, confirmation", () => {
    expect(validateNewPassword("kisa", "kisa")).toBe("Şifre en az 10 karakter olmalı.");
    expect(validateNewPassword("x".repeat(129), "x".repeat(129))).toBe("Şifre en fazla 128 karakter olabilir.");
    expect(validateNewPassword("Avukat@Example.com", "Avukat@Example.com", "avukat@example.com")).toBe(
      "Şifre e-posta adresinizle aynı olamaz.",
    );
    expect(validateNewPassword("yeterince-uzun", "farkli-uzun-sifre", "a@b.co")).toBe("Şifreler eşleşmiyor.");
    expect(validateNewPassword("yeterince-uzun", "yeterince-uzun", "a@b.co")).toBeNull();
    expect(validateNewPassword("yeterince-uzun", "yeterince-uzun")).toBeNull();
  });
});

describe("userMessage", () => {
  it("shows only ApiError messages and otherwise the Turkish fallback", () => {
    expect(userMessage(new ApiError("Mevcut şifre hatalı.", 400), "Hata.")).toBe("Mevcut şifre hatalı.");
    expect(userMessage(new ApiError("", 500), "Hata.")).toBe("Hata.");
    expect(userMessage(new TypeError("Failed to fetch"), "Hata.")).toBe("Hata.");
    expect(userMessage("boom", "Hata.")).toBe("Hata.");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd frontend && npx vitest run src/lib/__tests__/userApi.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/passwordRules"` (the test file cannot load).

- [ ] **Step 3: Implement**

Modify `frontend/src/lib/api.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/lib/api.ts
+++ b/frontend/src/lib/api.ts
@@ -30,6 +30,15 @@ import type {
   AIConnectivity,
   AIUsage,
   AppUser,
+  AuthConfig,
+  DeactivateResult,
+  ManagedUser,
+  ManagedUserInvite,
+  ManagedUserPayload,
+  ManagedUserUpdate,
+  ProfileUpdate,
+  TokenInfo,
+  UserWorkload,
   DocumentWithCase,
   Task,
   TaskStatus,
@@ -58,8 +67,12 @@ export function clearToken() {
   window.localStorage.removeItem("casebridge_token");
 }
 
+/** A 401 from these means "wrong credentials", not "session expired": the
+ * page shows the message instead of being reloaded. */
+const NO_SESSION_REDIRECT_PATHS = ["/auth/login"];
+
 /** Turns a non-2xx response into an ApiError (and handles 401 logout). */
-async function throwApiError(response: Response): Promise<never> {
+async function throwApiError(response: Response, path: string): Promise<never> {
   let detail = `İstek başarısız oldu (${response.status}).`;
   try {
     const body = await response.json();
@@ -68,7 +81,7 @@ async function throwApiError(response: Response): Promise<never> {
     // response had no JSON body - keep the generic message
   }
 
-  if (response.status === 401) {
+  if (response.status === 401 && !NO_SESSION_REDIRECT_PATHS.includes(path)) {
     // Session expired or token invalid/revoked - clear it and send
     // the user back to login instead of leaving them stuck on a
     // page that will keep failing every request. A hard redirect
@@ -93,7 +106,7 @@ async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
 
   const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
 
-  if (!response.ok) await throwApiError(response);
+  if (!response.ok) await throwApiError(response, path);
 
   if (response.status === 204) return undefined as T;
   return (await response.json()) as T;
@@ -107,6 +120,91 @@ export async function getMe(): Promise<AppUser> {
   return request("/users/me");
 }
 
+/** Public: tells the login page whether to show the demo accounts hint. */
+export async function getAuthConfig(): Promise<AuthConfig> {
+  return request("/auth/config");
+}
+
+/** Ends the session. The token is discarded even when the call fails. */
+export async function logout(): Promise<void> {
+  try {
+    await request("/auth/logout", { method: "POST" });
+  } catch {
+    // Nothing to do: the local token goes away either way.
+  } finally {
+    clearToken();
+  }
+}
+
+export async function forgotPassword(email: string): Promise<{ message: string }> {
+  return request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
+}
+
+export async function getTokenInfo(token: string): Promise<TokenInfo> {
+  return request(`/auth/token-info?token=${encodeURIComponent(token)}`);
+}
+
+/** Chooses the password with an invite / reset link. The answer logs the user
+ * in, so the new token is stored here, before anything else can run. */
+export async function setPassword(token: string, password: string): Promise<{ access_token: string }> {
+  const result = await request<{ access_token: string }>("/auth/set-password", {
+    method: "POST",
+    body: JSON.stringify({ token, password }),
+  });
+  setToken(result.access_token);
+  return result;
+}
+
+/** Changing the password ends every other session; the new token is stored
+ * here so this browser stays logged in. */
+export async function changePassword(currentPassword: string, newPassword: string): Promise<{ access_token: string }> {
+  const result = await request<{ access_token: string }>("/auth/change-password", {
+    method: "POST",
+    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
+  });
+  setToken(result.access_token);
+  return result;
+}
+
+export async function updateProfile(payload: ProfileUpdate): Promise<AppUser> {
+  return request("/users/me", { method: "PATCH", body: JSON.stringify(payload) });
+}
+
+export async function listManagedUsers(): Promise<ManagedUser[]> {
+  return request("/admin/users");
+}
+
+export async function createManagedUser(payload: ManagedUserPayload): Promise<ManagedUserInvite> {
+  return request("/admin/users", { method: "POST", body: JSON.stringify(payload) });
+}
+
+export async function updateManagedUser(id: string, payload: ManagedUserUpdate): Promise<ManagedUser> {
+  return request(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
+}
+
+export async function resendUserInvite(id: string): Promise<ManagedUserInvite> {
+  return request(`/admin/users/${id}/invite`, { method: "POST" });
+}
+
+export async function sendUserPasswordReset(id: string): Promise<{ email_sent: boolean }> {
+  return request(`/admin/users/${id}/password-reset`, { method: "POST" });
+}
+
+export async function getUserWorkload(id: string): Promise<UserWorkload> {
+  return request(`/admin/users/${id}/workload`);
+}
+
+export async function deactivateUser(id: string, transferTo?: string): Promise<DeactivateResult> {
+  return request(`/admin/users/${id}/deactivate`, {
+    method: "POST",
+    body: JSON.stringify(transferTo ? { transfer_to: transferTo } : {}),
+  });
+}
+
+export async function activateUser(id: string): Promise<ManagedUser> {
+  return request(`/admin/users/${id}/activate`, { method: "POST" });
+}
+
 export async function listUsers(): Promise<AppUser[]> {
   return request("/users");
 }
@@ -459,6 +557,6 @@ export async function openChatStream(
     body: JSON.stringify({ content }),
     signal,
   });
-  if (!response.ok) await throwApiError(response);
+  if (!response.ok) await throwApiError(response, `/chat/conversations/${conversationId}/messages`);
   return response;
 }
```

Create `frontend/src/lib/passwordRules.ts`:

```ts
/** Client-side password rules, mirroring the server's (the server decides). */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_HINT = "En az 10 karakter olmalı ve e-posta adresinizle aynı olamaz.";

/** The first problem with a new password, or null when it is acceptable.
 * `email` is optional: without it only length and confirmation are checked. */
export function validateNewPassword(password: string, confirm: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "Şifre en az 10 karakter olmalı.";
  if (password.length > MAX_PASSWORD_LENGTH) return "Şifre en fazla 128 karakter olabilir.";
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "Şifre e-posta adresinizle aynı olamaz.";
  if (password !== confirm) return "Şifreler eşleşmiyor.";
  return null;
}
```

Create `frontend/src/lib/userMessages.ts`:

```ts
import { ApiError } from "@/lib/apiError";

/** What to show the user for a failed call: the server's Turkish message for
 * an ApiError, otherwise the Turkish fallback. Never a raw Error message. */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
```

Modify `frontend/src/types/index.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/types/index.ts
+++ b/frontend/src/types/index.ts
@@ -240,6 +240,62 @@ export interface AppUser {
   is_active: boolean;
 }
 
+export type UserStatus = "pending" | "active" | "inactive";
+
+/** A firm user as the admin user list shows them (GET /admin/users). */
+export interface ManagedUser {
+  id: string;
+  email: string;
+  full_name: string;
+  department: string | null;
+  role: UserRole;
+  is_active: boolean;
+  status: UserStatus;
+  invited_at: string | null;
+  password_set_at: string | null;
+  created_at: string | null;
+}
+
+/** Create / re-invite answer: email_sent is false when the e-mail could not be sent. */
+export interface ManagedUserInvite extends ManagedUser {
+  email_sent: boolean;
+}
+
+export interface ManagedUserPayload {
+  email: string;
+  full_name: string;
+  department?: string | null;
+  role: UserRole;
+}
+
+export type ManagedUserUpdate = Partial<ManagedUserPayload>;
+
+export interface UserWorkload {
+  open_cases: { id: string; case_number: string; case_name: string }[];
+  pending_tasks: { id: string; title: string; case_name: string }[];
+  precedents_reviewing: number;
+}
+
+export interface DeactivateResult {
+  user: ManagedUser;
+  transferred: { cases: number; tasks: number; precedents: number };
+}
+
+export interface AuthConfig {
+  demo_mode: boolean;
+}
+
+export interface TokenInfo {
+  purpose: "invite" | "reset";
+  email: string;
+  full_name: string;
+}
+
+export interface ProfileUpdate {
+  full_name?: string;
+  department?: string | null;
+}
+
 export interface AIStatus {
   provider: string;
   configured: boolean;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd frontend && npx vitest run src/lib/__tests__/userApi.test.ts
```

Expected: PASS — Test Files 1 passed (1); Tests 8 passed (8).

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: PASS — no failing test and no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/__tests__/userApi.test.ts frontend/src/lib/api.ts frontend/src/lib/passwordRules.ts frontend/src/lib/userMessages.ts frontend/src/types/index.ts
git commit -F - <<'EOF'
feat: user management API client, types and password rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 9: Empty login form, forgot-password and set-password pages (frontend)

The three public pages (Decision 8). They live outside `AppShell` and share `AuthCard`.

**Files:**
- Create: `frontend/src/app/sifre-belirle/page.tsx`
- Create: `frontend/src/app/sifremi-unuttum/page.tsx`
- Create: `frontend/src/components/auth/AuthCard.tsx`
- Create: `frontend/src/components/auth/ForgotPasswordView.tsx`
- Create: `frontend/src/components/auth/LoginView.tsx`
- Create: `frontend/src/components/auth/SetPasswordView.tsx`
- Modify: `frontend/src/app/login/page.tsx`
- Test (create): `frontend/src/components/__tests__/AuthPages.test.tsx`

**Interfaces:**
- Consumes: Task 8 (`getAuthConfig`, `login`, `forgotPassword`, `getTokenInfo`, `setPassword`, `validateNewPassword`, `PASSWORD_HINT`, `userMessage`, `setToken`).
- Produces: `components/auth/AuthCard.tsx` (`AuthCard({title?, children})`, the shared `AUTH_*` class names), `LoginView`, `ForgotPasswordView`, `SetPasswordView` (reads `?token=`), pages `/login`, `/sifremi-unuttum`, `/sifre-belirle` (wrapped in `Suspense` because it reads `useSearchParams`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/AuthPages.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const login = vi.fn();
const getMe = vi.fn();
const setToken = vi.fn();
const getAuthConfig = vi.fn();
const forgotPassword = vi.fn();
const getTokenInfo = vi.fn();
const setPassword = vi.fn();
vi.mock("@/lib/api", () => ({
  login: (...args: unknown[]) => login(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  setToken: (...args: unknown[]) => setToken(...args),
  getAuthConfig: (...args: unknown[]) => getAuthConfig(...args),
  forgotPassword: (...args: unknown[]) => forgotPassword(...args),
  getTokenInfo: (...args: unknown[]) => getTokenInfo(...args),
  setPassword: (...args: unknown[]) => setPassword(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

import { ApiError } from "@/lib/apiError";
import { ForgotPasswordView } from "@/components/auth/ForgotPasswordView";
import { LoginView } from "@/components/auth/LoginView";
import { SetPasswordView } from "@/components/auth/SetPasswordView";

const LINK_INVALID = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.";

beforeEach(() => {
  for (const mock of [login, getMe, setToken, getAuthConfig, forgotPassword, getTokenInfo, setPassword]) mock.mockReset();
  resetNav();
  getAuthConfig.mockResolvedValue({ demo_mode: false });
});

describe("LoginView", () => {
  it("starts with an empty form and no demo hint outside demo mode", async () => {
    render(<LoginView />);

    expect(screen.getByLabelText("E-posta")).toHaveValue("");
    expect(screen.getByLabelText("Şifre")).toHaveValue("");
    await waitFor(() => expect(getAuthConfig).toHaveBeenCalled());
    expect(screen.queryByText("Demo hesapları")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toHaveAttribute("href", "/sifremi-unuttum");
  });

  it("shows the demo accounts hint in demo mode", async () => {
    getAuthConfig.mockResolvedValue({ demo_mode: true });
    render(<LoginView />);

    expect(await screen.findByText("Demo hesapları")).toBeInTheDocument();
    expect(screen.getByText("Yönetici: admin@demo.casebridge.dev")).toBeInTheDocument();
    expect(screen.getByText("Avukat: avukat@demo.casebridge.dev")).toBeInTheDocument();
    expect(screen.getByText("Şifre: demo1234")).toBeInTheDocument();
    expect(screen.getByLabelText("E-posta")).toHaveValue("");
  });

  it("works without a hint when the config call fails", async () => {
    getAuthConfig.mockRejectedValue(new Error("down"));
    render(<LoginView />);

    await waitFor(() => expect(getAuthConfig).toHaveBeenCalled());
    expect(screen.queryByText("Demo hesapları")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Giriş Yap" })).toBeInTheDocument();
  });

  it.each([
    ["admin", "/admin"],
    ["lawyer", "/dashboard"],
  ])("logs in a %s and goes to %s", async (role, destination) => {
    login.mockResolvedValue({ access_token: "tok" });
    getMe.mockResolvedValue({ id: "u1", role });
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "gizli-sifre-1");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(destination));
    expect(login).toHaveBeenCalledWith("a@example.com", "gizli-sifre-1");
    expect(setToken).toHaveBeenCalledWith("tok");
  });

  it("shows the server's Turkish message for a failed login", async () => {
    login.mockRejectedValue(new ApiError("E-posta veya şifre hatalı.", 401));
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "yanlis");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta veya şifre hatalı.");
    expect(nav.push).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it("never shows a raw error message: unexpected errors get the Turkish fallback", async () => {
    login.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "x");
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Giriş yapılamadı. Lütfen tekrar deneyin.");
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("keeps the button focusable while submitting (aria-disabled) and ignores a second submit", async () => {
    let finish: (value: { access_token: string }) => void = () => undefined;
    login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    getMe.mockResolvedValue({ id: "u1", role: "lawyer" });
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.type(screen.getByLabelText("Şifre"), "gizli-sifre-1");
    const button = screen.getByRole("button", { name: "Giriş Yap" });
    await user.click(button);

    const busy = await screen.findByRole("button", { name: "Giriş yapılıyor..." });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
    await user.click(busy);
    expect(login).toHaveBeenCalledTimes(1);

    finish({ access_token: "tok" });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("ForgotPasswordView", () => {
  it("sends the address and shows the same confirmation whatever the account", async () => {
    forgotPassword.mockResolvedValue({ message: "ignored" });
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("E-posta"), "  kimse@example.com ");
    await user.click(screen.getByRole("button", { name: "Bağlantı gönder" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.",
    );
    expect(forgotPassword).toHaveBeenCalledWith("kimse@example.com");
    expect(screen.getByRole("link", { name: "Giriş sayfasına dön" })).toHaveAttribute("href", "/login");
  });

  it("shows the Turkish rate limit message and the fallback for other failures", async () => {
    forgotPassword.mockRejectedValueOnce(new ApiError("Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.", 429));
    const user = userEvent.setup();
    render(<ForgotPasswordView />);

    await user.type(screen.getByLabelText("E-posta"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Bağlantı gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.");

    forgotPassword.mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Bağlantı gönder" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("İstek gönderilemedi. Lütfen tekrar deneyin."));
  });
});

describe("SetPasswordView", () => {
  const INFO = { purpose: "invite", email: "ayse@example.com", full_name: "Ayşe Demir" };

  async function fill(user: ReturnType<typeof userEvent.setup>, password: string, confirm: string) {
    await user.type(screen.getByLabelText("Yeni şifre", { exact: true }), password);
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), confirm);
    await user.click(screen.getByRole("button", { name: "Şifreyi belirle" }));
  }

  it("greets the user, sets the password and goes to the role's home page", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockResolvedValue({ access_token: "tok" });
    getMe.mockResolvedValue({ id: "u1", role: "admin" });
    const user = userEvent.setup();
    render(<SetPasswordView />);

    expect(await screen.findByText("Merhaba Ayşe Demir, CaseBridge şifrenizi belirleyin.")).toBeInTheDocument();
    expect(getTokenInfo).toHaveBeenCalledWith("abc");
    expect(screen.getByText("En az 10 karakter olmalı ve e-posta adresinizle aynı olamaz.")).toBeInTheDocument();
    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/admin"));
    expect(setPassword).toHaveBeenCalledWith("abc", "yeni-guclu-sifre");
  });

  it("sends a lawyer to the dashboard", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockResolvedValue({ access_token: "tok" });
    getMe.mockResolvedValue({ id: "u1", role: "lawyer" });
    const user = userEvent.setup();
    render(<SetPasswordView />);

    await screen.findByText(/Merhaba Ayşe Demir/);
    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("checks length, e-mail and confirmation before calling the server", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "kisa", "kisa");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre en az 10 karakter olmalı.");

    await user.clear(screen.getByLabelText("Yeni şifre", { exact: true }));
    await user.clear(screen.getByLabelText("Yeni şifre (tekrar)"));
    await fill(user, "ayse@example.com", "ayse@example.com");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre e-posta adresinizle aynı olamaz.");

    await user.clear(screen.getByLabelText("Yeni şifre", { exact: true }));
    await user.clear(screen.getByLabelText("Yeni şifre (tekrar)"));
    await fill(user, "yeni-guclu-sifre", "baska-guclu-sifre");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifreler eşleşmiyor.");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("shows the server's message when the password is refused", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockRejectedValue(new ApiError("Şifre en az 10 karakter olmalı.", 422));
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByRole("alert")).toHaveTextContent("Şifre en az 10 karakter olmalı.");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("explains an expired or used link and offers the way back", async () => {
    setUrl("/sifre-belirle?token=old");
    getTokenInfo.mockRejectedValue(new ApiError(LINK_INVALID, 410));
    render(<SetPasswordView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(LINK_INVALID);
    expect(screen.getByRole("link", { name: "Giriş sayfasına dön" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toHaveAttribute("href", "/sifremi-unuttum");
    expect(screen.queryByLabelText("Yeni şifre", { exact: true })).not.toBeInTheDocument();
  });

  it("treats a missing token like an invalid link without calling the server", async () => {
    setUrl("/sifre-belirle");
    render(<SetPasswordView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(LINK_INVALID);
    expect(getTokenInfo).not.toHaveBeenCalled();
  });

  it("switches to the invalid-link page when the link is used up while the form is open", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockRejectedValue(new ApiError(LINK_INVALID, 410));
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByRole("alert")).toHaveTextContent(LINK_INVALID);
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toBeInTheDocument();
  });

  it("falls back to the login page when the profile cannot be read after setting the password", async () => {
    setUrl("/sifre-belirle?token=abc");
    getTokenInfo.mockResolvedValue(INFO);
    setPassword.mockResolvedValue({ access_token: "tok" });
    getMe.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<SetPasswordView />);
    await screen.findByText(/Merhaba Ayşe Demir/);

    await fill(user, "yeni-guclu-sifre", "yeni-guclu-sifre");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd frontend && npx vitest run src/components/__tests__/AuthPages.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/components/auth/ForgotPasswordView"`.

- [ ] **Step 3: Implement**

Modify `frontend/src/app/login/page.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/app/login/page.tsx
+++ b/frontend/src/app/login/page.tsx
@@ -1,82 +1,5 @@
-"use client";
-
-import { useState } from "react";
-import { useRouter } from "next/navigation";
-
-import { getMe, login, setToken } from "@/lib/api";
+import { LoginView } from "@/components/auth/LoginView";
 
 export default function LoginPage() {
-  const router = useRouter();
-  const [email, setEmail] = useState("admin@demo.casebridge.dev");
-  const [password, setPassword] = useState("demo1234");
-  const [error, setError] = useState<string | null>(null);
-  const [submitting, setSubmitting] = useState(false);
-
-  async function handleSubmit(event: React.FormEvent) {
-    event.preventDefault();
-    setSubmitting(true);
-    setError(null);
-    try {
-      const { access_token } = await login(email, password);
-      setToken(access_token);
-      const user = await getMe();
-      router.push(user.role === "admin" ? "/admin" : "/dashboard");
-    } catch {
-      setError("E-posta veya şifre hatalı.");
-    } finally {
-      setSubmitting(false);
-    }
-  }
-
-  return (
-    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
-      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-white p-8 shadow-card">
-        <div className="mb-6">
-          <div>
-            <p className="text-base font-semibold text-navy-900">CaseBridge</p>
-            <p className="text-[11px] text-navy-500">Hukuk bürosu çalışma alanı</p>
-          </div>
-        </div>
-
-        <form onSubmit={handleSubmit} className="space-y-4">
-          <div>
-            <label htmlFor="email" className="mb-1 block text-sm font-medium text-navy-700">
-              E-posta
-            </label>
-            <input
-              id="email"
-              type="email"
-              required
-              value={email}
-              onChange={(event) => setEmail(event.target.value)}
-              className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
-            />
-          </div>
-          <div>
-            <label htmlFor="password" className="mb-1 block text-sm font-medium text-navy-700">
-              Şifre
-            </label>
-            <input
-              id="password"
-              type="password"
-              required
-              value={password}
-              onChange={(event) => setPassword(event.target.value)}
-              className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
-            />
-          </div>
-
-          {error && <p className="text-sm text-red-600">{error}</p>}
-
-          <button
-            type="submit"
-            disabled={submitting}
-            className="w-full rounded-xl bg-accent-600 py-2.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
-          >
-            {submitting ? "Giriş yapılıyor..." : "Giriş Yap"}
-          </button>
-        </form>
-      </div>
-    </div>
-  );
+  return <LoginView />;
 }
```

Create `frontend/src/app/sifre-belirle/page.tsx`:

```tsx
import { Suspense } from "react";

import { SetPasswordView } from "@/components/auth/SetPasswordView";

export default function SetPasswordPage() {
  // SetPasswordView reads the link from the query string (useSearchParams).
  return (
    <Suspense fallback={null}>
      <SetPasswordView />
    </Suspense>
  );
}
```

Create `frontend/src/app/sifremi-unuttum/page.tsx`:

```tsx
import { ForgotPasswordView } from "@/components/auth/ForgotPasswordView";

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
```

Create `frontend/src/components/auth/AuthCard.tsx`:

```tsx
import type { ReactNode } from "react";

/** The centred card shared by the pages that need no login: login, forgot
 * password and set password (they live outside AppShell). */
export function AuthCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-white p-8 shadow-card">
        <div className="mb-6">
          <p className="text-base font-semibold text-navy-900">CaseBridge</p>
          <p className="text-[11px] text-navy-500">Hukuk bürosu çalışma alanı</p>
        </div>
        {title && <h1 className="mb-4 text-lg font-semibold text-navy-900">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

export const AUTH_INPUT =
  "w-full rounded-xl border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400";
export const AUTH_LABEL = "mb-1 block text-sm font-medium text-navy-700";
export const AUTH_BUTTON =
  "w-full rounded-xl bg-accent-600 py-2.5 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60";
```

Create `frontend/src/components/auth/ForgotPasswordView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AuthCard } from "@/components/auth/AuthCard";
import { forgotPassword } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";

const SENT_MESSAGE = "Bu e-posta ile kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.";

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(userMessage(err, "İstek gönderilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Şifremi unuttum">
      {sent ? (
        <p role="status" className="text-sm text-navy-700">
          {SENT_MESSAGE}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-navy-500">E-posta adresinizi yazın; şifrenizi sıfırlamanız için bir bağlantı gönderelim.</p>
          <div>
            <label htmlFor="forgot-email" className={AUTH_LABEL}>
              E-posta
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={AUTH_INPUT}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="submit" aria-disabled={submitting} className={AUTH_BUTTON}>
            {submitting ? "Gönderiliyor..." : "Bağlantı gönder"}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-accent-700 hover:underline">
          Giriş sayfasına dön
        </Link>
      </p>
    </AuthCard>
  );
}
```

Create `frontend/src/components/auth/LoginView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AuthCard } from "@/components/auth/AuthCard";
import { getAuthConfig, getMe, login, setToken } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";

export function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    // The hint is optional: if the call fails the form simply has no hint.
    getAuthConfig()
      .then((config) => {
        if (active) setDemoMode(config.demo_mode);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { access_token } = await login(email, password);
      setToken(access_token);
      const user = await getMe();
      router.push(user.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(userMessage(err, "Giriş yapılamadı. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className={AUTH_LABEL}>
            E-posta
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <div>
          <label htmlFor="password" className={AUTH_LABEL}>
            Şifre
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={AUTH_INPUT}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button type="submit" aria-disabled={submitting} className={AUTH_BUTTON}>
          {submitting ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
        <p className="text-center text-sm">
          <Link href="/sifremi-unuttum" className="text-accent-700 hover:underline">
            Şifremi unuttum
          </Link>
        </p>
      </form>

      {demoMode && (
        <div className="mt-6 rounded-xl border border-surface-border bg-surface-muted px-4 py-3 text-xs text-navy-600">
          <p className="mb-1 font-medium text-navy-700">Demo hesapları</p>
          <p>Yönetici: admin@demo.casebridge.dev</p>
          <p>Avukat: avukat@demo.casebridge.dev</p>
          <p>Şifre: demo1234</p>
        </div>
      )}
    </AuthCard>
  );
}
```

Create `frontend/src/components/auth/SetPasswordView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AuthCard } from "@/components/auth/AuthCard";
import { getMe, getTokenInfo, setPassword } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { PASSWORD_HINT, validateNewPassword } from "@/lib/passwordRules";
import { userMessage } from "@/lib/userMessages";
import type { TokenInfo } from "@/types";

const LINK_INVALID = "Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.";

type Phase =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; info: TokenInfo };

export function SetPasswordView() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
    getTokenInfo(token).then(
      (info) => {
        if (active) setPhase({ kind: "ready", info });
      },
      (err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 410) setPhase({ kind: "invalid" });
        else setPhase({ kind: "failed", message: userMessage(err, "Bağlantı doğrulanamadı. Lütfen sayfayı yenileyin.") });
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || phase.kind !== "ready") return;
    const problem = validateNewPassword(password, confirm, phase.info.email);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await setPassword(token, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setPhase({ kind: "invalid" });
      else setError(userMessage(err, "Şifre belirlenemedi. Lütfen tekrar deneyin."));
      inFlight.current = false;
      setSubmitting(false);
      return;
    }
    // The password is set and the new token stored: continue to the right home page.
    try {
      const user = await getMe();
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    } catch {
      router.replace("/login");
    }
  }

  if (phase.kind === "loading") {
    return (
      <AuthCard>
        <p role="status" className="text-sm text-navy-500">
          Bağlantı doğrulanıyor...
        </p>
      </AuthCard>
    );
  }

  if (phase.kind === "invalid" || phase.kind === "failed") {
    return (
      <AuthCard title="Bağlantı geçersiz">
        <p role="alert" className="text-sm text-navy-700">
          {phase.kind === "invalid" ? LINK_INVALID : phase.message}
        </p>
        <p className="mt-4 flex flex-col gap-2 text-center text-sm">
          <Link href="/login" className="text-accent-700 hover:underline">
            Giriş sayfasına dön
          </Link>
          <Link href="/sifremi-unuttum" className="text-accent-700 hover:underline">
            Şifremi unuttum
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Şifrenizi belirleyin">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-navy-600">Merhaba {phase.info.full_name}, CaseBridge şifrenizi belirleyin.</p>
        <div>
          <label htmlFor="new-password" className={AUTH_LABEL}>
            Yeni şifre
          </label>
          <input
            id="new-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            aria-describedby="password-hint"
            className={AUTH_INPUT}
          />
          <p id="password-hint" className="mt-1 text-xs text-navy-500">
            {PASSWORD_HINT}
          </p>
        </div>
        <div>
          <label htmlFor="confirm-password" className={AUTH_LABEL}>
            Yeni şifre (tekrar)
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" aria-disabled={submitting} className={AUTH_BUTTON}>
          {submitting ? "Kaydediliyor..." : "Şifreyi belirle"}
        </button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd frontend && npx vitest run src/components/__tests__/AuthPages.test.tsx
```

Expected: PASS — Test Files 1 passed (1); Tests 18 passed (18).

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: PASS — no failing test and no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/login/page.tsx frontend/src/app/sifre-belirle/page.tsx frontend/src/app/sifremi-unuttum/page.tsx frontend/src/components/__tests__/AuthPages.test.tsx frontend/src/components/auth/AuthCard.tsx frontend/src/components/auth/ForgotPasswordView.tsx frontend/src/components/auth/LoginView.tsx frontend/src/components/auth/SetPasswordView.tsx
git commit -F - <<'EOF'
feat: empty login form, forgot-password and set-password pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 10: User menu, logout and the Hesabım page (frontend)

The signed-in user's menu, sign-out, and the account page (Decisions 6 and 7). The existing `WorkspaceHeader` tests move to the shared router mock because `UserMenu` needs `useRouter`; the shared mock now returns one stable router (Decision 18).

**Files:**
- Create: `frontend/src/app/hesabim/page.tsx`
- Create: `frontend/src/components/AccountView.tsx`
- Create: `frontend/src/components/UserMenu.tsx`
- Create: `frontend/src/lib/userEvents.ts`
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/components/WorkspaceHeader.tsx`
- Test (create): `frontend/src/components/__tests__/AccountView.test.tsx`
- Test (create): `frontend/src/components/__tests__/UserMenu.test.tsx`
- Test (modify): `frontend/src/components/__tests__/WorkspaceHeader.test.tsx`
- Test (modify): `frontend/src/test/navigation.ts`

**Interfaces:**
- Consumes: Task 8 (`logout`, `updateProfile`, `changePassword`, `getMe`, `validateNewPassword`, `userMessage`), `AppShell`, `WorkspaceHeader`, `src/test/navigation.ts`.
- Produces: `src/lib/userEvents.ts` (`announceUserUpdated(user: AppUser): void`, `subscribeUserUpdated(handler): () => void`); `UserMenu({user: AppUser | null})` (button `aria-label="Kullanıcı menüsü, <name>"`, `role="menu"` with `Hesabım` → `/hesabim` and `Çıkış yap`); `AccountView`; page `/hesabim`; `PAGE_TITLES["/hesabim"] = "Hesabım"`; `AppShell` subscribes to `userEvents`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/AccountView.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getMe = vi.fn();
const updateProfile = vi.fn();
const changePassword = vi.fn();
vi.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  updateProfile: (...args: unknown[]) => updateProfile(...args),
  changePassword: (...args: unknown[]) => changePassword(...args),
}));
const announce = vi.fn();
vi.mock("@/lib/userEvents", () => ({ announceUserUpdated: (...args: unknown[]) => announce(...args) }));

import { AccountView } from "@/components/AccountView";
import { ApiError } from "@/lib/apiError";
import type { AppUser } from "@/types";

const ME: AppUser = {
  id: "u1", email: "ayse@example.com", full_name: "Ayşe Demir", department: "İş Hukuku", gender: null,
  role: "lawyer", law_firm_id: "f1", is_active: true,
};

beforeEach(() => {
  for (const mock of [getMe, updateProfile, changePassword, announce]) mock.mockReset();
  getMe.mockResolvedValue(ME);
});

async function openPage() {
  const user = userEvent.setup();
  render(<AccountView />);
  await screen.findByRole("heading", { name: "Hesabım" });
  return user;
}

describe("AccountView profile", () => {
  it("shows the profile, saves the name and department and tells the shell", async () => {
    updateProfile.mockResolvedValue({ ...ME, full_name: "Ayşe Yılmaz", department: null });
    const user = await openPage();

    expect(screen.getByLabelText("Ad soyad")).toHaveValue("Ayşe Demir");
    expect(screen.getByLabelText("Departman")).toHaveValue("İş Hukuku");
    expect(screen.getByText("ayse@example.com")).toBeInTheDocument();
    expect(screen.getByText("Avukat")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Ad soyad"));
    await user.type(screen.getByLabelText("Ad soyad"), "Ayşe Yılmaz");
    await user.clear(screen.getByLabelText("Departman"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bilgileriniz güncellendi.");
    expect(updateProfile).toHaveBeenCalledWith({ full_name: "Ayşe Yılmaz", department: null });
    expect(announce).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Ayşe Yılmaz" }));
    expect(screen.getByLabelText("Ad soyad")).toHaveValue("Ayşe Yılmaz");
  });

  it("does not call the server with an empty name", async () => {
    const user = await openPage();

    await user.clear(screen.getByLabelText("Ad soyad"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ad soyad boş olamaz.");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("shows only ApiError messages, otherwise a Turkish fallback", async () => {
    updateProfile.mockRejectedValueOnce(new ApiError("Ad soyad 1-255 karakter olmalı.", 422));
    const user = await openPage();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ad soyad 1-255 karakter olmalı.");

    updateProfile.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bilgileriniz güncellenemedi. Lütfen tekrar deneyin."));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
  });

  it("shows an error state when the profile cannot be loaded", async () => {
    getMe.mockRejectedValue(new Error("down"));
    render(<AccountView />);

    expect(await screen.findByText("Hesap bilgileri yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });
});

describe("AccountView password", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, again: string) {
    await user.type(screen.getByLabelText("Mevcut şifre"), current);
    await user.type(screen.getByLabelText("Yeni şifre", { exact: true }), next);
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), again);
    await user.click(screen.getByRole("button", { name: "Şifreyi değiştir" }));
  }

  it("changes the password, confirms and clears the fields", async () => {
    changePassword.mockResolvedValue({ access_token: "new" });
    const user = await openPage();

    await fill(user, "eski-sifre-12", "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByText("Şifreniz değiştirildi.")).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith("eski-sifre-12", "yeni-guclu-sifre");
    expect(screen.getByLabelText("Mevcut şifre")).toHaveValue("");
    expect(screen.getByLabelText("Yeni şifre", { exact: true })).toHaveValue("");
  });

  it("shows the server's message for a wrong current password and keeps the entries", async () => {
    changePassword.mockRejectedValue(new ApiError("Mevcut şifre hatalı.", 400));
    const user = await openPage();

    await fill(user, "yanlis-sifre-1", "yeni-guclu-sifre", "yeni-guclu-sifre");

    expect(await screen.findByRole("alert")).toHaveTextContent("Mevcut şifre hatalı.");
    expect(screen.getByLabelText("Mevcut şifre")).toHaveValue("yanlis-sifre-1");
  });

  it("checks the new password locally before calling the server", async () => {
    const user = await openPage();

    await fill(user, "eski-sifre-12", "kisa", "kisa");
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre en az 10 karakter olmalı.");

    await user.clear(screen.getByLabelText("Yeni şifre", { exact: true }));
    await user.clear(screen.getByLabelText("Yeni şifre (tekrar)"));
    await user.type(screen.getByLabelText("Yeni şifre", { exact: true }), "yeni-guclu-sifre");
    await user.type(screen.getByLabelText("Yeni şifre (tekrar)"), "baska-guclu-sifre");
    await user.click(screen.getByRole("button", { name: "Şifreyi değiştir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Şifreler eşleşmiyor.");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("ignores a second submit while the first is running and keeps the button focusable", async () => {
    let finish: (value: { access_token: string }) => void = () => undefined;
    changePassword.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = await openPage();

    await fill(user, "eski-sifre-12", "yeni-guclu-sifre", "yeni-guclu-sifre");
    const busy = await screen.findByRole("button", { name: "Kaydediliyor..."  });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await user.click(busy);
    expect(changePassword).toHaveBeenCalledTimes(1);

    finish({ access_token: "new" });
    expect(await screen.findByText("Şifreniz değiştirildi.")).toBeInTheDocument();
  });
});
```

Create `frontend/src/components/__tests__/UserMenu.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const logout = vi.fn();
const getMe = vi.fn();
vi.mock("@/lib/api", () => ({
  logout: (...args: unknown[]) => logout(...args),
  getMe: (...args: unknown[]) => getMe(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
vi.mock("@/components/Sidebar", () => ({ Sidebar: () => <nav aria-label="Ana menü" /> }));
vi.mock("@/components/CaseQuickView", () => ({ CaseQuickView: () => null }));
vi.mock("@/components/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/UpcomingNotifications", () => ({ UpcomingNotifications: () => null }));
import { nav, resetNav, setUrl } from "@/test/navigation";

import { AppShell } from "@/components/AppShell";
import { UserMenu } from "@/components/UserMenu";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { announceUserUpdated } from "@/lib/userEvents";
import type { AppUser } from "@/types";

const ADMIN: AppUser = {
  id: "u1", email: "ayse@example.com", full_name: "Ayşe Demir", department: null, gender: null,
  role: "admin", law_firm_id: "f1", is_active: true,
};

beforeEach(() => {
  logout.mockReset();
  getMe.mockReset();
  resetNav();
});

describe("UserMenu", () => {
  it("shows the name and role and keeps the menu closed until it is opened", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={ADMIN} />);

    const trigger = screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Demir" });
    expect(trigger).toHaveTextContent("Ayşe Demir");
    expect(trigger).toHaveTextContent("Yönetici");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Hesabım" })).toHaveAttribute("href", "/hesabim");
    expect(screen.getByRole("menuitem", { name: "Çıkış yap" })).toBeInTheDocument();
  });

  it("shows Avukat for a lawyer and a neutral label before the user is loaded", () => {
    const { rerender } = render(<UserMenu user={{ ...ADMIN, role: "lawyer" }} />);
    expect(screen.getByRole("button")).toHaveTextContent("Avukat");

    rerender(<UserMenu user={null} />);
    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Kullanıcı" })).toBeInTheDocument();
  });

  it("closes on Escape (focus returns to the button) and on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Dışarıda</button>
        <UserMenu user={ADMIN} />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: /Kullanıcı menüsü/ });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Dışarıda" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("logs out: calls the endpoint, then goes to /login", async () => {
    logout.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UserMenu user={ADMIN} />);

    await user.click(screen.getByRole("button", { name: /Kullanıcı menüsü/ }));
    await user.click(screen.getByRole("menuitem", { name: "Çıkış yap" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click on Çıkış yap while the first is running (aria-disabled, not disabled)", async () => {
    let finish: () => void = () => undefined;
    logout.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<UserMenu user={ADMIN} />);

    await user.click(screen.getByRole("button", { name: /Kullanıcı menüsü/ }));
    const item = screen.getByRole("menuitem", { name: "Çıkış yap" });
    await user.click(item);
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toBeDisabled();
    await user.click(item);
    expect(logout).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
  });

  it("is part of the workspace header", () => {
    setUrl("/hesabim");
    render(<WorkspaceHeader user={ADMIN} />);

    expect(screen.getByText("CaseBridge / Hesabım")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kullanıcı menüsü/ })).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("updates the header when the account page announces a new name", async () => {
    let resolveMe: (user: AppUser) => void = () => undefined;
    getMe.mockReturnValue(new Promise<AppUser>((resolve) => (resolveMe = resolve)));
    window.localStorage.setItem("casebridge_token", "tok");
    render(
      <AppShell>
        <p>içerik</p>
      </AppShell>,
    );
    await act(async () => resolveMe(ADMIN));

    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Demir" })).toBeInTheDocument();

    await act(async () => announceUserUpdated({ ...ADMIN, full_name: "Ayşe Yılmaz" }));

    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Yılmaz" })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("sends a visitor without a token to /login", () => {
    window.localStorage.clear();
    render(
      <AppShell>
        <p>içerik</p>
      </AppShell>,
    );

    expect(nav.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("içerik")).not.toBeInTheDocument();
  });
});
```

Modify `frontend/src/components/__tests__/WorkspaceHeader.test.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/__tests__/WorkspaceHeader.test.tsx
+++ b/frontend/src/components/__tests__/WorkspaceHeader.test.tsx
@@ -2,7 +2,8 @@ import { beforeEach, describe, expect, it, vi } from "vitest";
 import { render, screen, waitFor } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 
-vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));
+vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
+import { resetNav, setUrl } from "@/test/navigation";
 const getCases = vi.fn();
 const getPrecedents = vi.fn();
 const listAllTasks = vi.fn();
@@ -20,6 +21,8 @@ import type { CalendarEvent } from "@/types";
 
 beforeEach(() => {
   vi.clearAllMocks();
+  resetNav();
+  setUrl("/admin");
   getCases.mockResolvedValue([]);
   getPrecedents.mockResolvedValue([]);
   listAllTasks.mockResolvedValue([]);
@@ -38,6 +41,7 @@ describe("WorkspaceHeader", () => {
     expect(screen.getByRole("link", { name: "Görevler" })).toHaveAttribute("href", "/gorevler");
     expect(screen.getByText("Ayşe Demir")).toBeInTheDocument();
     expect(screen.getByText("Yönetici")).toBeInTheDocument();
+    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Demir" })).toBeInTheDocument();
     await waitFor(() => expect(screen.getByRole("button", { name: "Bildirimler" })).toBeInTheDocument());
   });
```

Modify `frontend/src/test/navigation.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/test/navigation.ts
+++ b/frontend/src/test/navigation.ts
@@ -30,8 +30,11 @@ export function resetNav() {
   nav.back.mockReset();
 }
 
+// Like the real Next router, one stable object: effects that depend on it must not re-run on every render.
+const router = { push: nav.push, replace: nav.replace, back: nav.back, refresh: vi.fn(), prefetch: vi.fn() };
+
 export const navigationModule = {
   usePathname: () => nav.pathname,
   useSearchParams: () => nav.searchParams,
-  useRouter: () => ({ push: nav.push, replace: nav.replace, back: nav.back, refresh: vi.fn(), prefetch: vi.fn() }),
+  useRouter: () => router,
 };
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd frontend && npx vitest run src/components/__tests__/AccountView.test.tsx src/components/__tests__/UserMenu.test.tsx src/components/__tests__/WorkspaceHeader.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/components/AccountView"` / `"@/components/UserMenu"`, and the updated `WorkspaceHeader` test cannot find the menu button.

- [ ] **Step 3: Implement**

Create `frontend/src/app/hesabim/page.tsx`:

```tsx
import { AccountView } from "@/components/AccountView";
import { AppShell } from "@/components/AppShell";

export default function AccountPage() {
  return (
    <AppShell>
      <AccountView />
    </AppShell>
  );
}
```

Create `frontend/src/components/AccountView.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { changePassword, getMe, updateProfile } from "@/lib/api";
import { PASSWORD_HINT, validateNewPassword } from "@/lib/passwordRules";
import { announceUserUpdated } from "@/lib/userEvents";
import { userMessage } from "@/lib/userMessages";
import type { AppUser } from "@/types";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";
const LABEL = "text-xs font-medium text-navy-600";
const BUTTON =
  "rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60";
const CARD = "rounded-2xl border border-surface-border bg-white p-5 shadow-card";

type Notice = { kind: "ok" | "error"; message: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return notice.kind === "ok" ? (
    <p role="status" className="text-sm text-emerald-700">{notice.message}</p>
  ) : (
    <p role="alert" className="text-sm text-red-700">{notice.message}</p>
  );
}

export function AccountView() {
  const [me, setMe] = useState<AppUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileInFlight = useRef(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const passwordInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    getMe().then(
      (result) => {
        if (!active) return;
        setMe(result);
        setFullName(result.full_name);
        setDepartment(result.department ?? "");
      },
      () => {
        if (active) setLoadError("Hesap bilgileri yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (profileInFlight.current) return;
    if (!fullName.trim()) {
      setProfileNotice({ kind: "error", message: "Ad soyad boş olamaz." });
      return;
    }
    profileInFlight.current = true;
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      const updated = await updateProfile({ full_name: fullName, department: department.trim() || null });
      setMe(updated);
      setFullName(updated.full_name);
      setDepartment(updated.department ?? "");
      announceUserUpdated(updated);
      setProfileNotice({ kind: "ok", message: "Bilgileriniz güncellendi." });
    } catch (err) {
      setProfileNotice({ kind: "error", message: userMessage(err, "Bilgileriniz güncellenemedi. Lütfen tekrar deneyin.") });
    } finally {
      profileInFlight.current = false;
      setSavingProfile(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordInFlight.current || !me) return;
    const problem = validateNewPassword(newPassword, confirmPassword, me.email);
    if (problem) {
      setPasswordNotice({ kind: "error", message: problem });
      return;
    }
    passwordInFlight.current = true;
    setSavingPassword(true);
    setPasswordNotice(null);
    try {
      // changePassword stores the new token: the other sessions end, this one goes on.
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({ kind: "ok", message: "Şifreniz değiştirildi." });
    } catch (err) {
      setPasswordNotice({ kind: "error", message: userMessage(err, "Şifre değiştirilemedi. Lütfen tekrar deneyin.") });
    } finally {
      passwordInFlight.current = false;
      setSavingPassword(false);
    }
  }

  if (loadError) return <ErrorState message={loadError} />;
  if (!me) return <LoadingState />;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Hesabım</h1>
        <p className="text-sm text-navy-500">Bilgilerinizi ve şifrenizi yönetin.</p>
      </div>

      <section aria-labelledby="account-profile" className={CARD}>
        <h2 id="account-profile" className="mb-3 text-sm font-medium text-navy-700">Profil</h2>
        <form onSubmit={saveProfile} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-name" className={LABEL}>Ad soyad</label>
              <input id="account-name" value={fullName} maxLength={255} onChange={(e) => setFullName(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="account-department" className={LABEL}>Departman</label>
              <input id="account-department" value={department} maxLength={100} onChange={(e) => setDepartment(e.target.value)} className={INPUT} />
            </div>
          </div>
          <dl className="grid grid-cols-[100px_1fr] gap-y-1 text-sm">
            <dt className="text-navy-500">E-posta</dt>
            <dd className="text-navy-800">{me.email}</dd>
            <dt className="text-navy-500">Rol</dt>
            <dd className="text-navy-800">{me.role === "admin" ? "Yönetici" : "Avukat"}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" aria-disabled={savingProfile} className={BUTTON}>
              {savingProfile ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <NoticeLine notice={profileNotice} />
          </div>
        </form>
      </section>

      <section aria-labelledby="account-password" className={CARD}>
        <h2 id="account-password" className="mb-3 text-sm font-medium text-navy-700">Şifre değiştir</h2>
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="current-password" className={LABEL}>Mevcut şifre</label>
              <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="account-new-password" className={LABEL}>Yeni şifre</label>
              <input id="account-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-describedby="account-password-hint" className={INPUT} />
            </div>
            <div>
              <label htmlFor="account-confirm-password" className={LABEL}>Yeni şifre (tekrar)</label>
              <input id="account-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT} />
            </div>
          </div>
          <p id="account-password-hint" className="text-xs text-navy-500">{PASSWORD_HINT}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" aria-disabled={savingPassword} className={BUTTON}>
              {savingPassword ? "Kaydediliyor..." : "Şifreyi değiştir"}
            </button>
            <NoticeLine notice={passwordNotice} />
          </div>
        </form>
      </section>
    </div>
  );
}
```

Modify `frontend/src/components/AppShell.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/AppShell.tsx
+++ b/frontend/src/components/AppShell.tsx
@@ -8,6 +8,7 @@ import { ErrorBoundary } from "@/components/ErrorBoundary";
 import { CaseQuickView } from "@/components/CaseQuickView";
 import { WorkspaceHeader } from "@/components/WorkspaceHeader";
 import { getMe } from "@/lib/api";
+import { subscribeUserUpdated } from "@/lib/userEvents";
 import type { AppUser } from "@/types";
 
 export function AppShell({ children }: { children: React.ReactNode }) {
@@ -27,6 +28,9 @@ export function AppShell({ children }: { children: React.ReactNode }) {
     }).catch(() => router.replace("/login"));
   }, [router]);
 
+  // The account page announces profile changes so the header stays current.
+  useEffect(() => subscribeUserUpdated(setUser), []);
+
   if (!ready) return null;
 
   // Suspense boundaries: views and the drawer read useSearchParams(), which
```

Create `frontend/src/components/UserMenu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { logout } from "@/lib/api";
import type { AppUser } from "@/types";

export function UserMenu({ user }: { user: AppUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const loggingOutRef = useRef(false);

  const name = user?.full_name ?? "Kullanıcı";
  const roleLabel = user?.role === "admin" ? "Yönetici" : "Avukat";
  const initials =
    user?.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR") ?? "CB";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    // logout() never rejects: the token is discarded even if the call fails.
    await logout();
    router.replace("/login");
  }

  return (
    <div ref={rootRef} className="relative border-l border-surface-border pl-4">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Kullanıcı menüsü, ${name}`}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-surface-muted"
      >
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-700">
          {initials}
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="block max-w-36 truncate text-sm font-medium text-navy-900">{name}</span>
          <span className="block text-xs text-navy-500">{roleLabel}</span>
        </span>
        <span aria-hidden="true" className="text-xs text-navy-400">▾</span>
      </button>

      {open && (
        <div role="menu" aria-label="Kullanıcı menüsü" className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-surface-border bg-white py-1 shadow-card">
          <Link
            role="menuitem"
            href="/hesabim"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-navy-700 hover:bg-surface-muted"
          >
            Hesabım
          </Link>
          <button
            type="button"
            role="menuitem"
            aria-disabled={loggingOut}
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60"
          >
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
```

Modify `frontend/src/components/WorkspaceHeader.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/WorkspaceHeader.tsx
+++ b/frontend/src/components/WorkspaceHeader.tsx
@@ -5,6 +5,7 @@ import { usePathname } from "next/navigation";
 
 import { GlobalSearch } from "@/components/GlobalSearch";
 import { UpcomingNotifications } from "@/components/UpcomingNotifications";
+import { UserMenu } from "@/components/UserMenu";
 import type { AppUser } from "@/types";
 
 const PAGE_TITLES: Record<string, string> = {
@@ -18,6 +19,7 @@ const PAGE_TITLES: Record<string, string> = {
   "/analitik": "Analitik",
   "/raporlar": "Raporlar",
   "/ayarlar": "Ayarlar",
+  "/hesabim": "Hesabım",
   "/ai": "CaseBridge AI",
   "/ai/analiz": "Dosya Analizi",
   "/ai/durusma": "Canlı Duruşma",
@@ -34,7 +36,6 @@ function titleForPath(pathname: string): string {
 export function WorkspaceHeader({ user }: { user: AppUser | null }) {
   const pathname = usePathname() ?? "";
   const today = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
-  const initials = user?.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR") ?? "CB";
 
   return (
     <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-[#E6E8EF] bg-[#FAF9F7] px-6 py-4 lg:px-8">
@@ -49,13 +50,7 @@ export function WorkspaceHeader({ user }: { user: AppUser | null }) {
           <Link href="/takvim" className="rounded-lg px-3 py-2 text-navy-600 hover:bg-surface-muted hover:text-navy-900">Takvim</Link>
           <Link href="/gorevler" className="rounded-lg px-3 py-2 text-navy-600 hover:bg-surface-muted hover:text-navy-900">Görevler</Link>
         </nav>
-        <div className="flex items-center gap-2 border-l border-surface-border pl-4">
-          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-700">{initials}</span>
-          <div className="min-w-0 leading-tight">
-            <p className="max-w-36 truncate text-sm font-medium text-navy-900">{user?.full_name ?? "Kullanıcı"}</p>
-            <p className="text-xs text-navy-500">{user?.role === "admin" ? "Yönetici" : "Avukat"}</p>
-          </div>
-        </div>
+        <UserMenu user={user} />
       </div>
     </header>
   );
```

Create `frontend/src/lib/userEvents.ts`:

```ts
import type { AppUser } from "@/types";

const USER_UPDATED = "casebridge:user-updated";

/** Tells the app shell that the signed-in user's profile changed, so the
 * header shows the new name without a reload. */
export function announceUserUpdated(user: AppUser): void {
  window.dispatchEvent(new CustomEvent<AppUser>(USER_UPDATED, { detail: user }));
}

export function subscribeUserUpdated(handler: (user: AppUser) => void): () => void {
  function listener(event: Event) {
    handler((event as CustomEvent<AppUser>).detail);
  }
  window.addEventListener(USER_UPDATED, listener);
  return () => window.removeEventListener(USER_UPDATED, listener);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd frontend && npx vitest run src/components/__tests__/AccountView.test.tsx src/components/__tests__/UserMenu.test.tsx src/components/__tests__/WorkspaceHeader.test.tsx
```

Expected: PASS — Test Files 3 passed (3); Tests 20 passed (20).

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: PASS — no failing test and no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/hesabim/page.tsx frontend/src/components/AccountView.tsx frontend/src/components/AppShell.tsx frontend/src/components/UserMenu.tsx frontend/src/components/WorkspaceHeader.tsx frontend/src/components/__tests__/AccountView.test.tsx frontend/src/components/__tests__/UserMenu.test.tsx frontend/src/components/__tests__/WorkspaceHeader.test.tsx frontend/src/lib/userEvents.ts frontend/src/test/navigation.ts
git commit -F - <<'EOF'
feat: user menu, logout and Hesabım page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 11: Settings > Kullanıcılar: table, create/edit modal, deactivate-with-transfer modal (frontend)

The administrator's user management UI (Decision 11). `ModalFrame` is the shared dialog frame (title, Escape unless busy, focus in and back out).

**Files:**
- Create: `frontend/src/components/ModalFrame.tsx`
- Create: `frontend/src/components/users/DeactivateUserModal.tsx`
- Create: `frontend/src/components/users/UserFormModal.tsx`
- Create: `frontend/src/components/users/UsersPanel.tsx`
- Modify: `frontend/src/components/SettingsView.tsx`
- Test (modify): `frontend/src/components/__tests__/SettingsView.test.tsx`
- Test (create): `frontend/src/components/__tests__/UsersPanel.test.tsx`

**Interfaces:**
- Consumes: Task 8 (`listManagedUsers`, `createManagedUser`, `updateManagedUser`, `resendUserInvite`, `sendUserPasswordReset`, `getUserWorkload`, `deactivateUser`, `activateUser`, `userMessage`, types).
- Produces: `ModalFrame({title, onClose, busy?, children})`; `UserFormModal({user?, isSelf?, onClose, onSaved})` with `UserSaved = {kind: "created", user: ManagedUserInvite} | {kind: "updated", user: ManagedUser}`; `DeactivateUserModal({user, candidates: ManagedUser[], onClose, onDone: (result: DeactivateResult) => void})`; `UsersPanel({currentUser: AppUser})`; `SettingsView` shows `UsersPanel` for administrators and no longer calls `listUsers`.

- [ ] **Step 1: Write the failing tests**

Modify `frontend/src/components/__tests__/SettingsView.test.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/__tests__/SettingsView.test.tsx
+++ b/frontend/src/components/__tests__/SettingsView.test.tsx
@@ -2,14 +2,14 @@ import { describe, expect, it, vi, beforeEach } from "vitest";
 import { render, screen, waitFor } from "@testing-library/react";
 
 const getMe = vi.fn();
-const listUsers = vi.fn();
+const listManagedUsers = vi.fn();
 const getAiStatus = vi.fn();
 const getNotificationStatus = vi.fn();
 const sendTestEmail = vi.fn();
 
 vi.mock("@/lib/api", () => ({
   getMe: (...args: unknown[]) => getMe(...args),
-  listUsers: (...args: unknown[]) => listUsers(...args),
+  listManagedUsers: (...args: unknown[]) => listManagedUsers(...args),
   getAiStatus: (...args: unknown[]) => getAiStatus(...args),
   getNotificationStatus: (...args: unknown[]) => getNotificationStatus(...args),
   sendTestEmail: (...args: unknown[]) => sendTestEmail(...args),
@@ -29,11 +29,16 @@ const adminUser = {
   is_active: true,
 };
 
+const managed = (user: typeof adminUser, status = "active") => ({
+  id: user.id, email: user.email, full_name: user.full_name, department: null, role: user.role,
+  is_active: true, status, invited_at: null, password_set_at: "2026-10-01T09:00:00", created_at: "2026-10-01T09:00:00",
+});
+
 const lawyerUser = { ...adminUser, id: "u2", role: "lawyer", full_name: "Avukat Kullanici" };
 
 beforeEach(() => {
   getMe.mockReset();
-  listUsers.mockReset();
+  listManagedUsers.mockReset();
   getAiStatus.mockReset();
   getAiStatus.mockResolvedValue({ provider: "mock", configured: true, error: null });
   getNotificationStatus.mockReset();
@@ -44,7 +49,7 @@ beforeEach(() => {
 describe("SettingsView", () => {
   it("shows the firm's user list and AI status for an admin", async () => {
     getMe.mockResolvedValue(adminUser);
-    listUsers.mockResolvedValue([adminUser, lawyerUser]);
+    listManagedUsers.mockResolvedValue([managed(adminUser), managed(lawyerUser)]);
 
     render(<SettingsView />);
 
@@ -55,17 +60,17 @@ describe("SettingsView", () => {
 
   it("hides user management for a non-admin user", async () => {
     getMe.mockResolvedValue(lawyerUser);
-    listUsers.mockResolvedValue([adminUser, lawyerUser]);
+    listManagedUsers.mockResolvedValue([]);
 
     render(<SettingsView />);
 
     await waitFor(() => expect(screen.getByText(/sadece yöneticiler/i)).toBeInTheDocument());
     expect(screen.queryByText("Avukat Kullanici")).not.toBeInTheDocument();
+    expect(listManagedUsers).not.toHaveBeenCalled();
   });
 
   it("shows the notification settings and sends a test e-mail", async () => {
     getMe.mockResolvedValue(lawyerUser);
-    listUsers.mockResolvedValue([lawyerUser]);
     sendTestEmail.mockResolvedValue({ sent: true, backend: "smtp" });
 
     render(<SettingsView />);
@@ -81,7 +86,6 @@ describe("SettingsView", () => {
 
   it("explains console mode and shows SMTP errors", async () => {
     getMe.mockResolvedValue(lawyerUser);
-    listUsers.mockResolvedValue([lawyerUser]);
     getNotificationStatus.mockResolvedValue({ email_backend: "console", reminders_enabled: false, reminder_send_hour: 9, timezone: "Europe/Istanbul" });
     sendTestEmail.mockResolvedValueOnce({ sent: true, backend: "console" });
     sendTestEmail.mockRejectedValueOnce(new ApiError("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.", 502));
```

Create `frontend/src/components/__tests__/UsersPanel.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  listManagedUsers: vi.fn(),
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
  resendUserInvite: vi.fn(),
  sendUserPasswordReset: vi.fn(),
  getUserWorkload: vi.fn(),
  deactivateUser: vi.fn(),
  activateUser: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  listManagedUsers: (...a: unknown[]) => api.listManagedUsers(...a),
  createManagedUser: (...a: unknown[]) => api.createManagedUser(...a),
  updateManagedUser: (...a: unknown[]) => api.updateManagedUser(...a),
  resendUserInvite: (...a: unknown[]) => api.resendUserInvite(...a),
  sendUserPasswordReset: (...a: unknown[]) => api.sendUserPasswordReset(...a),
  getUserWorkload: (...a: unknown[]) => api.getUserWorkload(...a),
  deactivateUser: (...a: unknown[]) => api.deactivateUser(...a),
  activateUser: (...a: unknown[]) => api.activateUser(...a),
}));

import { ApiError } from "@/lib/apiError";
import { UsersPanel } from "@/components/users/UsersPanel";
import type { AppUser, ManagedUser } from "@/types";

function managed(id: string, name: string, over: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id, email: `${id}@firma.test`, full_name: name, department: null, role: "lawyer", is_active: true,
    status: "active", invited_at: null, password_set_at: "2026-10-01T09:00:00", created_at: "2026-10-01T09:00:00", ...over,
  };
}

const ME: AppUser = { id: "a1", email: "a1@firma.test", full_name: "Ayşe Demir", department: null, gender: null, role: "admin", law_firm_id: "f1", is_active: true };
const ADMIN = managed("a1", "Ayşe Demir", { role: "admin", department: "Yönetim" });
const LAWYER = managed("l1", "Mehmet Kaya");
const OTHER = managed("l2", "Zeynep Çelik");
const PENDING = managed("p1", "Davet Bekleyen", { status: "pending", password_set_at: null });
const INACTIVE = managed("i1", "Pasif Kişi", { status: "inactive", is_active: false });

async function openMenu(name: string, item: string) {
  await userEvent.click(screen.getByRole("button", { name: `İşlemler, ${name}` }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listManagedUsers.mockResolvedValue([ADMIN, LAWYER, OTHER, PENDING, INACTIVE]);
});

describe("UsersPanel", () => {
  it("lists the firm's users with role and status labels", async () => {
    render(<UsersPanel currentUser={ME} />);

    const table = await screen.findByRole("table");
    for (const header of ["Ad", "E-posta", "Departman", "Rol", "Durum"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const pendingRow = within(table).getByText("Davet Bekleyen").closest("tr")!;
    expect(pendingRow).toHaveTextContent("Davet bekliyor");
    expect(within(table).getByText("Pasif Kişi").closest("tr")).toHaveTextContent("Pasif");
    expect(within(table).getByText("Mehmet Kaya").closest("tr")).toHaveTextContent("Aktif");
    expect(within(table).getByText("Ayşe Demir").closest("tr")).toHaveTextContent("Yönetici");
  });

  it("offers only the actions that fit each status, and none that hurt the admin's own row", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Ayşe Demir" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Düzenle", "Şifre sıfırlama bağlantısı gönder"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Davet Bekleyen" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Düzenle", "Daveti yeniden gönder", "Pasifleştir"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "İşlemler, Pasif Kişi" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Düzenle", "Aktifleştir"]);
  });

  it("invites a new user and shows the notice", async () => {
    api.createManagedUser.mockResolvedValue({ ...managed("n1", "Yeni Kişi"), status: "pending", email_sent: true });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    const dialog = screen.getByRole("dialog", { name: "Kullanıcı ekle" });
    await userEvent.type(within(dialog).getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(within(dialog).getByLabelText("E-posta *"), "yeni@firma.test");
    await userEvent.type(within(dialog).getByLabelText("Departman"), "Ceza");
    await userEvent.selectOptions(within(dialog).getByLabelText("Rol *"), "admin");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(api.createManagedUser).toHaveBeenCalledWith({ full_name: "Yeni Kişi", email: "yeni@firma.test", department: "Ceza", role: "admin" });
    expect(await screen.findByRole("status")).toHaveTextContent("Davet gönderildi.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Yeni Kişi")).toBeInTheDocument();
  });

  it("warns when the invite e-mail could not be sent", async () => {
    api.createManagedUser.mockResolvedValue({ ...managed("n1", "Yeni Kişi"), status: "pending", email_sent: false });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(screen.getByLabelText("E-posta *"), "yeni@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.");
  });

  it("shows the server's Turkish message, or a Turkish fallback, when saving fails", async () => {
    api.createManagedUser.mockRejectedValueOnce(new ApiError("Bu e-posta adresi zaten kayıtlı.", 409));
    api.createManagedUser.mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.type(screen.getByLabelText("E-posta *"), "mehmet@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu e-posta adresi zaten kayıtlı.");

    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Kullanıcı kaydedilemedi. Lütfen tekrar deneyin."));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
  });

  it("requires a name and a valid e-mail before calling the API", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ad soyad boş olamaz.");
    await userEvent.type(screen.getByLabelText("Ad soyad *"), "Yeni Kişi");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("E-posta adresi gerekli.");
    await userEvent.type(screen.getByLabelText("E-posta *"), "yanlis-adres");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Geçerli bir e-posta adresi girin.");
    expect(api.createManagedUser).not.toHaveBeenCalled();
  });

  it("edits a user and sends only the changed fields; the admin's own role is not editable", async () => {
    api.updateManagedUser.mockResolvedValue({ ...LAWYER, department: "Ticaret" });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Düzenle");
    await userEvent.type(screen.getByLabelText("Departman"), "Ticaret");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(api.updateManagedUser).toHaveBeenCalledWith("l1", { department: "Ticaret" });
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı güncellendi.");

    await openMenu("Ayşe Demir", "Düzenle");
    expect(screen.queryByLabelText("Rol *")).not.toBeInTheDocument();
    expect(screen.getByText("Rol: Yönetici")).toBeInTheDocument();
  });

  it("resends an invite, sends a password reset link and reactivates a user", async () => {
    api.resendUserInvite.mockResolvedValue({ ...PENDING, email_sent: true });
    api.sendUserPasswordReset.mockResolvedValue({ email_sent: true });
    api.activateUser.mockResolvedValue({ ...INACTIVE, status: "active", is_active: true });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Davet Bekleyen", "Daveti yeniden gönder");
    expect(await screen.findByRole("status")).toHaveTextContent("Davet gönderildi.");
    expect(api.resendUserInvite).toHaveBeenCalledWith("p1");

    await openMenu("Mehmet Kaya", "Şifre sıfırlama bağlantısı gönder");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sıfırlama bağlantısı gönderildi."));
    expect(api.sendUserPasswordReset).toHaveBeenCalledWith("l1");

    await openMenu("Pasif Kişi", "Aktifleştir");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Kullanıcı aktifleştirildi."));
    expect(screen.getByText("Pasif Kişi").closest("tr")).toHaveTextContent("Aktif");
  });

  it("shows the server's message when an action fails", async () => {
    api.activateUser.mockRejectedValue(new ApiError("Kullanıcı zaten aktif.", 409));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Pasif Kişi", "Aktifleştir");
    expect(await screen.findByRole("alert")).toHaveTextContent("Kullanıcı zaten aktif.");
  });

  it("deactivates a user without work after a plain confirmation", async () => {
    api.getUserWorkload.mockResolvedValue({ open_cases: [], pending_tasks: [], precedents_reviewing: 0 });
    api.deactivateUser.mockResolvedValue({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 0, tasks: 0, precedents: 0 } });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Devredilecek avukat")).not.toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Pasifleştir" }));

    expect(api.deactivateUser).toHaveBeenCalledWith("l1", undefined);
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı pasifleştirildi.");
    expect(screen.getByText("Mehmet Kaya").closest("tr")).toHaveTextContent("Pasif");
  });

  it("requires a receiving lawyer when the user has work, and lists only eligible lawyers", async () => {
    api.getUserWorkload.mockResolvedValue({
      open_cases: [{ id: "c1", case_number: "2026/10", case_name: "Kaya - Demir" }],
      pending_tasks: [{ id: "t1", title: "Dilekçe hazırla", case_name: "Kaya - Demir" }],
      precedents_reviewing: 2,
    });
    api.deactivateUser.mockResolvedValue({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 1, tasks: 1, precedents: 2 } });
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("2026/10 — Kaya - Demir")).toBeInTheDocument();
    expect(within(dialog).getByText("Dilekçe hazırla — Kaya - Demir")).toBeInTheDocument();
    expect(within(dialog).getByText("İncelediği emsaller: 2")).toBeInTheDocument();

    const select = within(dialog).getByLabelText("Devredilecek avukat");
    const options = within(select).getAllByRole("option").map((el) => el.textContent);
    expect(options).toEqual(["Avukat seçin", "Zeynep Çelik"]);

    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Devredilecek avukatı seçin.");
    expect(api.deactivateUser).not.toHaveBeenCalled();

    await userEvent.selectOptions(select, "l2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Devret ve pasifleştir" }));
    expect(api.deactivateUser).toHaveBeenCalledWith("l1", "l2");
    expect(await screen.findByRole("status")).toHaveTextContent("Kullanıcı pasifleştirildi.");
  });

  it("does not send the same request twice while one is in flight", async () => {
    api.getUserWorkload.mockResolvedValue({ open_cases: [], pending_tasks: [], precedents_reviewing: 0 });
    let finish: (value: unknown) => void = () => undefined;
    api.deactivateUser.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    const button = await within(await screen.findByRole("dialog")).findByRole("button", { name: "Pasifleştir" });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "Pasifleştiriliyor..." }));
    expect(api.deactivateUser).toHaveBeenCalledTimes(1);

    finish({ user: { ...LAWYER, status: "inactive", is_active: false }, transferred: { cases: 0, tasks: 0, precedents: 0 } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a Turkish message when the list or the workload cannot be loaded", async () => {
    api.getUserWorkload.mockRejectedValue(new Error("boom"));
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await openMenu("Mehmet Kaya", "Pasifleştir");
    expect(await screen.findByRole("alert")).toHaveTextContent("İş yükü yüklenemedi. Lütfen tekrar deneyin.");
  });

  it("closes a dialog with Escape", async () => {
    render(<UsersPanel currentUser={ME} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Kullanıcı ekle" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
cd frontend && npx vitest run src/components/__tests__/SettingsView.test.tsx src/components/__tests__/UsersPanel.test.tsx
```

Expected: FAIL — `SettingsView` still imports `listUsers` (`No "listUsers" export is defined on the "@/lib/api" mock`) and `UsersPanel` does not exist.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ModalFrame.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/** Shared dialog frame: title, Escape to close (unless busy), focus moves in on open and back on close. */
export function ModalFrame({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    (first ?? dialogRef.current)?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-card outline-none"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-navy-900">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
```

Modify `frontend/src/components/SettingsView.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/SettingsView.tsx
+++ b/frontend/src/components/SettingsView.tsx
@@ -2,12 +2,12 @@
 
 import { useEffect, useState } from "react";
 
-import { getAiStatus, getMe, getNotificationStatus, listUsers, sendTestEmail } from "@/lib/api";
+import { getAiStatus, getMe, getNotificationStatus, sendTestEmail } from "@/lib/api";
 import type { AIStatus, AppUser, NotificationStatus } from "@/types";
 import { LoadingState } from "@/components/LoadingState";
 import { ErrorState } from "@/components/ErrorState";
+import { UsersPanel } from "@/components/users/UsersPanel";
 
-const ROLE_LABELS: Record<string, string> = { admin: "Yönetici", lawyer: "Avukat" };
 const EMAIL_BACKEND_LABELS: Record<NotificationStatus["email_backend"], string> = {
   smtp: "SMTP",
   console: "Konsol (yalnızca sunucu logu)",
@@ -17,7 +17,6 @@ type TestEmailState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; m
 
 export function SettingsView() {
   const [me, setMe] = useState<AppUser | null>(null);
-  const [users, setUsers] = useState<AppUser[]>([]);
   const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
   const [notifications, setNotifications] = useState<NotificationStatus | null>(null);
   const [testEmail, setTestEmail] = useState<TestEmailState>({ kind: "idle" });
@@ -27,10 +26,9 @@ export function SettingsView() {
   useEffect(() => {
     setLoading(true);
     setError(null);
-    Promise.all([getMe(), listUsers(), getAiStatus(), getNotificationStatus()])
-      .then(([meResult, usersResult, aiStatusResult, notificationResult]) => {
+    Promise.all([getMe(), getAiStatus(), getNotificationStatus()])
+      .then(([meResult, aiStatusResult, notificationResult]) => {
         setMe(meResult);
-        setUsers(usersResult);
         setAiStatus(aiStatusResult);
         setNotifications(notificationResult);
       })
@@ -120,24 +118,14 @@ export function SettingsView() {
         </section>
       )}
 
-      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
-        <p className="mb-3 text-sm font-medium text-navy-700">Kullanıcı Yönetimi</p>
-        {isAdmin ? (
-          <ul className="divide-y divide-surface-border text-sm">
-            {users.map((user) => (
-              <li key={user.id} className="flex items-center justify-between py-2">
-                <div>
-                  <p className="font-medium text-navy-800">{user.full_name}</p>
-                  <p className="text-xs text-navy-500">{user.email}</p>
-                </div>
-                <span className="text-xs text-navy-500">{ROLE_LABELS[user.role] ?? user.role}</span>
-              </li>
-            ))}
-          </ul>
-        ) : (
+      {isAdmin && me ? (
+        <UsersPanel currentUser={me} />
+      ) : (
+        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
+          <p className="mb-3 text-sm font-medium text-navy-700">Kullanıcı Yönetimi</p>
           <p className="text-sm text-navy-500">Kullanıcı yönetimi sadece yöneticiler içindir.</p>
-        )}
-      </div>
+        </div>
+      )}
     </div>
   );
 }
```

Create `frontend/src/components/users/DeactivateUserModal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { ModalFrame } from "@/components/ModalFrame";
import { deactivateUser, getUserWorkload } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { DeactivateResult, ManagedUser, UserWorkload } from "@/types";

/** Deactivation is one step with the hand-over: the work list, a required lawyer, then both happen together. */
export function DeactivateUserModal({
  user,
  candidates,
  onClose,
  onDone,
}: {
  user: ManagedUser;
  /** Active lawyers who can take the work; the modal drops the user themself. */
  candidates: ManagedUser[];
  onClose: () => void;
  onDone: (result: DeactivateResult) => void;
}) {
  const [workload, setWorkload] = useState<UserWorkload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    getUserWorkload(user.id)
      .then((result) => active && setWorkload(result))
      .catch((err) => active && setLoadError(userMessage(err, "İş yükü yüklenemedi. Lütfen tekrar deneyin.")));
    return () => {
      active = false;
    };
  }, [user.id]);

  const targets = candidates.filter((item) => item.id !== user.id && item.role === "lawyer" && item.status === "active");
  const hasWork = workload !== null && (workload.open_cases.length > 0 || workload.pending_tasks.length > 0 || workload.precedents_reviewing > 0);

  async function confirm() {
    if (inFlight.current) return;
    if (hasWork && !targetId) return setError("Devredilecek avukatı seçin.");
    setError(null);
    inFlight.current = true;
    setSaving(true);
    try {
      onDone(await deactivateUser(user.id, hasWork ? targetId : undefined));
    } catch (err) {
      setError(userMessage(err, "Kullanıcı pasifleştirilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={`${user.full_name} kullanıcısını pasifleştir`} onClose={onClose} busy={saving}>
      {loadError && (
        <p role="alert" className="text-sm text-red-700">
          {loadError}
        </p>
      )}
      {!loadError && !workload && <p className="text-sm text-navy-500">İş yükü yükleniyor...</p>}
      {workload && !hasWork && (
        <p className="text-sm text-navy-700">Bu kullanıcı pasifleştirilecek ve artık giriş yapamayacak.</p>
      )}
      {workload && hasWork && (
        <div className="space-y-3 text-sm text-navy-700">
          <p>Pasifleştirmeden önce aşağıdaki iş başka bir avukata devredilmeli.</p>
          {workload.open_cases.length > 0 && (
            <div>
              <p className="font-medium">Açık davalar ({workload.open_cases.length})</p>
              <ul className="list-disc pl-5">
                {workload.open_cases.map((item) => (
                  <li key={item.id}>
                    {item.case_number} — {item.case_name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {workload.pending_tasks.length > 0 && (
            <div>
              <p className="font-medium">Bekleyen görevler ({workload.pending_tasks.length})</p>
              <ul className="list-disc pl-5">
                {workload.pending_tasks.map((item) => (
                  <li key={item.id}>
                    {item.title} — {item.case_name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {workload.precedents_reviewing > 0 && <p>İncelediği emsaller: {workload.precedents_reviewing}</p>}
          <label className="block">
            <span className="text-xs font-medium text-navy-600">Devredilecek avukat</span>
            <select
              className="mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Avukat seçin</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
            </select>
          </label>
          {targets.length === 0 && <p className="text-amber-700">Devir için aktif bir avukat yok.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => !saving && onClose()}
          aria-disabled={saving}
          className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
        >
          Vazgeç
        </button>
        {workload && (
          <button
            type="button"
            onClick={confirm}
            aria-disabled={saving}
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white aria-disabled:opacity-60"
          >
            {saving ? "Pasifleştiriliyor..." : hasWork ? "Devret ve pasifleştir" : "Pasifleştir"}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}
```

Create `frontend/src/components/users/UserFormModal.tsx`:

```tsx
"use client";

import { useRef, useState, type FormEvent } from "react";

import { ModalFrame } from "@/components/ModalFrame";
import { createManagedUser, updateManagedUser } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { ManagedUser, ManagedUserInvite, ManagedUserUpdate, UserRole } from "@/types";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL = "text-xs font-medium text-navy-600";

export type UserSaved = { kind: "created"; user: ManagedUserInvite } | { kind: "updated"; user: ManagedUser };

/** Create (no `user`) or edit one firm user. On the admin's own row the role is shown, not editable. */
export function UserFormModal({
  user,
  isSelf = false,
  onClose,
  onSaved,
}: {
  user?: ManagedUser;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: (result: UserSaved) => void;
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [department, setDepartment] = useState(user?.department ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "lawyer");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const name = fullName.trim();
    const address = email.trim();
    if (!name) return setError("Ad soyad boş olamaz.");
    if (!address) return setError("E-posta adresi gerekli.");
    if (!EMAIL_SHAPE.test(address)) return setError("Geçerli bir e-posta adresi girin.");
    setError(null);

    inFlight.current = true;
    setSaving(true);
    try {
      if (!user) {
        const created = await createManagedUser({ full_name: name, email: address, department: department.trim() || null, role });
        onSaved({ kind: "created", user: created });
        return;
      }
      const changes: ManagedUserUpdate = {};
      if (name !== user.full_name) changes.full_name = name;
      if (address !== user.email) changes.email = address;
      if ((department.trim() || null) !== user.department) changes.department = department.trim() || null;
      if (!isSelf && role !== user.role) changes.role = role;
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      onSaved({ kind: "updated", user: await updateManagedUser(user.id, changes) });
    } catch (err) {
      setError(userMessage(err, "Kullanıcı kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={user ? "Kullanıcıyı düzenle" : "Kullanıcı ekle"} onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <label className="block">
          <span className={LABEL}>Ad soyad *</span>
          <input className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>E-posta *</span>
          <input type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>Departman</span>
          <input className={INPUT} value={department} onChange={(e) => setDepartment(e.target.value)} />
        </label>
        {isSelf ? (
          <p className="text-sm text-navy-600">Rol: {user?.role === "admin" ? "Yönetici" : "Avukat"}</p>
        ) : (
          <label className="block">
            <span className={LABEL}>Rol *</span>
            <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="lawyer">Avukat</option>
              <option value="admin">Yönetici</option>
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            aria-disabled={saving}
            className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            aria-disabled={saving}
            className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white aria-disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
```

Create `frontend/src/components/users/UsersPanel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { DeactivateUserModal } from "@/components/users/DeactivateUserModal";
import { UserFormModal, type UserSaved } from "@/components/users/UserFormModal";
import { activateUser, listManagedUsers, resendUserInvite, sendUserPasswordReset } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, DeactivateResult, ManagedUser, UserStatus } from "@/types";

const ROLE_LABELS = { admin: "Yönetici", lawyer: "Avukat" } as const;
const STATUS_LABELS: Record<UserStatus, string> = { active: "Aktif", pending: "Davet bekliyor", inactive: "Pasif" };
const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  inactive: "bg-surface-muted text-navy-500",
};
const INVITE_FAILED = "Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.";

type Notice = { tone: "ok" | "warn" | "error"; text: string };
type Dialog = { kind: "create" } | { kind: "edit"; user: ManagedUser } | { kind: "deactivate"; user: ManagedUser };

function replaceUser(list: ManagedUser[], next: ManagedUser): ManagedUser[] {
  return list.map((item) => (item.id === next.id ? next : item));
}

function RowMenu({ user, isSelf, onPick }: { user: ManagedUser; isSelf: boolean; onPick: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items: { id: string; label: string }[] = [{ id: "edit", label: "Düzenle" }];
  if (user.status === "pending") items.push({ id: "invite", label: "Daveti yeniden gönder" });
  if (user.status === "active") items.push({ id: "reset", label: "Şifre sıfırlama bağlantısı gönder" });
  if (user.status !== "inactive" && !isSelf) items.push({ id: "deactivate", label: "Pasifleştir" });
  if (user.status === "inactive") items.push({ id: "activate", label: "Aktifleştir" });

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`İşlemler, ${user.full_name}`}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-surface-border px-3 py-1 text-xs font-medium text-navy-700 hover:bg-surface-muted"
      >
        İşlemler
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-surface-border bg-white py-1 shadow-card">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(item.id);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UsersPanel({ currentUser }: { currentUser: AppUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    listManagedUsers()
      .then((result) => active && setUsers(result))
      .catch((err) => active && setLoadError(userMessage(err, "Kullanıcılar yüklenemedi. Lütfen daha sonra tekrar deneyin.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function saved(result: UserSaved) {
    setDialog(null);
    if (result.kind === "created") {
      setUsers((prev) => [...prev, result.user]);
      setNotice(result.user.email_sent ? { tone: "ok", text: "Davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
    } else {
      setUsers((prev) => replaceUser(prev, result.user));
      setNotice({ tone: "ok", text: "Kullanıcı güncellendi." });
    }
  }

  function deactivated(result: DeactivateResult) {
    setDialog(null);
    setUsers((prev) => replaceUser(prev, result.user));
    setNotice({ tone: "ok", text: "Kullanıcı pasifleştirildi." });
  }

  async function runAction(user: ManagedUser, action: string) {
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    try {
      if (action === "invite") {
        const result = await resendUserInvite(user.id);
        setUsers((prev) => replaceUser(prev, result));
        setNotice(result.email_sent ? { tone: "ok", text: "Davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
      } else if (action === "reset") {
        const result = await sendUserPasswordReset(user.id);
        setNotice(
          result.email_sent
            ? { tone: "ok", text: "Sıfırlama bağlantısı gönderildi." }
            : { tone: "warn", text: "Sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin." },
        );
      } else if (action === "activate") {
        const result = await activateUser(user.id);
        setUsers((prev) => replaceUser(prev, result));
        setNotice({ tone: "ok", text: "Kullanıcı aktifleştirildi." });
      }
    } catch (err) {
      setNotice({ tone: "error", text: userMessage(err, "İşlem tamamlanamadı. Lütfen tekrar deneyin.") });
    } finally {
      busy.current = false;
    }
  }

  function pick(user: ManagedUser, action: string) {
    if (action === "edit") setDialog({ kind: "edit", user });
    else if (action === "deactivate") setDialog({ kind: "deactivate", user });
    else void runAction(user, action);
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  return (
    <section aria-labelledby="settings-users" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="settings-users" className="text-sm font-medium text-navy-700">
          Kullanıcılar
        </h2>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white"
        >
          Kullanıcı ekle
        </button>
      </div>

      {notice && (
        <p
          role={notice.tone === "ok" ? "status" : "alert"}
          className={`mb-3 text-sm ${notice.tone === "ok" ? "text-emerald-700" : notice.tone === "warn" ? "text-amber-700" : "text-red-700"}`}
        >
          {notice.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-xs text-navy-500">
              <th className="py-2 pr-3 font-medium">Ad</th>
              <th className="py-2 pr-3 font-medium">E-posta</th>
              <th className="py-2 pr-3 font-medium">Departman</th>
              <th className="py-2 pr-3 font-medium">Rol</th>
              <th className="py-2 pr-3 font-medium">Durum</th>
              <th className="py-2 font-medium">
                <span className="sr-only">İşlemler</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="py-2 pr-3 font-medium text-navy-800">{user.full_name}</td>
                <td className="py-2 pr-3 text-navy-600">{user.email}</td>
                <td className="py-2 pr-3 text-navy-600">{user.department ?? "—"}</td>
                <td className="py-2 pr-3 text-navy-600">{ROLE_LABELS[user.role]}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[user.status]}`}>{STATUS_LABELS[user.status]}</span>
                </td>
                <td className="py-2 text-right">
                  <RowMenu user={user} isSelf={user.id === currentUser.id} onPick={(action) => pick(user, action)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "create" && <UserFormModal onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "edit" && (
        <UserFormModal user={dialog.user} isSelf={dialog.user.id === currentUser.id} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "deactivate" && (
        <DeactivateUserModal user={dialog.user} candidates={users} onClose={() => setDialog(null)} onDone={deactivated} />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run:

```bash
cd frontend && npx vitest run src/components/__tests__/SettingsView.test.tsx src/components/__tests__/UsersPanel.test.tsx
```

Expected: PASS — Test Files 2 passed (2); Tests 18 passed (18).

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: PASS — no failing test and no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ModalFrame.tsx frontend/src/components/SettingsView.tsx frontend/src/components/__tests__/SettingsView.test.tsx frontend/src/components/__tests__/UsersPanel.test.tsx frontend/src/components/users/DeactivateUserModal.tsx frontend/src/components/users/UserFormModal.tsx frontend/src/components/users/UsersPanel.tsx
git commit -F - <<'EOF'
feat: Settings user management panel (invite, edit, deactivate with hand-over)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 12: End-to-end flow, `file` backend in Ayarlar, docs and full verification

The last task makes the whole feature checkable. Writing the E2E flow exposed a real bug first: `GET /notifications/status` and the test e-mail rejected `EMAIL_BACKEND=file` (Decision 17), so that fix goes in test-first before the E2E spec. Then the E2E helpers (Decision 19), the new spec, the docs, and a full verification of every suite.

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `PROGRESS.md`
- Modify: `README.md`
- Modify: `backend/app/schemas/notification.py`
- Modify: `frontend/src/components/SettingsView.tsx`
- Modify: `frontend/src/types/index.ts`
- Test (modify): `backend/tests/api/test_notifications.py`
- Test (modify): `frontend/src/components/__tests__/SettingsView.test.tsx`
- Test (modify): `tests/e2e/playwright.config.ts`
- Test (modify): `tests/e2e/specs/05-click-through.spec.ts`
- Test (create): `tests/e2e/specs/10-user-management.spec.ts`
- Test (modify): `tests/e2e/specs/helpers.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–11 (the file e-mail backend of Task 2 and the UI of Tasks 9–11 are what the spec drives).
- Produces: `NotificationStatusOut.email_backend` and `EmailTestOut.backend` accept `"file"`; `EmailBackend = "console" | "smtp" | "file"` and the Ayarlar label `Dosya (.eml, yalnızca geliştirme)` with the test-e-mail message `Test e-postası dosyaya yazıldı (dosya modu).`; E2E helpers `MAIL_DIR`, `BACKEND_URL`, `login(page, creds)` (accepts `/dashboard` or `/admin`), `newestPasswordLink(recipient): Promise<string>`; spec `10-user-management.spec.ts`.

- [ ] **Step 1: Write the failing tests** (the `file` backend in the status endpoint and in Ayarlar)

Modify `backend/tests/api/test_notifications.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/tests/api/test_notifications.py
+++ b/backend/tests/api/test_notifications.py
@@ -60,3 +60,12 @@ def test_test_email_failure_returns_502_with_turkish_message(client, two_firms_t
 
 def test_test_email_requires_login(client):
     assert client.post("/notifications/test-email").status_code == 401
+
+
+def test_status_and_test_email_report_the_file_backend(client, two_firms_two_users, monkeypatch):
+    monkeypatch.setattr(settings, "email_backend", "file")
+    monkeypatch.setattr("app.api.routes.notifications.send_email", lambda message: None)
+    headers = _auth_headers(client, two_firms_two_users)
+
+    assert client.get("/notifications/status", headers=headers).json()["email_backend"] == "file"
+    assert client.post("/notifications/test-email", headers=headers).json() == {"sent": True, "backend": "file"}
```

Modify `frontend/src/components/__tests__/SettingsView.test.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/__tests__/SettingsView.test.tsx
+++ b/frontend/src/components/__tests__/SettingsView.test.tsx
@@ -100,4 +100,17 @@ describe("SettingsView", () => {
     await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
     expect(await screen.findByRole("alert")).toHaveTextContent("E-posta gönderilemedi. SMTP ayarlarını kontrol edin.");
   });
+
+  it("explains file mode", async () => {
+    getMe.mockResolvedValue(lawyerUser);
+    getNotificationStatus.mockResolvedValue({ email_backend: "file", reminders_enabled: true, reminder_send_hour: 9, timezone: "Europe/Istanbul" });
+    sendTestEmail.mockResolvedValue({ sent: true, backend: "file" });
+
+    render(<SettingsView />);
+
+    const section = await screen.findByRole("region", { name: "Bildirimler" });
+    expect(section).toHaveTextContent("Dosya (.eml, yalnızca geliştirme)");
+    await userEvent.click(screen.getByRole("button", { name: "Test e-postası gönder" }));
+    expect(await screen.findByText("Test e-postası dosyaya yazıldı (dosya modu).")).toBeInTheDocument();
+  });
 });
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_notifications.py -q
cd frontend && npx vitest run src/components/__tests__/SettingsView.test.tsx
```

Expected: FAIL — the backend test fails with a response validation error (`email_backend` input `'file'` is not `'console'` or `'smtp'`), the frontend test cannot find `Dosya (.eml, yalnızca geliştirme)`.

- [ ] **Step 3: Implement**

Modify `backend/app/schemas/notification.py` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/backend/app/schemas/notification.py
+++ b/backend/app/schemas/notification.py
@@ -5,7 +5,7 @@ from pydantic import BaseModel
 
 
 class NotificationStatusOut(BaseModel):
-    email_backend: Literal["console", "smtp"]
+    email_backend: Literal["console", "smtp", "file"]
     reminders_enabled: bool
     reminder_send_hour: int
     timezone: str
@@ -13,4 +13,4 @@ class NotificationStatusOut(BaseModel):
 
 class EmailTestOut(BaseModel):
     sent: bool
-    backend: Literal["console", "smtp"]
+    backend: Literal["console", "smtp", "file"]
```

Modify `frontend/src/types/index.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/types/index.ts
+++ b/frontend/src/types/index.ts
@@ -213,7 +213,7 @@ export interface CalendarEventPayload {
   reminder_days: number[];
 }
 
-export type EmailBackend = "console" | "smtp";
+export type EmailBackend = "console" | "smtp" | "file";
 
 export interface NotificationStatus {
   email_backend: EmailBackend;
```

Modify `frontend/src/components/SettingsView.tsx` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/frontend/src/components/SettingsView.tsx
+++ b/frontend/src/components/SettingsView.tsx
@@ -11,6 +11,7 @@ import { UsersPanel } from "@/components/users/UsersPanel";
 const EMAIL_BACKEND_LABELS: Record<NotificationStatus["email_backend"], string> = {
   smtp: "SMTP",
   console: "Konsol (yalnızca sunucu logu)",
+  file: "Dosya (.eml, yalnızca geliştirme)",
 };
 
 type TestEmailState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };
@@ -45,7 +46,9 @@ export function SettingsView() {
         message:
           result.backend === "console"
             ? "Test e-postası sunucu loguna yazıldı (konsol modu)."
-            : `Test e-postası ${me?.email ?? "hesabınıza"} adresine gönderildi.`,
+            : result.backend === "file"
+              ? "Test e-postası dosyaya yazıldı (dosya modu)."
+              : `Test e-postası ${me?.email ?? "hesabınıza"} adresine gönderildi.`,
       });
     } catch (err) {
       setTestEmail({ kind: "error", message: err instanceof Error ? err.message : "E-posta gönderilemedi." });
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_notifications.py -q
cd frontend && npx vitest run src/components/__tests__/SettingsView.test.tsx
```

Expected: PASS — 6 passed; Test Files 1 passed (1); Tests 5 passed (5).

- [ ] **Step 5: E2E infrastructure and the new spec**

The E2E backend now writes e-mails to `tests/e2e/mail/` (removed on every start, like the database) and builds its links against the E2E frontend. `login()` accepts both landing pages. Spec 05 starts on the dashboard, which an administrator no longer reaches through `login()`.

The new spec signs the demo administrator in exactly once and reuses that token for its API set-up (the login limit is 5 attempts per user per minute, and specs 02–05 also sign the administrator in). It waits for the demo hint before typing on the login page because typing before hydration is wiped by it.

Modify `.gitignore` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -33,6 +33,7 @@ test-results/
 TEST_REPORT.md.bak
 tests/e2e/node_modules/
 tests/e2e/e2e.db
+tests/e2e/mail/
 backend/storage_e2e/
 
 # Local scratch / transfer artifacts
```

Modify `tests/e2e/playwright.config.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/tests/e2e/playwright.config.ts
+++ b/tests/e2e/playwright.config.ts
@@ -9,6 +9,7 @@ const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
 const backendDir = path.resolve(__dirname, "../../backend");
 const frontendDir = path.resolve(__dirname, "../../frontend");
 const e2eDbPath = path.resolve(__dirname, "e2e.db");
+const e2eMailDir = path.resolve(__dirname, "mail");
 
 export default defineConfig({
   testDir: "./specs",
@@ -42,7 +43,7 @@ export default defineConfig({
   ],
   webServer: [
     {
-      command: `sh -c "rm -f '${e2eDbPath}' && .venv/bin/python -m app.db.seed && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}"`,
+      command: `sh -c "rm -rf '${e2eDbPath}' '${e2eMailDir}' && .venv/bin/python -m app.db.seed && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}"`,
       cwd: backendDir,
       url: `${BACKEND_URL}/health`,
       timeout: 60_000,
@@ -52,6 +53,9 @@ export default defineConfig({
         JWT_SECRET: "e2e-test-secret",
         EXTRA_CORS_ORIGINS: FRONTEND_URL,
         CHAT_PROVIDER: "mock",
+        EMAIL_BACKEND: "file",
+        EMAIL_FILE_DIR: e2eMailDir,
+        FRONTEND_BASE_URL: FRONTEND_URL,
       },
     },
     {
```

Modify `tests/e2e/specs/helpers.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/tests/e2e/specs/helpers.ts
+++ b/tests/e2e/specs/helpers.ts
@@ -1,12 +1,42 @@
 import { Page, expect } from "@playwright/test";
+import fs from "fs";
+import path from "path";
 
 export const DEMO_ADMIN = { email: "admin@demo.casebridge.dev", password: "demo1234" };
 export const DEMO_LAWYER = { email: "avukat@demo.casebridge.dev", password: "demo1234" };
 
+// The backend webServer writes every outgoing e-mail here (EMAIL_BACKEND=file).
+export const MAIL_DIR = path.resolve(__dirname, "../mail");
+export const BACKEND_URL = "http://127.0.0.1:8010";
+
 export async function login(page: Page, creds: { email: string; password: string } = DEMO_ADMIN) {
   await page.goto("/login");
   await page.getByLabel(/e-posta/i).fill(creds.email);
   await page.getByLabel(/şifre/i).fill(creds.password);
   await page.getByRole("button", { name: /giriş/i }).click();
-  await expect(page).toHaveURL(/\/dashboard/);
+  // Admins land on /admin, lawyers on /dashboard.
+  await expect(page).toHaveURL(/\/(dashboard|admin)(\/|$|\?)/);
+}
+
+function decodeQuotedPrintable(text: string): string {
+  return text
+    .replace(/=\r?\n/g, "")
+    .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
+}
+
+/** The password link in the newest e-mail written for `recipient`. */
+export async function newestPasswordLink(recipient: string): Promise<string> {
+  const deadline = Date.now() + 10_000;
+  while (Date.now() < deadline) {
+    const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).filter((name) => name.endsWith(".eml")).sort() : [];
+    for (const name of files.reverse()) {
+      const raw = fs.readFileSync(path.join(MAIL_DIR, name), "utf8");
+      const to = /^To:\s*(.+)$/im.exec(raw)?.[1] ?? "";
+      if (!to.toLowerCase().includes(recipient.toLowerCase())) continue;
+      const match = /http:\/\/[^\s"<>]*\/sifre-belirle\?token=([A-Za-z0-9_-]+)/.exec(decodeQuotedPrintable(raw));
+      if (match) return match[0];
+    }
+    await new Promise((resolve) => setTimeout(resolve, 200));
+  }
+  throw new Error(`No password e-mail found for ${recipient}`);
 }
```

Modify `tests/e2e/specs/05-click-through.spec.ts` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/tests/e2e/specs/05-click-through.spec.ts
+++ b/tests/e2e/specs/05-click-through.spec.ts
@@ -6,6 +6,8 @@ import { login } from "./helpers";
 
 test("drill down from a dashboard category to a case's tasks tab", async ({ page }) => {
   await login(page);
+  // Admins land on /admin after login; this flow starts on the dashboard.
+  await page.goto("/dashboard");
 
   const legend = page.getByRole("list", { name: "Dava dağılımı kategorileri" });
   const firstCategory = legend.getByRole("link").first();
```

Create `tests/e2e/specs/10-user-management.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { BACKEND_URL, login, newestPasswordLink, DEMO_ADMIN } from "./helpers";

// Flow 10: the admin invites a lawyer, the lawyer sets a password from the
// e-mailed link, signs out and back in; later the admin hands the lawyer's
// work over and deactivates them, and they can no longer sign in.
//
// This spec signs the demo admin in exactly once (the login rate limit is 5
// attempts per user per minute) and reuses that token for API set-up.

const STAMP = Date.now();
const LAWYER_EMAIL = `yeni.avukat.${STAMP}@e2e.casebridge.dev`;
const LAWYER_NAME = `Yeni Avukat ${STAMP}`;
const NEW_PASSWORD = "Yeni-Sifre-2026";
const CASE_NAME = `Devir Davası ${STAMP}`;

test("invite, set password, sign in, then deactivate with hand-over", async ({ page, browser }) => {
  await login(page, DEMO_ADMIN);
  const adminToken = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  expect(adminToken).toBeTruthy();
  const auth = { Authorization: `Bearer ${adminToken}` };

  // 1. Invite from Ayarlar > Kullanıcılar.
  await page.goto("/ayarlar");
  await page.getByRole("button", { name: "Kullanıcı ekle" }).click();
  const form = page.getByRole("dialog", { name: "Kullanıcı ekle" });
  await form.getByLabel("Ad soyad *").fill(LAWYER_NAME);
  await form.getByLabel("E-posta *").fill(LAWYER_EMAIL);
  await form.getByLabel("Departman").fill("Ticaret");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Davet gönderildi." })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: LAWYER_EMAIL });
  await expect(row).toContainText("Davet bekliyor");

  // 2. The invited person sets a password from the e-mailed link.
  const invitee = await browser.newContext();
  const inviteePage = await invitee.newPage();
  const link = await newestPasswordLink(LAWYER_EMAIL);
  await inviteePage.goto(link);
  await expect(inviteePage.getByText(`Merhaba ${LAWYER_NAME}`)).toBeVisible();
  await inviteePage.getByLabel("Yeni şifre", { exact: true }).fill(NEW_PASSWORD);
  await inviteePage.getByLabel("Yeni şifre (tekrar)").fill(NEW_PASSWORD);
  await inviteePage.getByRole("button", { name: "Şifreyi belirle" }).click();
  await expect(inviteePage).toHaveURL(/\/dashboard/);

  // The link works once.
  await inviteePage.goto(link);
  await expect(inviteePage.getByText("Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.")).toBeVisible();

  // 3. Sign out from the user menu, sign in with the new password.
  await inviteePage.goto("/dashboard");
  await inviteePage.getByRole("button", { name: new RegExp(`Kullanıcı menüsü, ${LAWYER_NAME}`) }).click();
  await inviteePage.getByRole("menuitem", { name: "Çıkış yap" }).click();
  await expect(inviteePage).toHaveURL(/\/login/);
  await login(inviteePage, { email: LAWYER_EMAIL, password: NEW_PASSWORD });

  // 4. Give the lawyer a case through the API, then deactivate with a hand-over.
  await page.reload();
  const lawyers = await page.request.get(`${BACKEND_URL}/admin/lawyers`, { headers: auth });
  const lawyerId = (await lawyers.json()).find((item: { email: string }) => item.email === LAWYER_EMAIL)?.id;
  expect(lawyerId).toBeTruthy();
  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers: auth,
    data: { case_number: `E2E-${STAMP}`, case_name: CASE_NAME, client_name: "E2E Müvekkil", case_type: "diger", assigned_lawyer_id: lawyerId },
  });
  expect(created.ok()).toBeTruthy();

  await page.getByRole("row").filter({ hasText: LAWYER_EMAIL }).getByRole("button", { name: /^İşlemler/ }).click();
  await page.getByRole("menuitem", { name: "Pasifleştir" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(CASE_NAME)).toBeVisible();
  await dialog.getByRole("button", { name: "Devret ve pasifleştir" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Devredilecek avukatı seçin.");
  await dialog.getByLabel("Devredilecek avukat").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Devret ve pasifleştir" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kullanıcı pasifleştirildi." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: LAWYER_EMAIL })).toContainText("Pasif");

  // 5. The old session is closed and the deactivated lawyer cannot sign in.
  await inviteePage.reload();
  await expect(inviteePage).toHaveURL(/\/login/);
  // The demo hint appears once the page has hydrated and loaded /auth/config;
  // typing earlier would be wiped by hydration.
  await expect(inviteePage.getByText("Demo hesapları")).toBeVisible();
  await inviteePage.getByLabel(/e-posta/i).fill(LAWYER_EMAIL);
  await inviteePage.getByLabel(/şifre/i).fill(NEW_PASSWORD);
  await inviteePage.getByRole("button", { name: /giriş/i }).click();
  await expect(inviteePage.locator("p[role=alert]")).toHaveText("E-posta veya şifre hatalı.");
  await invitee.close();
});
```

Run the new spec on its own (Playwright starts both servers itself; no server may already be listening on ports 8010 and 3010):

```bash
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test specs/10-user-management.spec.ts
```

Expected: PASS — `1 passed`. (If the checkout is a git worktree whose `backend/.venv` is a symlink to another checkout's virtualenv, `uvicorn` may import the other checkout's `app` package; prefix the command with `PYTHONPATH=<this checkout>/backend`. In an ordinary checkout nothing is needed.)

- [ ] **Step 6: Documentation**

README, `.env.example` and `PROGRESS.md` describe the feature, the new settings, the first-administrator command and the session behaviour (including that every session ends once after the deploy).

Modify `.env.example` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/.env.example
+++ b/.env.example
@@ -68,7 +68,10 @@ CHAT_AUTO_LEVEL=true
 CHAT_CLASSIFIER_TIMEOUT_SECONDS=8
 
 # E-mail (calendar reminders and the test e-mail in Ayarlar).
-# EMAIL_BACKEND: console (default; only logs recipient + subject) | smtp.
+# EMAIL_BACKEND: console (default; logs recipient + subject, and the link of
+# invite / password-reset e-mails so a developer can follow it) | smtp |
+# file (writes each e-mail as an .eml file into EMAIL_FILE_DIR; used by the
+# E2E tests). Only console mode ever logs an e-mail link.
 # Docker Compose already sends to the bundled Mailpit
 # (http://localhost:8025). Uncomment and fill these only for a real
 # SMTP server; empty/commented values keep the defaults.
@@ -80,6 +83,13 @@ CHAT_CLASSIFIER_TIMEOUT_SECONDS=8
 # SMTP_USE_TLS=true
 # SMTP_FROM=CaseBridge <no-reply@casebridge.local>
 # SMTP_TIMEOUT_SECONDS=10
+# EMAIL_FILE_DIR=./var/mail
+
+# User invitations and password reset. FRONTEND_BASE_URL is the address the
+# links in these e-mails point to (/sifre-belirle?token=...).
+FRONTEND_BASE_URL=http://localhost:3000
+INVITE_TOKEN_HOURS=72
+RESET_TOKEN_MINUTES=60
 
 # Calendar reminders. Event times are local times in APP_TIMEZONE.
 # Reminders go out from REMINDER_SEND_HOUR (0-23) on; the worker checks
@@ -96,7 +106,9 @@ REMINDER_MAX_ATTEMPTS=3
 AI_MONTHLY_TOKEN_BUDGET=0
 
 # true = demo cases/tasks/documents. false = real data mode: only login users
-# are seeded and previously seeded demo cases are removed on startup.
+# are seeded and previously seeded demo cases are removed on startup. Create the
+# first administrator with:
+#   python -m app.db.create_admin --firm "Büro Adı" --email admin@buro.com --name "Ad Soyad"
 # Import real data: docker compose exec backend python -m app.db.import_cases
 SEED_DEMO_DATA=true
```

Modify `README.md` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/README.md
+++ b/README.md
@@ -94,6 +94,9 @@ SQLite file created automatically on backend startup at `backend/casebridge.db`
 python -m app.db.seed
 ```
 
+### User management
+Administrators manage the firm's users in **Ayarlar > Kullanıcılar**: invite (the new user gets an e-mail with a link to set a password, valid `INVITE_TOKEN_HOURS`), edit, resend an invite, send a password-reset link, and deactivate with a hand-over of open cases, pending tasks and reviewed precedents to another active lawyer. Everyone can use **Şifremi unuttum** on the login page and change their name or password under **Hesabım** (user menu, top right). In development the console e-mail backend prints the link in the backend log; set `EMAIL_BACKEND=file` to get `.eml` files instead.
+
 ### Demo credentials
 Created by `python -m app.db.seed` (idempotent - safe to re-run):
 - `admin@demo.casebridge.dev` / `demo1234` (Admin, Demo Hukuk Bürosu)
@@ -131,11 +134,12 @@ In a courtroom session, a user may dictate a move and play AI turns aloud. These
 - Courtroom results are fictional training feedback, not legal advice or a prediction of a real case. Local models may still misstate facts; the prompts constrain fabrication and every final result remains marked for verification.
 - Both in-process AI workers are single-instance MVP queues. Do not horizontally scale the backend without moving them to a durable queue/row-locking design.
 - Task assignment (`assigned_to`) is accepted by the API but not yet surfaced in either Görevler UI (case-level or firm-wide) — assignment by lawyer, and per-lawyer task filtering, are not built yet.
-- `/system/ai-status` and the Ayarlar user list are firm-scoped but not role-gated server-side; only the frontend hides the user list from non-admins.
+- `/system/ai-status` is firm-scoped but not role-gated server-side. User management (`/admin/users`) is admin-only and firm-scoped on the server.
 - Reports CSV export has no pagination/streaming; fine at MVP scale.
 - CORS allow-list defaults to `localhost:3000`/`127.0.0.1:3000`; extra origins (e.g. for E2E) are added via the `EXTRA_CORS_ORIGINS` env var, not hardcoded.
-- No user-registration endpoint yet — accounts are created via the seed script (`python -m app.db.seed`) only.
-- `logout` does not revoke the JWT (stateless, short-lived tokens) — acceptable for MVP, no server-side session store.
+- There is no self-registration. In real-data mode (`SEED_DEMO_DATA=false`) the first administrator is created with `python -m app.db.create_admin`; after that, administrators add users in **Ayarlar > Kullanıcılar** and each person sets their own password from an e-mailed link.
+- Passwords bind sessions: changing or resetting a password signs out every older session (JWT `pwd` claim). Existing tokens without it are rejected once, so everyone signs in again after this update.
+- `logout` only clears the token in the browser; the JWT itself stays valid until it expires or the user's password changes (no server-side session store).
 - Existing unassigned cases remain visible to admins for manual assignment; new cases require an active lawyer in the same firm.
 - The admin's client overview groups case records by client name. It is not yet a canonical client registry, so people with identical names are not distinguishable there.
 - The local `data/import` sample contains anonymized court-decision summaries; these must not be treated as the firm's own client outcomes without provenance and an explicit import decision.
```

Modify `PROGRESS.md` (unified diff against the file as it stands after the previous tasks; apply every hunk):

```diff
--- a/PROGRESS.md
+++ b/PROGRESS.md
@@ -215,3 +215,11 @@ Implemented:
 - `TEST_REPORT.md` — final deliverable per spec: suite-by-suite pass/fail/skip counts, what each suite covers, and an explicit statement that the real-OpenAI test was not executed (rather than silently omitting it or claiming a pass).
 
 This is the last milestone in the build plan. CaseBridge MVP is feature-complete per the original spec's Definition of Done: a user can log in, create a case, upload a document, run a 4-perspective AI simulation and get a labeled-as-estimate structured result, add a development, generate a handover report, and view firm-wide analytics including drill-down into lost cases — all exercised by a real, passing E2E run, not just unit-level mocks.
+
+## User management (invites, password reset, deactivation)
+Status: COMPLETE
+
+- Admins invite, edit, deactivate (with hand-over) and re-activate users from Ayarlar > Kullanıcılar; users set their own password from an e-mailed one-time link, can reset it from the login page, and change it under Hesabım. Sessions are bound to the password (JWT `pwd` claim).
+- The login form is empty; the demo accounts hint shows only in demo mode (`GET /auth/config`).
+- Real-data mode no longer creates a demo firm or users; `python -m app.db.create_admin` creates the first administrator and `import_cases` takes `--firm` and `--lawyer`.
+- New E2E spec `10-user-management.spec.ts` (EMAIL_BACKEND=file, reads the invite link from the newest `.eml`).
```

- [ ] **Step 7: Verify everything**

Run each suite from a clean state (stop anything listening on ports 8010 and 3010 first). `npm run build` uses the same `.next` directory as the Playwright dev server, so run it before Playwright, not at the same time.

```bash
cd backend && .venv/bin/python -m pytest -q
cd ../frontend && npx vitest run && npx tsc --noEmit && npm run build
cd ../tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test
```

Expected:

- backend: `721 passed` (607 before this feature, 114 new).
- frontend: `Test Files  51 passed (51)`, `Tests  465 passed (465)`; `tsc` prints nothing; the build finishes with the route table.
- Playwright: specs 01–06 and 08–10 pass. Exactly one test fails, `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply` (`expect(getByText('Standart · mock')).toBeVisible()` times out). That failure is **pre-existing**: it fails identically on the base commit `6a26bcf`, before any of this work, and is unrelated to user management. Do not try to fix it here and do not report it as a regression; any other failure is a regression.


- [ ] **Step 8: Commit**

```bash
git add .env.example .gitignore PROGRESS.md README.md backend/app/schemas/notification.py backend/tests/api/test_notifications.py frontend/src/components/SettingsView.tsx frontend/src/components/__tests__/SettingsView.test.tsx frontend/src/types/index.ts tests/e2e/playwright.config.ts tests/e2e/specs/05-click-through.spec.ts tests/e2e/specs/10-user-management.spec.ts tests/e2e/specs/helpers.ts
git commit -F - <<'EOF'
test: user management E2E, file mail backend in status, docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


## Self-Review

**1. Spec coverage** (each spec section → the task that implements it)

- §3.1 `users` columns, derived status, unusable hash for pending users → Task 1 (model, migration) and Task 5 (`create_pending_user`).
- §3.2 `user_tokens`, token generation, only the digest stored, new token invalidates old, lifetimes and settings → Task 1 (table), Task 2 (`user_token_service`, `invite_token_hours`, `reset_token_minutes`).
- §3.3 `pwd` claim, 401 on mismatch → Task 3 (`password_epoch`, `get_current_user`); behaviour of old tokens → Decisions 1–2 and the tests in `test_auth_sessions.py`.
- §3.4 password rule and messages → Task 2 (`password_policy`), enforced by `set-password` and `change-password` in Task 4 and mirrored in Task 8 (`passwordRules`).
- §4 `create_admin`, `SEED_DEMO_DATA=false` without demo users, empty login form + `GET /auth/config` + demo hint → Task 7 (command, seed, cleanup), Task 3 (`/auth/config`), Task 9 (login form and hint).
- §5.1 every `/admin/users` route and error message → Task 5 (list, create, edit, invite, password-reset), Task 6 (workload, deactivate, activate).
- §5.2 `forgot-password` (always 202, same message, rate limit 3/min/e-mail+IP), `token-info`, `set-password`, `change-password`, login messages, logout unchanged → Tasks 3 and 4.
- §5.3 `PATCH /users/me` → Task 7.
- §6 e-mails (subjects, bodies, link, `email_sent: false`, nothing sensitive logged) → Task 2 (builders, `file` backend, console flag), Task 4 (`deliver`, background send), Task 5 (`email_sent`).
- §7.1 Ayarlar > Kullanıcılar (table, modal, row actions, deactivate modal, own-row rules, error messages) → Task 11.
- §7.2 identity pages → Task 9. §7.3 user menu, logout, `/hesabim` → Task 10.
- §8 E2E (`login()` fix, `file` backend, new scenario, rate-limit awareness) → Task 12 (the `file` backend itself is Task 2).
- §9 test list → every bullet has tests in the task that implements it (token tests Task 2; flows Tasks 4–5; sessions Task 3; admin guards/isolation/403 Task 5–6; deactivation Task 6; `create_admin` and seed Task 7; frontend pages Tasks 9–11).
- Gaps: none. The spec calls the user list a "tab"; Decision 11 records that it is a section.

**2. Placeholder scan.** The plan contains no "TBD", "TODO", "implement later", "add appropriate error handling" or "similar to Task N"; every code step is a complete file or a complete diff copied from the verified implementation, and every command has an expected result.

**3. Type consistency.** Names are used identically across tasks: backend `UserStatus`/`TokenPurpose`/`UserToken` (Task 1) → `issue_token`/`find_usable_token`/`consume_token` (Task 2) → `apply_new_password`/`deliver`/`prepare_reset_email` (Task 4) → `prepare_invite_email`, `create_pending_user`, `update_user`, `ensure_not_last_admin` (Task 5) → `get_workload`/`deactivate_user`/`activate_user` (Task 6) → `create_admin`, `remove_demo_data` (Task 7); the API shapes (`ManagedUser`, `ManagedUserInvite.email_sent`, `UserWorkload`, `DeactivateResult.transferred`) in Task 8 match `AdminUserOut`, `AdminUserWithEmailOut`, `WorkloadOut`, `DeactivateOut` of Tasks 5–6; frontend helpers (`userMessage`, `validateNewPassword`, `announceUserUpdated`) are defined before the tasks that import them.

**Verification recorded while writing the plan** (scratch worktree built task by task; every task's tests were first run against the previous commit to see them fail, then against the task's commit): backend full suite 721 passed; frontend `npx vitest run` 465 passed (51 files); `npx tsc --noEmit` clean; `npm run build` succeeds; Playwright 10 passed and 1 failed — the failure is `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply`, which fails identically on the base commit (`6a26bcf`, before any of this work): it waits for the text `Standart · mock` and never finds it. Specs 02–05 fail on the base commit at `login()` (an administrator lands on `/admin`, the helper expected `/dashboard`) and pass after Task 12.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-11-user-management.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in one session using superpowers:executing-plans, with checkpoints for review.

Which approach?
