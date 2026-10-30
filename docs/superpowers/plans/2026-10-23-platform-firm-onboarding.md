# Platform Firm Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `python -m app.db.create_admin` command with a platform panel. From this panel the CaseBridge team creates customer firms and their first administrators, re-sends invites, adds administrators, and suspends or re-activates firms. The first platform administrators come from the `PLATFORM_ADMIN_EMAILS` setting.

**Architecture:**
- **Data model.** `law_firms` gains `is_active`, `suspended_at` and `is_platform`; `users` gains `is_platform_admin`. Platform administrators are ordinary users of an internal "CaseBridge Platform" firm (`is_platform=true`), so tenant scoping already keeps customer data away from them.
- **Bootstrap.** A startup hook (`platform_bootstrap.py`) creates the listed platform administrators and invites them. It is idempotent and never crashes startup.
- **Platform API.** A new `/platform` router, guarded by `get_current_platform_admin`, is served by `platform_service.py`. It reuses `create_pending_user`, `prepare_invite_email` and `deliver`.
- **Suspension.** Enforced centrally in five places: `get_current_user`, the login route, `find_usable_token`, forgot-password and the reminder recipient filter. The message is `FIRM_SUSPENDED`.
- **Frontend.** Adds:
  - a `/platform` page (`PlatformView`, `FirmFormModal`, `FirmDetailModal`);
  - a platform-only sidebar;
  - `AppShell` routing guards;
  - a shared `homePath(user)`;
  - a global 403-suspended handler that sends the browser to `/login?askida=1`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (`batch_alter_table`), pydantic v2, pytest; Next.js 14 app router, React 18, Tailwind, Vitest + Testing Library + user-event; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-platform-firm-onboarding-design.md`

## Global Constraints

Every task's requirements include this section.

**Process**

- **Branch.** Work on branch `feature/platform-firm-onboarding`. It is already checked out and contains the spec commit. Do not switch branches, do not push and never use `git stash`.
- **Commits.** One commit per task. Every commit message ends with a blank line and then exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_015aCfnVWUSNe1YZdUEZeXCK`
- **Staging.** Always `git add` explicit paths, never `git add .`. `backend/.venv`, `frontend/node_modules` and `tests/e2e/node_modules` must never be committed, nor must the untracked `*.bundle` files and `.idea/` in the repository root.
- **Dependencies.** No new Python packages and no new npm packages.
- **Where commands run:**
  - Backend commands run from `backend/` with the project virtualenv (`.venv/bin/python -m pytest ...`, or `python -m pytest ...` inside an activated venv).
  - Frontend commands run from `frontend/` (`npx vitest run ...`, `npx tsc --noEmit`, `npm run build`).
  - E2E runs from `tests/e2e/` (`npx playwright test specs/14-platform-firms.spec.ts`).
- **Slow suites.** The full backend suite takes about ten minutes because logins are bcrypt-slow, and `npx vitest run` takes about two. Run them with a generous timeout.

**Project rules (code review checks every one)**

- **Messages users see.**
  - Only `ApiError` messages are shown to users. Anything else gets a Turkish fallback via `userMessage(error, fallback)` from `frontend/src/lib/userMessages.ts`.
  - All user-facing text is Turkish. Code comments are English.
- **Buttons.** A button the user just clicked uses `aria-disabled` plus an in-flight ref guard, never `disabled`.
- **Tenant scoping.** Never accept `law_firm_id` from the client. Platform routes take a `firm_id` path parameter, but only platform administrators can call them, and the platform firm itself is always answered with 404.
- **Never log** e-mail addresses, tokens or links. Log the error type or a fixed Turkish sentence instead.
- **Fixed strings.** Exact messages, which tests compare verbatim:
  - `FIRM_SUSPENDED = "Büronuzun erişimi askıya alındı."`
  - `FIRM_NAME_TAKEN = "Bu adla bir büro zaten var."`
  - `FIRM_NOT_FOUND = "Büro bulunamadı."`
  - `ADMIN_NOT_FOUND = "Yönetici bulunamadı."`
  - `SUSPENDED_INVITE = "Askıdaki büroya davet gönderilemez."`
  - `PLATFORM_REQUIRED = "Platform yetkisi gerekli."`
  - `PLATFORM_FIRM_NAME = "CaseBridge Platform"`
  - `PLATFORM_ADMIN_NAME = "Platform Yöneticisi"`
  - demo platform account `platform@demo.casebridge.dev` / `demo1234`
- **Settings.** The setting is `PLATFORM_ADMIN_EMAILS`: comma-separated, default empty.

---

## File Structure

**Backend — create**
- `backend/alembic/versions/c4e6a8b0d2f3_platform_firms.py` — the four new columns.
- `backend/app/services/firm_access.py` — `FIRM_SUSPENDED`, `firm_is_open(user)`.
- `backend/app/services/platform_service.py` — platform firm helper, firm/admin operations.
- `backend/app/services/platform_bootstrap.py` — `parse_platform_admin_emails`, `ensure_platform_admins`, `run_platform_bootstrap`.
- `backend/app/schemas/platform.py` — request/response models.
- `backend/app/api/routes/platform.py` — `/platform` router.
- Tests:
  - `backend/tests/integration/test_platform_firms_migration.py`
  - `backend/tests/api/test_firm_suspension.py`
  - `backend/tests/api/test_platform_firms.py`
  - `backend/tests/unit/test_platform_bootstrap.py`

**Backend — modify**
- Models: `backend/app/models/law_firm.py`, `backend/app/models/user.py`.
- Schemas: `backend/app/schemas/user.py` (`UserOut.is_platform_admin`).
- `backend/app/api/deps.py` — suspension check, `get_current_platform_admin`.
- `backend/app/api/routes/auth.py` — login 403, forgot-password.
- `backend/app/services/user_token_service.py` — `find_usable_token`.
- `backend/app/services/reminder_service.py` — recipient filter.
- `backend/app/core/config.py` — `platform_admin_emails`.
- `backend/app/main.py` — router and startup hook.
- `backend/app/db/seed.py` — demo platform account; real-mode cleanup; message.
- Tests: `backend/tests/integration/test_seed.py`, `backend/tests/integration/test_seed_real_data_mode.py`, `backend/tests/unit/test_reminder_service.py`.
- Docs and config: `README.md`, `.env.example`, `PROGRESS.md`.

**Backend — delete**
- `backend/app/db/create_admin.py`, `backend/tests/integration/test_create_admin.py`.

**Frontend — create**
- `frontend/src/lib/home.ts` — `homePath(user)`.
- `frontend/src/lib/firmStatus.ts` — `FIRM_SUSPENDED` (its own module so component tests that mock `@/lib/api` still get the real string).
- `frontend/src/components/platform/NoticeLine.tsx` — `Notice` type and line.
- `frontend/src/components/platform/FirmFormModal.tsx` — new firm / add admin form.
- `frontend/src/components/platform/FirmDetailModal.tsx` — firm panel.
- `frontend/src/components/platform/PlatformView.tsx` — page body.
- `frontend/src/app/platform/page.tsx`.
- Tests:
  - `frontend/src/lib/__tests__/home.test.ts`
  - `frontend/src/components/__tests__/AppShell.test.tsx`
  - `frontend/src/components/__tests__/PlatformView.test.tsx`

**Frontend — modify**
- `frontend/src/types/index.ts`.
- `frontend/src/lib/api.ts`.
- Components: `frontend/src/components/AppShell.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/WorkspaceHeader.tsx`, `frontend/src/components/auth/LoginView.tsx`, `frontend/src/components/auth/SetPasswordView.tsx`.
- `frontend/src/app/page.tsx`.
- Tests: `frontend/src/lib/__tests__/api.test.ts`, `frontend/src/components/__tests__/Sidebar.test.tsx`, `frontend/src/components/__tests__/AuthPages.test.tsx`.

**E2E**
- Create `tests/e2e/specs/14-platform-firms.spec.ts`.
- Modify `tests/e2e/specs/helpers.ts`.

---

### Task 1: Data model — firm status, platform firm, platform admin flag

**Files:**
- Create: `backend/alembic/versions/c4e6a8b0d2f3_platform_firms.py`
- Modify: `backend/app/models/law_firm.py`, `backend/app/models/user.py`, `backend/app/schemas/user.py`
- Test: `backend/tests/integration/test_platform_firms_migration.py`

**Interfaces:**
- Produces:
  - `LawFirm.is_active: bool` (default True)
  - `LawFirm.suspended_at: datetime | None`
  - `LawFirm.is_platform: bool` (default False)
  - `User.is_platform_admin: bool` (default False)
  - `UserOut.is_platform_admin: bool`, so `/users/me` returns it

- [ ] **Step 1: Write the failing tests**

`backend/tests/integration/test_platform_firms_migration.py`:

```python
"""The platform-firms revision adds the firm status, platform firm marker and
platform admin flag with defaults that keep every existing firm and user as
they were."""
from sqlalchemy import create_engine, inspect, text

from app.db.migrate import upgrade_to_head


def test_migration_adds_the_columns_with_safe_defaults(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'migrate.db'}")
    upgrade_to_head(engine)

    firm_columns = {column["name"] for column in inspect(engine).get_columns("law_firms")}
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    assert {"is_active", "suspended_at", "is_platform"} <= firm_columns
    assert "is_platform_admin" in user_columns

    with engine.begin() as connection:
        connection.execute(text("INSERT INTO law_firms (id, name) VALUES ('f1', 'Eski Büro')"))
        connection.execute(text(
            "INSERT INTO users (id, law_firm_id, email, hashed_password, full_name, role, is_active) "
            "VALUES ('u1', 'f1', 'eski@example.com', 'x', 'Eski Kullanıcı', 'lawyer', 1)"
        ))
        firm = connection.execute(text("SELECT is_active, is_platform, suspended_at FROM law_firms")).one()
        user = connection.execute(text("SELECT is_platform_admin FROM users")).one()
    assert tuple(firm) == (1, 0, None)
    assert tuple(user) == (0,)


def test_new_firms_and_users_get_the_defaults(db_session):
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="Yeni Büro")
    db_session.add(firm)
    db_session.flush()
    user = User(law_firm_id=firm.id, email="yeni@example.com", hashed_password="x", full_name="Yeni", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.commit()

    assert (firm.is_active, firm.suspended_at, firm.is_platform) == (True, None, False)
    assert user.is_platform_admin is False


def test_me_reports_the_platform_admin_flag(client, office, auth_headers):
    body = client.get("/users/me", headers=auth_headers(office.admin_a)).json()
    assert body["is_platform_admin"] is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/integration/test_platform_firms_migration.py -v`
Expected: FAIL. The columns are missing, and `is_platform_admin` is absent from `/users/me` (KeyError).

- [ ] **Step 3: Write the migration**

`backend/alembic/versions/c4e6a8b0d2f3_platform_firms.py`:

```python
"""Platform firms: firm status (suspension), the internal platform firm and the
platform admin flag.

Revision ID: c4e6a8b0d2f3
Revises: a7d2e4f6b8c1
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e6a8b0d2f3"
down_revision: Union[str, Sequence[str], None] = "a7d2e4f6b8c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("law_firms") as batch:
        batch.add_column(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("suspended_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("is_platform", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_platform_admin")
    with op.batch_alter_table("law_firms") as batch:
        batch.drop_column("is_platform")
        batch.drop_column("suspended_at")
        batch.drop_column("is_active")
```

- [ ] **Step 4: Update the models and `UserOut`**

`backend/app/models/law_firm.py`. Replace the whole file:

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LawFirm(Base):
    __tablename__ = "law_firms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    # False = suspended by the CaseBridge team: none of the firm's users can
    # sign in or use a session or link; the data stays.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # The internal firm of the CaseBridge team's platform administrators. Never
    # listed in the platform panel and never suspended.
    is_platform: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="law_firm")
```

`backend/app/models/user.py`. After the `is_active` column line, add:

```python
    # A member of the CaseBridge team (internal platform firm) who manages
    # customer firms in the platform panel.
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
```

`backend/app/schemas/user.py`. In `UserOut`, after `is_active: bool`, add:

```python
    is_platform_admin: bool = False
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/integration/test_platform_firms_migration.py tests/unit/test_user_model.py tests/api/test_profile.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/c4e6a8b0d2f3_platform_firms.py backend/app/models/law_firm.py backend/app/models/user.py backend/app/schemas/user.py backend/tests/integration/test_platform_firms_migration.py
git commit -m "feat: firm status, platform firm and platform admin columns"
```

---

### Task 2: Suspended firms are locked out

**Files:**
- Create: `backend/app/services/firm_access.py`
- Modify:
  - `backend/app/api/deps.py` (`get_current_user`)
  - `backend/app/api/routes/auth.py` (`login`, `forgot_password`)
  - `backend/app/services/user_token_service.py` (`find_usable_token`)
  - `backend/app/services/reminder_service.py` (`collect_due`)
- Test: `backend/tests/api/test_firm_suspension.py`, `backend/tests/unit/test_reminder_service.py`

**Interfaces:**
- Consumes: `LawFirm.is_active` (Task 1).
- Produces:
  - `app.services.firm_access.FIRM_SUSPENDED: str`
  - `firm_is_open(user: User) -> bool`
  - Every authenticated request of a suspended firm's user answers 403 with `FIRM_SUSPENDED`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/api/test_firm_suspension.py`:

```python
"""A suspended firm's users cannot sign in, keep a session, use a link or get
a reset e-mail; other firms are not affected."""
from app.core.timeutil import utc_now
from app.models.user_token import TokenPurpose
from app.services.firm_access import FIRM_SUSPENDED
from app.services.user_token_service import issue_token


def _suspend(db_session, firm):
    firm.is_active = False
    firm.suspended_at = utc_now()
    db_session.commit()


def test_the_right_password_gets_the_suspension_message(client, db_session, office):
    _suspend(db_session, office.firm_a)

    response = client.post("/auth/login", json={"email": office.lawyer_a1.email, "password": office.password})

    assert response.status_code == 403
    assert response.json()["detail"] == FIRM_SUSPENDED


def test_a_wrong_password_still_gets_the_plain_401(client, db_session, office):
    _suspend(db_session, office.firm_a)

    response = client.post("/auth/login", json={"email": office.lawyer_a1.email, "password": "yanlis-sifre-1"})

    assert response.status_code == 401
    assert response.json()["detail"] == "E-posta veya şifre hatalı."


def test_open_sessions_end_when_the_firm_is_suspended(client, db_session, office, auth_headers):
    headers = auth_headers(office.lawyer_a1)
    assert client.get("/users/me", headers=headers).status_code == 200

    _suspend(db_session, office.firm_a)

    response = client.get("/users/me", headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"] == FIRM_SUSPENDED


def test_other_firms_keep_working(client, db_session, office, auth_headers):
    _suspend(db_session, office.firm_a)

    assert client.get("/users/me", headers=auth_headers(office.lawyer_b)).status_code == 200


def test_links_stop_working(client, db_session, office):
    token = issue_token(db_session, office.lawyer_a1, TokenPurpose.RESET)
    db_session.commit()
    _suspend(db_session, office.firm_a)

    assert client.get("/auth/token-info", params={"token": token}).status_code == 410
    response = client.post("/auth/set-password", json={"token": token, "password": "Yeni-Sifre-2026"})
    assert response.status_code == 410


def test_forgot_password_answers_the_same_but_sends_nothing(client, db_session, office, mail_outbox):
    _suspend(db_session, office.firm_a)

    response = client.post("/auth/forgot-password", json={"email": office.lawyer_a1.email})

    assert response.status_code == 202
    assert mail_outbox.messages(to=office.lawyer_a1.email) == []


def test_activating_again_restores_access(client, db_session, office):
    _suspend(db_session, office.firm_a)
    office.firm_a.is_active = True
    office.firm_a.suspended_at = None
    db_session.commit()

    response = client.post("/auth/login", json={"email": office.lawyer_a1.email, "password": office.password})
    assert response.status_code == 200
```

In `backend/tests/unit/test_reminder_service.py`, add after `test_inactive_recipient_is_skipped`:

```python
def test_recipients_of_a_suspended_firm_are_skipped(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    world["firm"].is_active = False
    world["db"].commit()

    assert ReminderService(world["db"]).collect_due(NOW) == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_firm_suspension.py tests/unit/test_reminder_service.py -v`
Expected: FAIL. You should see `ModuleNotFoundError: app.services.firm_access`, and the reminder test should still produce a reminder.

- [ ] **Step 3: Implement**

`backend/app/services/firm_access.py`:

```python
"""Whether a firm's users may use CaseBridge: a firm suspended by the
CaseBridge team locks every one of its users out (the data stays)."""
from app.models.user import User

FIRM_SUSPENDED = "Büronuzun erişimi askıya alındı."


def firm_is_open(user: User) -> bool:
    return bool(user.law_firm.is_active)
```

`backend/app/api/deps.py`:
- Add the import `from app.services.firm_access import FIRM_SUSPENDED, firm_is_open`.
- In `get_current_user`, replace the final `return user` with:

```python
    if not firm_is_open(user):
        # 403, not 401: the session is valid, the firm is suspended. The
        # frontend shows the message on the login page.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FIRM_SUSPENDED)
    return user
```

`backend/app/api/routes/auth.py`:
- Add the import `from app.services.firm_access import FIRM_SUSPENDED, firm_is_open`.
- In `login`, after the `if user is None: raise HTTPException(...401...)` block and before `token = service.issue_token_for(user)`, add:

```python
    # Only someone who knows the password learns that the firm is suspended.
    if not firm_is_open(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FIRM_SUSPENDED)
```

- In `forgot_password`, replace the condition line with:

```python
    if user is not None and user.is_active and user.password_set_at is not None and firm_is_open(user):
```

`backend/app/services/user_token_service.py`. In `find_usable_token`, replace

```python
    if user is None or not user.is_active:
        return None
```

with

```python
    if user is None or not user.is_active or not user.law_firm.is_active:
        return None
```

Also update its docstring's last sentence to "...and its user is active in a firm that is not suspended; otherwise None (callers answer 410)."

`backend/app/services/reminder_service.py`. In `collect_due`, replace the recipient check line with:

```python
            if (
                user is None or not user.is_active or not user.email
                or user.law_firm_id != candidate.law_firm_id or not user.law_firm.is_active
            ):
                continue
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/test_firm_suspension.py tests/unit/test_reminder_service.py tests/api/test_auth.py tests/api/test_auth_sessions.py tests/api/test_password_flows.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/firm_access.py backend/app/api/deps.py backend/app/api/routes/auth.py backend/app/services/user_token_service.py backend/app/services/reminder_service.py backend/tests/api/test_firm_suspension.py backend/tests/unit/test_reminder_service.py
git commit -m "feat: a suspended firm's users are locked out"
```

---

### Task 3: Platform API — firms, administrators, suspension

**Files:**
- Create: `backend/app/services/platform_service.py`, `backend/app/schemas/platform.py`, `backend/app/api/routes/platform.py`
- Modify: `backend/app/api/deps.py` (add `get_current_platform_admin`), `backend/app/main.py` (include router)
- Test: `backend/tests/api/test_platform_firms.py`

**Interfaces:**
- Consumes:
  - `create_pending_user(db, law_firm_id, AdminUserCreate) -> User` (raises `UserAdminError(409, EMAIL_TAKEN)`)
  - `prepare_invite_email(db, user, inviter) -> EmailMessage` (commits)
  - `deliver(message) -> bool`
  - `FIRM_SUSPENDED` from Task 2
- Produces:
  - `platform_service.PLATFORM_FIRM_NAME`
  - `get_or_create_platform_firm(db) -> LawFirm` (flushes)
  - `list_customer_firms(db) -> list[LawFirm]`
  - `get_customer_firm(db, firm_id) -> LawFirm`
  - `firm_admins(firm) -> list[User]`
  - `create_firm(db, name, admin_full_name, admin_email) -> tuple[LawFirm, User]`
  - `add_firm_admin(db, firm, full_name, email) -> User`
  - `get_firm_admin(db, firm, user_id) -> User`
  - `check_can_invite(firm, user) -> None`
  - `send_invite(db, user) -> bool`
  - `set_firm_active(firm, active: bool) -> None`
  - `deps.get_current_platform_admin`
  - JSON shapes:
    - `PlatformFirmOut {id, name, created_at, is_active, suspended_at, active_user_count, admins: [PlatformAdminOut]}`
    - `PlatformAdminOut {id, full_name, email, status, invited_at}`
    - `PlatformFirmCreatedOut {firm, admin, email_sent}`
    - `PlatformAdminInviteOut {admin, email_sent}`

- [ ] **Step 1: Write the failing tests**

`backend/tests/api/test_platform_firms.py`:

```python
"""/platform: only platform admins; firms are listed (the platform firm never),
created with an invited admin, get extra admins and re-sent invites, and are
suspended / re-activated."""
from types import SimpleNamespace

import pytest
from sqlalchemy import null

from app.core.security import hash_password
from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.services import platform_service
from app.services.firm_access import FIRM_SUSPENDED
from app.services.user_admin_service import EMAIL_TAKEN

NEW_FIRM = {"name": "  Yıldız   Hukuk ", "admin_full_name": "Selin Yıldız", "admin_email": "Selin@Yildiz.Example.com"}


@pytest.fixture()
def platform(db_session, office, auth_headers):
    firm = platform_service.get_or_create_platform_firm(db_session)
    user = User(
        law_firm_id=firm.id, email="ops@casebridge.example.com", hashed_password=hash_password(office.password),
        full_name="Platform Ekibi", role=UserRole.ADMIN, is_platform_admin=True,
    )
    db_session.add(user)
    db_session.commit()
    return SimpleNamespace(firm=firm, user=user, headers=auth_headers(user))


def _pending_admin(db_session, firm, email="bekleyen.yonetici@example.com"):
    user = User(
        law_firm_id=firm.id, email=email, hashed_password=hash_password("placeholder-1234"),
        full_name="Bekleyen Yönetici", role=UserRole.ADMIN, password_set_at=null(), invited_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_only_platform_admins_can_use_the_platform_endpoints(client, office, platform, auth_headers):
    firm_id = office.firm_b.id
    calls = [
        ("get", "/platform/firms", None),
        ("post", "/platform/firms", NEW_FIRM),
        ("post", f"/platform/firms/{firm_id}/admins", {"full_name": "X", "email": "x@example.com"}),
        ("post", f"/platform/firms/{firm_id}/admins/{office.admin_b.id}/invite", None),
        ("post", f"/platform/firms/{firm_id}/suspend", None),
        ("post", f"/platform/firms/{firm_id}/activate", None),
    ]
    for user in (office.lawyer_a1, office.admin_a):
        headers = auth_headers(user)
        for method, path, body in calls:
            kwargs = {"json": body} if body else {}
            response = getattr(client, method)(path, headers=headers, **kwargs)
            assert response.status_code == 403, (user.email, method, path)
            assert response.json()["detail"] == "Platform yetkisi gerekli."
    for method, path, body in calls:
        kwargs = {"json": body} if body else {}
        assert getattr(client, method)(path, **kwargs).status_code == 401, (method, path)


def test_me_reports_the_platform_admin(client, platform):
    assert client.get("/users/me", headers=platform.headers).json()["is_platform_admin"] is True


def test_list_shows_customer_firms_with_their_admins_and_hides_the_platform_firm(client, db_session, office, platform):
    pending = _pending_admin(db_session, office.firm_a)

    rows = client.get("/platform/firms", headers=platform.headers).json()

    assert [row["name"] for row in rows] == ["Demir Hukuk", "Kaya Hukuk"]
    demir = rows[0]
    assert set(demir) == {"id", "name", "created_at", "is_active", "suspended_at", "active_user_count", "admins"}
    assert (demir["is_active"], demir["suspended_at"], demir["active_user_count"]) == (True, None, 3)
    assert {admin["email"]: admin["status"] for admin in demir["admins"]} == {
        office.admin_a.email: "active", pending.email: "pending",
    }
    assert set(demir["admins"][0]) == {"id", "full_name", "email", "status", "invited_at"}


def test_create_firm_makes_a_pending_admin_who_can_set_a_password(client, db_session, platform, mail_outbox):
    response = client.post("/platform/firms", json=NEW_FIRM, headers=platform.headers)

    assert response.status_code == 201
    body = response.json()
    assert body["email_sent"] is True
    assert (body["firm"]["name"], body["firm"]["is_active"]) == ("Yıldız Hukuk", True)
    assert (body["admin"]["email"], body["admin"]["full_name"], body["admin"]["status"]) == (
        "selin@yildiz.example.com", "Selin Yıldız", "pending",
    )
    assert [admin["id"] for admin in body["firm"]["admins"]] == [body["admin"]["id"]]
    user = db_session.query(User).filter_by(email="selin@yildiz.example.com").one()
    assert (user.role, user.is_platform_admin, user.law_firm.name) == (UserRole.ADMIN, False, "Yıldız Hukuk")
    [message] = mail_outbox.messages(to="selin@yildiz.example.com")
    assert "Yıldız Hukuk" in message["Subject"]

    token = mail_outbox.latest_token("selin@yildiz.example.com")
    set_response = client.post("/auth/set-password", json={"token": token, "password": "Yeni-Sifre-2026"})
    assert set_response.status_code == 200
    me = client.get("/users/me", headers={"Authorization": f"Bearer {set_response.json()['access_token']}"}).json()
    assert (me["role"], me["is_platform_admin"]) == ("admin", False)


def test_create_rejects_a_firm_name_that_exists_ignoring_case(client, db_session, platform):
    response = client.post("/platform/firms", json={**NEW_FIRM, "name": "demir HUKUK"}, headers=platform.headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Bu adla bir büro zaten var."
    assert db_session.query(LawFirm).count() == 3  # Demir, Kaya and the platform firm


def test_create_rejects_a_registered_e_mail_and_leaves_no_firm(client, db_session, office, platform):
    response = client.post(
        "/platform/firms", json={**NEW_FIRM, "admin_email": office.lawyer_b.email}, headers=platform.headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == EMAIL_TAKEN
    assert db_session.query(LawFirm).filter_by(name="Yıldız Hukuk").count() == 0


def test_create_validates_the_firm_name(client, platform):
    response = client.post("/platform/firms", json={**NEW_FIRM, "name": "   "}, headers=platform.headers)
    assert response.status_code == 422


def test_a_failed_e_mail_keeps_the_firm_and_reports_it(client, db_session, platform, monkeypatch):
    monkeypatch.setattr(platform_service, "deliver", lambda message: False)

    response = client.post("/platform/firms", json=NEW_FIRM, headers=platform.headers)

    assert response.status_code == 201
    assert response.json()["email_sent"] is False
    assert db_session.query(LawFirm).filter_by(name="Yıldız Hukuk").count() == 1


def test_add_admin_invites_a_second_admin(client, office, platform, mail_outbox):
    response = client.post(
        f"/platform/firms/{office.firm_b.id}/admins",
        json={"full_name": "  İkinci   Yönetici ", "email": "Ikinci@Kaya.Example.com"},
        headers=platform.headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["admin"]["full_name"], body["admin"]["status"], body["email_sent"]) == ("İkinci Yönetici", "pending", True)
    assert len(mail_outbox.messages(to="ikinci@kaya.example.com")) == 1
    firm = next(row for row in client.get("/platform/firms", headers=platform.headers).json() if row["name"] == "Kaya Hukuk")
    assert len(firm["admins"]) == 2


def test_resend_invite_only_for_a_pending_admin_of_that_firm(client, db_session, office, platform, mail_outbox):
    pending = _pending_admin(db_session, office.firm_b)
    base = f"/platform/firms/{office.firm_b.id}/admins"

    response = client.post(f"{base}/{pending.id}/invite", headers=platform.headers)
    assert response.status_code == 200
    assert response.json()["email_sent"] is True
    assert len(mail_outbox.messages(to=pending.email)) == 1

    assert client.post(f"{base}/{office.admin_b.id}/invite", headers=platform.headers).status_code == 409
    assert client.post(f"{base}/{office.lawyer_b.id}/invite", headers=platform.headers).status_code == 404
    assert client.post(f"{base}/{office.admin_a.id}/invite", headers=platform.headers).status_code == 404


def test_the_platform_firm_is_not_reachable(client, platform):
    firm_id = platform.firm.id
    for path in (f"/platform/firms/{firm_id}/suspend", f"/platform/firms/{firm_id}/activate"):
        response = client.post(path, headers=platform.headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "Büro bulunamadı."
    assert client.post("/platform/firms/yok/suspend", headers=platform.headers).status_code == 404


def test_suspend_and_activate(client, db_session, office, platform):
    url = f"/platform/firms/{office.firm_b.id}"

    first = client.post(f"{url}/suspend", headers=platform.headers).json()
    assert first["is_active"] is False and first["suspended_at"] is not None
    again = client.post(f"{url}/suspend", headers=platform.headers).json()
    assert again["suspended_at"] == first["suspended_at"]
    login = client.post("/auth/login", json={"email": office.lawyer_b.email, "password": office.password})
    assert (login.status_code, login.json()["detail"]) == (403, FIRM_SUSPENDED)

    activated = client.post(f"{url}/activate", headers=platform.headers).json()
    assert (activated["is_active"], activated["suspended_at"]) == (True, None)
    login = client.post("/auth/login", json={"email": office.lawyer_b.email, "password": office.password})
    assert login.status_code == 200


def test_a_suspended_firm_gets_admins_but_no_invite_e_mails(client, db_session, office, platform, mail_outbox):
    pending = _pending_admin(db_session, office.firm_b)
    client.post(f"/platform/firms/{office.firm_b.id}/suspend", headers=platform.headers)

    added = client.post(
        f"/platform/firms/{office.firm_b.id}/admins",
        json={"full_name": "Yeni Yönetici", "email": "yeni.yonetici@example.com"},
        headers=platform.headers,
    )
    assert added.status_code == 201
    assert added.json()["email_sent"] is False
    assert mail_outbox.messages(to="yeni.yonetici@example.com") == []

    resend = client.post(f"/platform/firms/{office.firm_b.id}/admins/{pending.id}/invite", headers=platform.headers)
    assert (resend.status_code, resend.json()["detail"]) == (409, "Askıdaki büroya davet gönderilemez.")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_platform_firms.py -v`
Expected: FAIL. You should see `ImportError: cannot import name 'platform_service'`.

- [ ] **Step 3: Write the service**

`backend/app/services/platform_service.py`:

```python
"""The CaseBridge team's administration of customer firms (platform admins
only). The internal platform firm is never listed, changed or reachable here:
every lookup answers it with 404."""
from sqlalchemy.orm import Session

from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.schemas.admin_user import AdminUserCreate
from app.services.account_service import deliver, prepare_invite_email
from app.services.user_admin_service import UserAdminError, create_pending_user

PLATFORM_FIRM_NAME = "CaseBridge Platform"
FIRM_NOT_FOUND = "Büro bulunamadı."
ADMIN_NOT_FOUND = "Yönetici bulunamadı."
FIRM_NAME_TAKEN = "Bu adla bir büro zaten var."
SUSPENDED_INVITE = "Askıdaki büroya davet gönderilemez."
ALREADY_SET = "Kullanıcı şifresini zaten belirlemiş."
INACTIVE_INVITE = "Pasif kullanıcıya davet gönderilemez. Önce kullanıcıyı aktifleştirin."


def get_or_create_platform_firm(db: Session) -> LawFirm:
    """The internal firm of the platform admins. Flushes; the caller commits."""
    firm = db.query(LawFirm).filter(LawFirm.is_platform.is_(True)).first()
    if firm is None:
        firm = LawFirm(name=PLATFORM_FIRM_NAME, is_platform=True)
        db.add(firm)
        db.flush()
    return firm


def list_customer_firms(db: Session) -> list[LawFirm]:
    return db.query(LawFirm).filter(LawFirm.is_platform.is_(False)).order_by(LawFirm.name).all()


def get_customer_firm(db: Session, firm_id: str) -> LawFirm:
    firm = db.query(LawFirm).filter(LawFirm.id == firm_id, LawFirm.is_platform.is_(False)).first()
    if firm is None:
        raise UserAdminError(404, FIRM_NOT_FOUND)
    return firm


def firm_admins(firm: LawFirm) -> list[User]:
    return sorted((user for user in firm.users if user.role == UserRole.ADMIN), key=lambda u: (u.full_name, u.email))


def _name_taken(db: Session, name: str) -> bool:
    # casefold in Python: SQLite's lower() only folds ASCII (İ, Ş, Ç ...).
    wanted = name.casefold()
    return any(existing.casefold() == wanted for (existing,) in db.query(LawFirm.name).all())


def _new_admin(db: Session, firm: LawFirm, full_name: str, email: str) -> User:
    return create_pending_user(db, firm.id, AdminUserCreate(email=email, full_name=full_name, role=UserRole.ADMIN))


def create_firm(db: Session, name: str, admin_full_name: str, admin_email: str) -> tuple[LawFirm, User]:
    """The firm and its invited first admin. Flushes; the caller commits, then
    sends the invite."""
    if _name_taken(db, name):
        raise UserAdminError(409, FIRM_NAME_TAKEN)
    firm = LawFirm(name=name)
    db.add(firm)
    db.flush()
    return firm, _new_admin(db, firm, admin_full_name, admin_email)


def add_firm_admin(db: Session, firm: LawFirm, full_name: str, email: str) -> User:
    """Flushes; the caller commits."""
    return _new_admin(db, firm, full_name, email)


def get_firm_admin(db: Session, firm: LawFirm, user_id: str) -> User:
    user = db.query(User).filter(
        User.id == user_id, User.law_firm_id == firm.id, User.role == UserRole.ADMIN,
    ).first()
    if user is None:
        raise UserAdminError(404, ADMIN_NOT_FOUND)
    return user


def check_can_invite(firm: LawFirm, user: User) -> None:
    if not firm.is_active:
        raise UserAdminError(409, SUSPENDED_INVITE)
    if user.password_set_at is not None:
        raise UserAdminError(409, ALREADY_SET)
    if not user.is_active:
        raise UserAdminError(409, INACTIVE_INVITE)


def send_invite(db: Session, user: User) -> bool:
    """Issues the invite (committed) and sends it; False when sending failed.
    No inviter name: the e-mail comes from CaseBridge, not from a person."""
    return deliver(prepare_invite_email(db, user, inviter=None))


def set_firm_active(firm: LawFirm, active: bool) -> None:
    """Idempotent: suspending a suspended firm keeps its suspended_at."""
    if firm.is_active == active:
        return
    firm.is_active = active
    firm.suspended_at = None if active else utc_now()
```

- [ ] **Step 4: Write the schemas**

`backend/app/schemas/platform.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.user import UserStatus
from app.schemas.text_rules import clean_full_name, clean_single_line


def _clean_firm_name(value: str) -> str:
    value = clean_single_line(value)
    if not value or len(value) > 255:
        raise ValueError("Büro adı 1-255 karakter olmalı.")
    return value


class PlatformAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    status: UserStatus
    invited_at: datetime | None = None


class PlatformFirmOut(BaseModel):
    id: str
    name: str
    created_at: datetime | None = None
    is_active: bool
    suspended_at: datetime | None = None
    active_user_count: int
    admins: list[PlatformAdminOut]


class PlatformFirmCreate(BaseModel):
    name: str
    admin_full_name: str
    admin_email: EmailStr

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_firm_name(value)

    @field_validator("admin_full_name")
    @classmethod
    def _admin_full_name(cls, value: str) -> str:
        return clean_full_name(value)


class PlatformAdminCreate(BaseModel):
    full_name: str
    email: EmailStr

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        return clean_full_name(value)


class PlatformFirmCreatedOut(BaseModel):
    firm: PlatformFirmOut
    admin: PlatformAdminOut
    email_sent: bool


class PlatformAdminInviteOut(BaseModel):
    admin: PlatformAdminOut
    email_sent: bool
```

- [ ] **Step 5: Add the dependency and the router**

`backend/app/api/deps.py`. After `get_current_admin`, add:

```python
PLATFORM_REQUIRED = "Platform yetkisi gerekli."


def get_current_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PLATFORM_REQUIRED)
    return current_user
```

`backend/app/api/routes/platform.py`:

```python
"""The platform panel's API: customer firms and their administrators
(platform admins only)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_platform_admin
from app.db.session import get_db
from app.models.law_firm import LawFirm
from app.models.user import User, UserStatus
from app.schemas.platform import (
    PlatformAdminCreate,
    PlatformAdminInviteOut,
    PlatformAdminOut,
    PlatformFirmCreate,
    PlatformFirmCreatedOut,
    PlatformFirmOut,
)
from app.services.platform_service import (
    add_firm_admin,
    check_can_invite,
    create_firm,
    firm_admins,
    get_customer_firm,
    get_firm_admin,
    list_customer_firms,
    send_invite,
    set_firm_active,
)
from app.services.user_admin_service import EMAIL_TAKEN, UserAdminError

router = APIRouter(prefix="/platform", tags=["platform"])


def _http(error: UserAdminError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


def _firm_out(firm: LawFirm) -> PlatformFirmOut:
    return PlatformFirmOut(
        id=firm.id,
        name=firm.name,
        created_at=firm.created_at,
        is_active=firm.is_active,
        suspended_at=firm.suspended_at,
        active_user_count=sum(1 for user in firm.users if user.status == UserStatus.ACTIVE),
        admins=[PlatformAdminOut.model_validate(user) for user in firm_admins(firm)],
    )


def _firm(db: Session, firm_id: str) -> LawFirm:
    try:
        return get_customer_firm(db, firm_id)
    except UserAdminError as error:
        raise _http(error)


@router.get("/firms", response_model=list[PlatformFirmOut])
def list_firms(_: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    return [_firm_out(firm) for firm in list_customer_firms(db)]


@router.post("/firms", response_model=PlatformFirmCreatedOut, status_code=status.HTTP_201_CREATED)
def create(payload: PlatformFirmCreate, _: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    try:
        firm, admin = create_firm(db, payload.name, payload.admin_full_name, str(payload.admin_email))
        db.commit()
    except UserAdminError as error:
        db.rollback()
        raise _http(error)
    except IntegrityError:
        # Lost a race against another request using the same e-mail address.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN)
    email_sent = send_invite(db, admin)
    db.refresh(firm)
    db.refresh(admin)
    return PlatformFirmCreatedOut(firm=_firm_out(firm), admin=PlatformAdminOut.model_validate(admin), email_sent=email_sent)


@router.post("/firms/{firm_id}/admins", response_model=PlatformAdminInviteOut, status_code=status.HTTP_201_CREATED)
def add_admin(
    firm_id: str,
    payload: PlatformAdminCreate,
    _: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    firm = _firm(db, firm_id)
    try:
        admin = add_firm_admin(db, firm, payload.full_name, str(payload.email))
        db.commit()
    except UserAdminError as error:
        db.rollback()
        raise _http(error)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN)
    # A suspended firm's admin is invited after the firm is activated again.
    email_sent = send_invite(db, admin) if firm.is_active else False
    db.refresh(admin)
    return PlatformAdminInviteOut(admin=PlatformAdminOut.model_validate(admin), email_sent=email_sent)


@router.post("/firms/{firm_id}/admins/{user_id}/invite", response_model=PlatformAdminInviteOut)
def resend_invite(
    firm_id: str,
    user_id: str,
    _: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
):
    firm = _firm(db, firm_id)
    try:
        admin = get_firm_admin(db, firm, user_id)
        check_can_invite(firm, admin)
    except UserAdminError as error:
        raise _http(error)
    email_sent = send_invite(db, admin)
    db.refresh(admin)
    return PlatformAdminInviteOut(admin=PlatformAdminOut.model_validate(admin), email_sent=email_sent)


@router.post("/firms/{firm_id}/suspend", response_model=PlatformFirmOut)
def suspend(firm_id: str, _: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm = _firm(db, firm_id)
    set_firm_active(firm, False)
    db.commit()
    db.refresh(firm)
    return _firm_out(firm)


@router.post("/firms/{firm_id}/activate", response_model=PlatformFirmOut)
def activate(firm_id: str, _: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm = _firm(db, firm_id)
    set_firm_active(firm, True)
    db.commit()
    db.refresh(firm)
    return _firm_out(firm)
```

`backend/app/main.py`:
- Add `platform` to the `from app.api.routes import ...` list, keeping it alphabetical: `..., notifications, platform, precedents, ...`.
- After `app.include_router(admin_users.router)`, add `app.include_router(platform.router)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/test_platform_firms.py tests/unit/test_app_startup.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/platform_service.py backend/app/schemas/platform.py backend/app/api/routes/platform.py backend/app/api/deps.py backend/app/main.py backend/tests/api/test_platform_firms.py
git commit -m "feat: platform API for firms, firm admins and suspension"
```

---

### Task 4: First platform admins from `PLATFORM_ADMIN_EMAILS`

**Files:**
- Create: `backend/app/services/platform_bootstrap.py`
- Modify: `backend/app/core/config.py`, `backend/app/main.py`
- Test: `backend/tests/unit/test_platform_bootstrap.py`

**Interfaces:**
- Consumes: `get_or_create_platform_firm`, `create_pending_user`, `prepare_invite_email`, `deliver`, `invalidate_unused_tokens`.
- Produces:
  - `settings.platform_admin_emails: str`
  - `parse_platform_admin_emails(raw: str) -> list[str]`
  - `ensure_platform_admins(db, emails: list[str]) -> None`
  - `run_platform_bootstrap() -> None`. It never raises and is called from `lifespan` when `settings.env != "test"`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/unit/test_platform_bootstrap.py`:

```python
"""PLATFORM_ADMIN_EMAILS: platform admins are created and invited once; a
running invite is not re-sent, an expired or failed one is; addresses of
customer firms are never touched; startup never fails because of it."""
from datetime import timedelta

from app.core.config import settings
from app.core.timeutil import utc_now
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.models.user_token import UserToken
from app.services import platform_bootstrap
from app.services.platform_bootstrap import (
    PLATFORM_ADMIN_NAME,
    ensure_platform_admins,
    parse_platform_admin_emails,
    run_platform_bootstrap,
)

OPS = "ops@casebridge.example.com"


def test_parse_lowercases_trims_drops_duplicates_and_invalid_addresses():
    raw = " Ops@CaseBridge.example.com, ops@casebridge.example.com ,, gecersiz , ekip@casebridge.example.com"
    assert parse_platform_admin_emails(raw) == [OPS, "ekip@casebridge.example.com"]
    assert parse_platform_admin_emails("") == []


def test_an_empty_list_creates_nothing(db_session):
    ensure_platform_admins(db_session, [])
    assert db_session.query(LawFirm).count() == 0


def test_creates_the_platform_firm_and_an_invited_platform_admin(db_session, mail_outbox):
    ensure_platform_admins(db_session, [OPS])

    user = db_session.query(User).filter_by(email=OPS).one()
    assert user.law_firm.is_platform is True
    assert (user.role, user.is_platform_admin, user.full_name) == (UserRole.ADMIN, True, PLATFORM_ADMIN_NAME)
    assert user.password_set_at is None and user.invited_at is not None
    assert len(mail_outbox.messages(to=OPS)) == 1


def test_running_again_sends_no_new_e_mail(db_session, mail_outbox):
    ensure_platform_admins(db_session, [OPS])
    ensure_platform_admins(db_session, [OPS])

    assert db_session.query(User).filter_by(email=OPS).count() == 1
    assert db_session.query(LawFirm).filter_by(is_platform=True).count() == 1
    assert len(mail_outbox.messages(to=OPS)) == 1


def test_an_expired_invite_is_sent_again(db_session, mail_outbox):
    ensure_platform_admins(db_session, [OPS])
    for token in db_session.query(UserToken).all():
        token.expires_at = utc_now() - timedelta(minutes=1)
    db_session.commit()

    ensure_platform_admins(db_session, [OPS])

    assert len(mail_outbox.messages(to=OPS)) == 2


def test_a_failed_e_mail_is_retried_on_the_next_start(db_session, mail_outbox, monkeypatch):
    real_deliver = platform_bootstrap.deliver
    failing = {"on": True}
    monkeypatch.setattr(platform_bootstrap, "deliver", lambda message: False if failing["on"] else real_deliver(message))

    ensure_platform_admins(db_session, [OPS])
    assert mail_outbox.messages(to=OPS) == []

    failing["on"] = False
    ensure_platform_admins(db_session, [OPS])

    assert len(mail_outbox.messages(to=OPS)) == 1


def test_an_address_of_a_customer_firm_is_left_alone(db_session, office, mail_outbox):
    ensure_platform_admins(db_session, [office.admin_a.email])

    db_session.refresh(office.admin_a)
    assert office.admin_a.is_platform_admin is False
    assert office.admin_a.law_firm_id == office.firm_a.id
    assert mail_outbox.messages(to=office.admin_a.email) == []


def test_a_platform_firm_user_without_the_flag_gets_it(db_session, mail_outbox):
    from app.services.platform_service import get_or_create_platform_firm

    firm = get_or_create_platform_firm(db_session)
    user = User(law_firm_id=firm.id, email=OPS, hashed_password="x", full_name="Ops", role=UserRole.ADMIN)
    db_session.add(user)
    db_session.commit()

    ensure_platform_admins(db_session, [OPS])

    db_session.refresh(user)
    assert user.is_platform_admin is True
    assert mail_outbox.messages(to=OPS) == []  # the password is already set


def test_the_startup_hook_never_raises(db_session, monkeypatch):
    monkeypatch.setattr(settings, "platform_admin_emails", OPS)
    monkeypatch.setattr(platform_bootstrap, "SessionLocal", lambda: db_session)

    def boom(db, emails):
        raise RuntimeError("veritabanı yok")

    monkeypatch.setattr(platform_bootstrap, "ensure_platform_admins", boom)

    run_platform_bootstrap()  # must not raise
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/unit/test_platform_bootstrap.py -v`
Expected: FAIL. You should see `ImportError: cannot import name 'platform_bootstrap'`.

- [ ] **Step 3: Add the setting**

`backend/app/core/config.py`. After the `frontend_base_url: str = ""` line, add:

```python

    # The CaseBridge team's platform administrators (comma-separated e-mail
    # addresses). On every start the missing ones are created in the internal
    # platform firm and get an invite e-mail; they open customer firms in the
    # platform panel (/platform). Removing an address does not revoke access.
    platform_admin_emails: str = ""
```

- [ ] **Step 4: Write the bootstrap**

`backend/app/services/platform_bootstrap.py`:

```python
"""Creates the CaseBridge team's platform administrators listed in
PLATFORM_ADMIN_EMAILS when the application starts.

Safe on every start: an address that already has an account gets no new
e-mail while its invite link is still usable; an expired invite (or one whose
e-mail could not be sent) is sent again. An address registered in a customer
firm is never touched. Nothing here may stop the application from starting.
"""
import logging

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utc_now
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.user_token import TokenPurpose, UserToken
from app.repositories.user_repository import UserRepository
from app.schemas.admin_user import AdminUserCreate
from app.services.account_service import deliver, prepare_invite_email
from app.services.platform_service import get_or_create_platform_firm
from app.services.user_admin_service import create_pending_user
from app.services.user_token_service import invalidate_unused_tokens

logger = logging.getLogger("casebridge")

PLATFORM_ADMIN_NAME = "Platform Yöneticisi"
_EMAIL = TypeAdapter(EmailStr)


def parse_platform_admin_emails(raw: str) -> list[str]:
    """Lower-cased, trimmed, without duplicates; invalid entries are logged
    (without the address) and skipped."""
    emails: list[str] = []
    for part in raw.split(","):
        email = part.strip().lower()
        if not email or email in emails:
            continue
        try:
            _EMAIL.validate_python(email)
        except ValidationError:
            logger.warning("PLATFORM_ADMIN_EMAILS içinde geçersiz bir adres atlandı.")
            continue
        emails.append(email)
    return emails


def _has_usable_invite(db: Session, user: User) -> bool:
    return db.query(UserToken).filter(
        UserToken.user_id == user.id,
        UserToken.purpose == TokenPurpose.INVITE.value,
        UserToken.used_at.is_(None),
        UserToken.expires_at > utc_now(),
    ).first() is not None


def ensure_platform_admins(db: Session, emails: list[str]) -> None:
    if not emails:
        return
    firm = get_or_create_platform_firm(db)
    users = UserRepository(db)
    to_invite: list[User] = []
    for email in emails:
        user = users.get_by_email(email)
        if user is None:
            user = create_pending_user(
                db, firm.id, AdminUserCreate(email=email, full_name=PLATFORM_ADMIN_NAME, role=UserRole.ADMIN)
            )
            user.is_platform_admin = True
            to_invite.append(user)
            continue
        if user.law_firm_id != firm.id:
            logger.warning("PLATFORM_ADMIN_EMAILS: bir adres müşteri bürosunda kayıtlı olduğu için atlandı.")
            continue
        user.is_platform_admin = True
        if user.is_active and user.password_set_at is None and not _has_usable_invite(db, user):
            to_invite.append(user)
    db.commit()

    for user in to_invite:
        if deliver(prepare_invite_email(db, user, inviter=None)):
            continue
        # Without a usable invite the next start sends a new one.
        invalidate_unused_tokens(db, user.id, TokenPurpose.INVITE)
        db.commit()
        logger.error("Platform yöneticisi davet e-postası gönderilemedi; bir sonraki açılışta yeniden denenecek.")


def run_platform_bootstrap() -> None:
    """Startup hook: a failure is logged and the application still starts."""
    emails = parse_platform_admin_emails(settings.platform_admin_emails)
    if not emails:
        return
    db = SessionLocal()
    try:
        ensure_platform_admins(db, emails)
    except Exception as exc:
        db.rollback()
        logger.error("Platform yöneticileri oluşturulamadı: %s", type(exc).__name__)
    finally:
        db.close()
```

`backend/app/main.py`:
- Add the import `from app.services.platform_bootstrap import run_platform_bootstrap`.
- In `lifespan`, directly before the `# Phase 3 - in-process simulation worker.` comment, add:

```python
    # The CaseBridge team's platform admins (PLATFORM_ADMIN_EMAILS). Not in
    # automated tests: they call ensure_platform_admins on their own session.
    if settings.env != "test":
        run_platform_bootstrap()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/unit/test_platform_bootstrap.py tests/unit/test_app_startup.py tests/unit/test_config.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/platform_bootstrap.py backend/app/core/config.py backend/app/main.py backend/tests/unit/test_platform_bootstrap.py
git commit -m "feat: platform admins from PLATFORM_ADMIN_EMAILS at startup"
```

---

### Task 5: Seed, removal of `create_admin`, docs

**Files:**
- Modify:
  - `backend/app/db/seed.py`
  - Tests: `backend/tests/integration/test_seed.py`, `backend/tests/integration/test_seed_real_data_mode.py`
  - Docs and config: `README.md`, `.env.example`, `PROGRESS.md`
- Delete: `backend/app/db/create_admin.py`, `backend/tests/integration/test_create_admin.py`

**Interfaces:**
- Consumes: `get_or_create_platform_firm`, `PLATFORM_FIRM_NAME`, `remove_demo_data(db, *, firm_name, case_numbers, emails, demo_password)`.
- Produces:
  - `seed.PLATFORM_DEMO_EMAIL = "platform@demo.casebridge.dev"`. In demo mode it is a platform admin in the platform firm with password `demo1234`.
  - Real-data mode removes it, plus the platform firm when nothing else references that firm.

- [ ] **Step 1: Update the tests first**

`backend/tests/integration/test_seed.py`:
- In the import block from `app.db.seed`, add `DEMO_FIRM_NAME` and `PLATFORM_DEMO_EMAIL`.
- In `test_seed_creates_demo_firm_users_and_cases`, replace `firm = db_session.query(LawFirm).one()` with:

```python
    firm = db_session.query(LawFirm).filter_by(name=DEMO_FIRM_NAME).one()
```

- At the end of that test, add:

```python
    platform_user = db_session.query(User).filter_by(email=PLATFORM_DEMO_EMAIL).one()
    assert platform_user.is_platform_admin is True and platform_user.law_firm.is_platform is True
    assert verify_password(DEMO_PASSWORD, platform_user.hashed_password)
```

- In `test_seed_is_idempotent`, change the two counts to:

```python
    assert db_session.query(LawFirm).count() == 2  # the demo firm and the platform firm
    assert db_session.query(User).count() == 5
```

`backend/tests/integration/test_seed_real_data_mode.py`:
- In `test_real_data_mode_on_an_empty_database_creates_no_firm_and_no_users`, replace the last assertion with:

```python
    assert "real data mode" in out and "PLATFORM_ADMIN_EMAILS" in out
    assert "create_admin" not in out
```

- In `test_real_data_mode_removes_an_earlier_demo_completely`, change `db_session.query(User).count() == 4` to `== 5`.
- In `test_demo_mode_still_creates_the_demo_accounts`, change the expected set to:

```python
    assert {u.email for u in db_session.query(User).all()} == {
        seed_module.ADMIN_EMAIL, seed_module.PLATFORM_DEMO_EMAIL, *(email for email, *_ in seed_module.DEMO_LAWYERS),
    }
```

- Add a new test:

```python
def test_real_data_mode_keeps_real_platform_admins(run_seed, db_session):
    run_seed(True)
    platform_firm = db_session.query(LawFirm).filter_by(is_platform=True).one()
    db_session.add(User(law_firm_id=platform_firm.id, email="ops@casebridge.example.com",
                        hashed_password=hash_password("x"), full_name="Ops", role=UserRole.ADMIN,
                        is_platform_admin=True))
    db_session.commit()

    run_seed(False)

    assert [u.email for u in db_session.query(User).all()] == ["ops@casebridge.example.com"]
    assert [f.name for f in db_session.query(LawFirm).all()] == ["CaseBridge Platform"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/integration/test_seed.py tests/integration/test_seed_real_data_mode.py -v`
Expected: FAIL. You should see `ImportError: cannot import name 'PLATFORM_DEMO_EMAIL'`.

- [ ] **Step 3: Update the seed**

`backend/app/db/seed.py`:
- Add the import `from app.services.platform_service import PLATFORM_FIRM_NAME, get_or_create_platform_firm`.
- After `DEMO_PASSWORD = "demo1234"`, add `PLATFORM_DEMO_EMAIL = "platform@demo.casebridge.dev"`.
- Update the module docstring's second paragraph so it reads: "Creates one demo law firm, an admin and three lawyers, the platform firm with a demo platform admin, and a handful of demo cases ..."
- In the real-data-mode branch, directly after the first `removed = remove_demo_data(...)` call, add:

```python
            # The demo platform admin; the platform firm goes with it unless real
            # platform admins (PLATFORM_ADMIN_EMAILS) belong to it.
            remove_demo_data(
                db,
                firm_name=PLATFORM_FIRM_NAME,
                case_numbers=[],
                emails=[PLATFORM_DEMO_EMAIL],
                demo_password=DEMO_PASSWORD,
            )
```

- In that branch, replace the `print('  Create the first administrator with: python -m app.db.create_admin ...')` line with:

```python
            print("  Platform yöneticileri PLATFORM_ADMIN_EMAILS ayarıyla oluşturulur; bürolar platform panelinden (/platform) açılır.")
```

- In demo mode, directly after `lawyer = lawyers[0]`, add:

```python
        platform_firm = get_or_create_platform_firm(db)
        platform_admin = _get_or_create_user(db, platform_firm, PLATFORM_DEMO_EMAIL, "Platform Ekibi", UserRole.ADMIN)
        platform_admin.is_platform_admin = True
```

- After `print(f"  Lawyer login: {LAWYER_EMAIL} / {DEMO_PASSWORD}")`, add:

```python
        print(f"  Platform login: {PLATFORM_DEMO_EMAIL} / {DEMO_PASSWORD}")
```

- [ ] **Step 4: Delete the command and its test, then check for leftovers**

```bash
git rm backend/app/db/create_admin.py backend/tests/integration/test_create_admin.py
grep -rn "create_admin" backend/app backend/tests frontend/src tests/e2e/specs README.md .env.example
```

Expected: no output.

- [ ] **Step 5: Update the docs**

`README.md`:
- Under the demo accounts list (after `- avukat@demo.casebridge.dev / demo1234 (Lawyer, Demo Hukuk Bürosu)`), add:
  `- platform@demo.casebridge.dev / demo1234 (CaseBridge platform admin: opens and suspends firms at /platform)`
- Replace the line starting with `- There is no self-registration.` with:
  `- There is no self-registration. CaseBridge runs as a cloud service for many firms: the CaseBridge team's platform administrators are listed in PLATFORM_ADMIN_EMAILS (created and invited on startup), open each customer firm and its first administrator in the platform panel (/platform) and can suspend a firm (its users cannot sign in; the data stays). Firm administrators then add users in **Ayarlar > Kullanıcılar** and each person sets their own password from an e-mailed link.`

`.env.example`. After the `RESET_TOKEN_MINUTES=60` line, add:

```
# CaseBridge team's platform administrators (comma-separated). Missing ones are
# created on startup and get an invite e-mail; they open customer firms at
# /platform. Removing an address does not revoke access.
PLATFORM_ADMIN_EMAILS=
```

`PROGRESS.md`. Append at the end:

```
## Platform panel (2026-10-23)
- Firms and their first administrators are opened by the CaseBridge team in the platform panel (/platform); `python -m app.db.create_admin` is removed.
- Platform admins come from PLATFORM_ADMIN_EMAILS (created and invited on startup, idempotent); demo: platform@demo.casebridge.dev / demo1234.
- A firm can be suspended: its users cannot sign in, open sessions end, links and reset e-mails stop, reminders are skipped; data stays.
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/python -m pytest tests/integration -v`
Expected: PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `.venv/bin/python -m pytest -q` (about ten minutes)
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/db/seed.py backend/tests/integration/test_seed.py backend/tests/integration/test_seed_real_data_mode.py README.md .env.example PROGRESS.md
git commit -m "feat: demo platform admin in the seed; remove the create_admin command"
```

(The `git rm` in Step 4 already staged the deletions.)

---

### Task 6: Frontend foundation — types, API, home routing, suspension handling, platform shell

**Files:**
- Create: `frontend/src/lib/home.ts`, `frontend/src/lib/firmStatus.ts`, `frontend/src/lib/__tests__/home.test.ts`, `frontend/src/components/__tests__/AppShell.test.tsx`
- Modify:
  - `frontend/src/types/index.ts`
  - `frontend/src/lib/api.ts`
  - Components: `frontend/src/components/AppShell.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/WorkspaceHeader.tsx`, `frontend/src/components/auth/LoginView.tsx`, `frontend/src/components/auth/SetPasswordView.tsx`
  - `frontend/src/app/page.tsx`
  - Tests: `frontend/src/lib/__tests__/api.test.ts`, `frontend/src/components/__tests__/Sidebar.test.tsx`, `frontend/src/components/__tests__/AuthPages.test.tsx`

**Interfaces:**
- Consumes: backend `/users/me.is_platform_admin`, `/platform/*` shapes (Task 3), 403 `FIRM_SUSPENDED` (Task 2).
- Produces:
  - Types: `AppUser.is_platform_admin?: boolean`, `PlatformAdmin`, `PlatformFirm`, `PlatformFirmPayload`, `PlatformFirmCreated`, `PlatformAdminPayload`, `PlatformAdminInvite`.
  - API calls:
    - `listPlatformFirms()`
    - `createPlatformFirm(payload)`
    - `addPlatformFirmAdmin(firmId, payload)`
    - `resendPlatformAdminInvite(firmId, userId)`
    - `suspendPlatformFirm(firmId)`
    - `activatePlatformFirm(firmId)`
  - `FIRM_SUSPENDED` exported from `@/lib/firmStatus`.
  - `homePath(user)`.
  - `<AppShell platform>`.
  - `<Sidebar platform>`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/__tests__/home.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { homePath } from "@/lib/home";

describe("homePath", () => {
  it("sends platform admins to the platform panel, admins to /admin and lawyers to /dashboard", () => {
    expect(homePath({ role: "admin", is_platform_admin: true })).toBe("/platform");
    expect(homePath({ role: "admin", is_platform_admin: false })).toBe("/admin");
    expect(homePath({ role: "admin" })).toBe("/admin");
    expect(homePath({ role: "lawyer" })).toBe("/dashboard");
  });
});
```

`frontend/src/lib/__tests__/api.test.ts`. Inside `describe("api request()", ...)`, after the 401 test, add:

```ts
  it("clears the token and sends a suspended firm's user to the login page with the notice", async () => {
    window.localStorage.setItem("casebridge_token", "valid-token");
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Büronuzun erişimi askıya alındı." }),
    }) as unknown as typeof fetch;

    const { listAllTasks } = await import("@/lib/api");

    await expect(listAllTasks()).rejects.toThrow("Büronuzun erişimi askıya alındı.");
    expect(window.localStorage.getItem("casebridge_token")).toBeNull();
    expect(window.location.href).toContain("/login?askida=1");
  });

  it("does not redirect on another 403", async () => {
    window.localStorage.setItem("casebridge_token", "valid-token");
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Admin access required" }),
    }) as unknown as typeof fetch;

    const { listAllTasks } = await import("@/lib/api");

    await expect(listAllTasks()).rejects.toThrow();
    expect(window.localStorage.getItem("casebridge_token")).toBe("valid-token");
    expect(window.location.href).not.toContain("/login");
  });

  it("calls the platform endpoints with the right methods", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const api = await import("@/lib/api");

    await api.listPlatformFirms();
    await api.createPlatformFirm({ name: "B", admin_full_name: "Y", admin_email: "y@b.test" });
    await api.addPlatformFirmAdmin("f1", { full_name: "Y", email: "y@b.test" });
    await api.resendPlatformAdminInvite("f1", "u1");
    await api.suspendPlatformFirm("f1");
    await api.activatePlatformFirm("f1");

    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url).replace(/^https?:\/\/[^/]+/, ""), init?.method ?? "GET"]);
    expect(calls).toEqual([
      ["/platform/firms", "GET"],
      ["/platform/firms", "POST"],
      ["/platform/firms/f1/admins", "POST"],
      ["/platform/firms/f1/admins/u1/invite", "POST"],
      ["/platform/firms/f1/suspend", "POST"],
      ["/platform/firms/f1/activate", "POST"],
    ]);
  });
```

`frontend/src/components/__tests__/Sidebar.test.tsx`. Inside `describe("Sidebar", ...)`, add:

```tsx
  it("shows only the platform items to a platform admin", () => {
    pathname = "/platform";
    render(<Sidebar role="admin" platform />);

    expect(screen.getByRole("link", { name: /Büro Yönetimi/ })).toHaveAttribute("href", "/platform");
    expect(screen.getByRole("link", { name: /Hesabım/ })).toHaveAttribute("href", "/hesabim");
    expect(screen.queryByRole("link", { name: /Davalar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin Paneli/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "CaseBridge AI" })).not.toBeInTheDocument();
  });
```

`frontend/src/components/__tests__/AppShell.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getMe = vi.fn();
vi.mock("@/lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getAiConnectivity: vi.fn(() => new Promise(() => {})),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
vi.mock("@/components/WorkspaceHeader", () => ({ WorkspaceHeader: () => null }));
vi.mock("@/components/CaseQuickView", () => ({ CaseQuickView: () => null }));

import { AppShell } from "@/components/AppShell";
import { ApiError } from "@/lib/apiError";
import { nav, resetNav, setUrl } from "@/test/navigation";

const LAWYER = { id: "l1", role: "lawyer", is_platform_admin: false };
const PLATFORM = { id: "p1", role: "admin", is_platform_admin: true };

beforeEach(() => {
  resetNav();
  getMe.mockReset();
  window.localStorage.setItem("casebridge_token", "t");
});

describe("AppShell", () => {
  it("sends a platform admin from a firm page to the platform panel", async () => {
    setUrl("/dashboard");
    getMe.mockResolvedValue(PLATFORM);
    render(<AppShell><p>firma sayfası</p></AppShell>);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/platform"));
    expect(screen.queryByText("firma sayfası")).not.toBeInTheDocument();
  });

  it("lets a platform admin open the account page", async () => {
    setUrl("/hesabim");
    getMe.mockResolvedValue(PLATFORM);
    render(<AppShell><p>hesap</p></AppShell>);

    expect(await screen.findByText("hesap")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("sends anyone else away from the platform panel", async () => {
    setUrl("/platform");
    getMe.mockResolvedValue(LAWYER);
    render(<AppShell platform><p>panel</p></AppShell>);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
  });

  it("leaves the suspended-firm redirect to the API layer", async () => {
    setUrl("/dashboard");
    getMe.mockRejectedValue(new ApiError("Büronuzun erişimi askıya alındı.", 403));
    render(<AppShell><p>sayfa</p></AppShell>);

    await waitFor(() => expect(getMe).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows the platform panel to a platform admin", async () => {
    setUrl("/platform");
    getMe.mockResolvedValue(PLATFORM);
    render(<AppShell platform><p>panel</p></AppShell>);

    expect(await screen.findByText("panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Büro Yönetimi/ })).toBeInTheDocument();
  });
});
```

`frontend/src/components/__tests__/AuthPages.test.tsx`:
1. Add `["platform", "/platform"]` to the login destination table. It is the parameterised block around line 71 holding `["admin", "/admin"]`. Read the table first and match its row shape. If the rows are `[role, destination]` and the mocked user is built as `{ id: "u1", role }`, then change the mock for this row to `{ id: "u1", role: "admin", is_platform_admin: true }`, for example by building the user as `role === "platform" ? { id: "u1", role: "admin", is_platform_admin: true } : { id: "u1", role }`.
2. Add a LoginView test:

```tsx
  it("shows the suspension notice when sent back from a suspended firm", async () => {
    window.history.pushState({}, "", "/login?askida=1");
    render(<LoginView />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Büronuzun erişimi askıya alındı.");
    window.history.pushState({}, "", "/login");
  });
```

3. Add a test that the demo hint lists `Platform: platform@demo.casebridge.dev`. Mirror the existing demo-hint test at line ~55.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/home.test.ts src/lib/__tests__/api.test.ts src/components/__tests__/Sidebar.test.tsx src/components/__tests__/AppShell.test.tsx src/components/__tests__/AuthPages.test.tsx`
Expected: FAIL. `@/lib/home` is missing, there are no platform API functions, and the Sidebar has no `platform` prop.

- [ ] **Step 3: Types**

`frontend/src/types/index.ts`:
- In `AppUser`, after `is_active: boolean;`, add:

```ts
  /** CaseBridge team member who manages customer firms (/platform). */
  is_platform_admin?: boolean;
```

- After `ManagedUserInvite`, add:

```ts
/** An administrator of a customer firm as the platform panel shows them. */
export interface PlatformAdmin {
  id: string;
  full_name: string;
  email: string;
  status: UserStatus;
  invited_at: string | null;
}

/** A customer firm in the platform panel (GET /platform/firms). */
export interface PlatformFirm {
  id: string;
  name: string;
  created_at: string | null;
  is_active: boolean;
  suspended_at: string | null;
  active_user_count: number;
  admins: PlatformAdmin[];
}

export interface PlatformFirmPayload {
  name: string;
  admin_full_name: string;
  admin_email: string;
}

/** email_sent is false when the invite could not be sent (it can be sent again). */
export interface PlatformFirmCreated {
  firm: PlatformFirm;
  admin: PlatformAdmin;
  email_sent: boolean;
}

export interface PlatformAdminPayload {
  full_name: string;
  email: string;
}

export interface PlatformAdminInvite {
  admin: PlatformAdmin;
  email_sent: boolean;
}
```

- [ ] **Step 4: API**

`frontend/src/lib/api.ts`:
- Add the six platform types to the `import type {...} from "@/types"` list: `PlatformAdminInvite`, `PlatformAdminPayload`, `PlatformFirm`, `PlatformFirmCreated`, `PlatformFirmPayload`.
- Create `frontend/src/lib/firmStatus.ts`:

```ts
/** The backend's answer (403) for every request of a suspended firm's user. Kept
 * out of api.ts so tests that mock the API module still see the real text. */
export const FIRM_SUSPENDED = "Büronuzun erişimi askıya alındı.";
```

- In `api.ts`, add `import { FIRM_SUSPENDED } from "@/lib/firmStatus";` next to the `ApiError` import.

- In `throwApiError`, after the 401 block, add:

```ts
  if (response.status === 403 && detail === FIRM_SUSPENDED && !NO_SESSION_REDIRECT_PATHS.includes(path)) {
    // The firm was suspended: the session is over. The login page shows why.
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login?askida=1";
    }
  }
```

- After `activateUser`, add:

```ts
export async function listPlatformFirms(): Promise<PlatformFirm[]> {
  return request("/platform/firms");
}

export async function createPlatformFirm(payload: PlatformFirmPayload): Promise<PlatformFirmCreated> {
  return request("/platform/firms", { method: "POST", body: JSON.stringify(payload) });
}

export async function addPlatformFirmAdmin(firmId: string, payload: PlatformAdminPayload): Promise<PlatformAdminInvite> {
  return request(`/platform/firms/${firmId}/admins`, { method: "POST", body: JSON.stringify(payload) });
}

export async function resendPlatformAdminInvite(firmId: string, userId: string): Promise<PlatformAdminInvite> {
  return request(`/platform/firms/${firmId}/admins/${userId}/invite`, { method: "POST" });
}

export async function suspendPlatformFirm(firmId: string): Promise<PlatformFirm> {
  return request(`/platform/firms/${firmId}/suspend`, { method: "POST" });
}

export async function activatePlatformFirm(firmId: string): Promise<PlatformFirm> {
  return request(`/platform/firms/${firmId}/activate`, { method: "POST" });
}
```

- [ ] **Step 5: Home routing**

`frontend/src/lib/home.ts`:

```ts
import type { AppUser } from "@/types";

/** Where a user lands after signing in or opening "/". */
export function homePath(user: Pick<AppUser, "role" | "is_platform_admin">): string {
  if (user.is_platform_admin) return "/platform";
  return user.role === "admin" ? "/admin" : "/dashboard";
}
```

Use it in three places:
- `frontend/src/app/page.tsx`: add the import `homePath` from `@/lib/home`, and replace `router.replace(user.role === "admin" ? "/admin" : "/dashboard")` with `router.replace(homePath(user))`.
- `frontend/src/components/auth/LoginView.tsx`: replace `router.push(user.role === "admin" ? "/admin" : "/dashboard");` with `router.push(homePath(user));`, plus the import.
- `frontend/src/components/auth/SetPasswordView.tsx`: replace `router.replace(user.role === "admin" ? "/admin" : "/dashboard");` with `router.replace(homePath(user));`, plus the import.

- [ ] **Step 6: Login notice and demo hint**

`frontend/src/components/auth/LoginView.tsx`:
- Add `import { FIRM_SUSPENDED } from "@/lib/firmStatus";`.
- Add the state `const [notice, setNotice] = useState<string | null>(null);`.
- Add this effect after the auth-config effect:

```tsx
  useEffect(() => {
    // Sent here by the API layer when the firm was suspended (see api.ts).
    if (new URLSearchParams(window.location.search).get("askida") === "1") setNotice(FIRM_SUSPENDED);
  }, []);
```

- Replace the error paragraph block with:

```tsx
        {(error ?? notice) && (
          <p role="alert" className="text-sm text-red-600">
            {error ?? notice}
          </p>
        )}
```

- In the demo hint, after the `Avukat:` line, add `<p>Platform: platform@demo.casebridge.dev</p>`.

- [ ] **Step 7: Platform shell**

`frontend/src/components/AppShell.tsx`. Replace the whole file:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CaseQuickView } from "@/components/CaseQuickView";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getMe } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { FIRM_SUSPENDED } from "@/lib/firmStatus";
import { subscribeUserUpdated } from "@/lib/userEvents";
import type { AppUser } from "@/types";

/** Pages a platform admin may open besides the platform panel. */
const PLATFORM_ALLOWED = ["/hesabim"];

/** `platform`: the page is the platform panel (platform admins only). A
 * platform admin is kept out of the firm pages: they belong to no customer firm. */
export function AppShell({ children, platform = false }: { children: React.ReactNode; platform?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("casebridge_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe().then((result) => {
      if (platform && !result.is_platform_admin) {
        router.replace("/dashboard");
        return;
      }
      if (!platform && result.is_platform_admin && !PLATFORM_ALLOWED.includes(pathname ?? "")) {
        router.replace("/platform");
        return;
      }
      setUser(result);
      setReady(true);
    }).catch((err) => {
      // A suspended firm: api.ts is already loading /login?askida=1; a client
      // redirect here would race it and drop the notice.
      if (err instanceof ApiError && err.message === FIRM_SUSPENDED) return;
      router.replace("/login");
    });
  }, [router, platform, pathname]);

  // The account page announces profile changes so the header stays current.
  useEffect(() => subscribeUserUpdated(setUser), []);

  if (!ready) return null;

  // Suspense boundaries: views and the drawer read useSearchParams(), which
  // Next 14 requires to be inside <Suspense> for static prerendering.
  return (
    <div className="flex h-screen bg-surface-muted">
      <Sidebar role={user?.role} platform={!!user?.is_platform_admin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader user={user} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <ErrorBoundary>
            <Suspense fallback={null}>{children}</Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Suspense fallback={null}>
        <CaseQuickView />
      </Suspense>
    </div>
  );
}
```

`frontend/src/components/Sidebar.tsx`:
- After `SETTINGS_ITEM`, add:

```tsx
const PLATFORM_ITEM: NavItem = {
  label: "Büro Yönetimi",
  href: "/platform",
  icon: <Icon d="M3 21h18M5 21V7l7-4 7 4v14M9 10h2M13 10h2M9 14h2M13 14h2" />,
};

const ACCOUNT_ITEM: NavItem = {
  label: "Hesabım",
  href: "/hesabim",
  icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
};
```

- Change the signature to `export function Sidebar({ role, platform = false }: { role?: "admin" | "lawyer"; platform?: boolean }) {`.
- Replace the opening `<nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1">` with:

```tsx
      {platform ? (
        <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1">
          <NavLink item={PLATFORM_ITEM} pathname={pathname} />
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <NavLink item={ACCOUNT_ITEM} pathname={pathname} />
          </div>
        </nav>
      ) : (
      <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1">
```

- Replace the closing `</nav>` (the one directly before `</aside>`) with:

```tsx
      </nav>
      )}
```

`frontend/src/components/WorkspaceHeader.tsx`. In `PAGE_TITLES`, after `"/admin": "Admin Paneli",`, add `"/platform": "Büro Yönetimi",`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/home.test.ts src/lib/__tests__/api.test.ts src/components/__tests__/Sidebar.test.tsx src/components/__tests__/AppShell.test.tsx src/components/__tests__/AuthPages.test.tsx src/components/__tests__/WorkspaceHeader.test.tsx`
Expected: PASS.

Then run `npx tsc --noEmit`.
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts frontend/src/lib/home.ts frontend/src/lib/firmStatus.ts frontend/src/app/page.tsx frontend/src/components/AppShell.tsx frontend/src/components/Sidebar.tsx frontend/src/components/WorkspaceHeader.tsx frontend/src/components/auth/LoginView.tsx frontend/src/components/auth/SetPasswordView.tsx frontend/src/lib/__tests__/home.test.ts frontend/src/lib/__tests__/api.test.ts frontend/src/components/__tests__/Sidebar.test.tsx frontend/src/components/__tests__/AppShell.test.tsx frontend/src/components/__tests__/AuthPages.test.tsx
git commit -m "feat: platform admin routing, sidebar and the suspended-firm notice"
```

---

### Task 7: Platform panel page

**Files:**
- Create:
  - `frontend/src/components/platform/NoticeLine.tsx`
  - `frontend/src/components/platform/FirmFormModal.tsx`
  - `frontend/src/components/platform/FirmDetailModal.tsx`
  - `frontend/src/components/platform/PlatformView.tsx`
  - `frontend/src/app/platform/page.tsx`
- Test: `frontend/src/components/__tests__/PlatformView.test.tsx`

**Interfaces:**
- Consumes: the platform API calls and types (Task 6), `ModalFrame`, `CaseConfirmModal`, `LoadingState`, `ErrorState`, `userMessage`.
- Produces: `PlatformView` (default page body of `/platform`), and `FirmSaved = { kind: "firm"; created: PlatformFirmCreated } | { kind: "admin"; firmId: string; invite: PlatformAdminInvite }`.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/__tests__/PlatformView.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  listPlatformFirms: vi.fn(),
  createPlatformFirm: vi.fn(),
  addPlatformFirmAdmin: vi.fn(),
  resendPlatformAdminInvite: vi.fn(),
  suspendPlatformFirm: vi.fn(),
  activatePlatformFirm: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  listPlatformFirms: (...a: unknown[]) => api.listPlatformFirms(...a),
  createPlatformFirm: (...a: unknown[]) => api.createPlatformFirm(...a),
  addPlatformFirmAdmin: (...a: unknown[]) => api.addPlatformFirmAdmin(...a),
  resendPlatformAdminInvite: (...a: unknown[]) => api.resendPlatformAdminInvite(...a),
  suspendPlatformFirm: (...a: unknown[]) => api.suspendPlatformFirm(...a),
  activatePlatformFirm: (...a: unknown[]) => api.activatePlatformFirm(...a),
}));

import { ApiError } from "@/lib/apiError";
import { PlatformView } from "@/components/platform/PlatformView";
import type { PlatformAdmin, PlatformFirm } from "@/types";

function admin(id: string, name: string, over: Partial<PlatformAdmin> = {}): PlatformAdmin {
  return { id, full_name: name, email: `${id}@buro.test`, status: "active", invited_at: null, ...over };
}

function firm(id: string, name: string, over: Partial<PlatformFirm> = {}): PlatformFirm {
  return {
    id, name, created_at: "2026-10-01T09:00:00", is_active: true, suspended_at: null, active_user_count: 3,
    admins: [admin(`${id}-a`, `${name} Yöneticisi`)], ...over,
  };
}

const DEMIR = firm("f1", "Demir Hukuk", {
  admins: [admin("a1", "Ayşe Demir"), admin("p1", "Bekleyen Kişi", { status: "pending" })],
});
const KAYA = firm("f2", "Kaya Hukuk");

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listPlatformFirms.mockResolvedValue([DEMIR, KAYA]);
});

describe("PlatformView", () => {
  it("lists the firms with status, user count and pending invites", async () => {
    render(<PlatformView />);

    const table = await screen.findByRole("table");
    for (const header of ["Büro", "Durum", "Aktif kullanıcı", "Yöneticiler", "Oluşturulma"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const row = within(table).getByRole("button", { name: "Demir Hukuk" }).closest("tr")!;
    expect(row).toHaveTextContent("Aktif");
    expect(row).toHaveTextContent("3");
    expect(row).toHaveTextContent("Bekleyen Kişi");
    expect(row).toHaveTextContent("Davet bekliyor");
  });

  it("shows an empty-state hint when there are no firms", async () => {
    api.listPlatformFirms.mockResolvedValue([]);
    render(<PlatformView />);
    expect(await screen.findByText(/Henüz büro yok/)).toBeInTheDocument();
  });

  it("creates a firm with its first admin", async () => {
    const created = firm("f3", "Yıldız Hukuk", { active_user_count: 0, admins: [admin("y1", "Selin Yıldız", { status: "pending" })] });
    api.createPlatformFirm.mockResolvedValue({ firm: created, admin: created.admins[0], email_sent: true });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.type(within(dialog).getByLabelText("Büro adı *"), "Yıldız Hukuk");
    await userEvent.type(within(dialog).getByLabelText("Yönetici adı soyadı *"), "Selin Yıldız");
    await userEvent.type(within(dialog).getByLabelText("Yönetici e-postası *"), "selin@yildiz.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(api.createPlatformFirm).toHaveBeenCalledWith({
      name: "Yıldız Hukuk", admin_full_name: "Selin Yıldız", admin_email: "selin@yildiz.test",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Büro oluşturuldu, davet gönderildi.");
    expect(screen.getByRole("button", { name: "Yıldız Hukuk" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns when the invite e-mail could not be sent", async () => {
    const created = firm("f3", "Yıldız Hukuk");
    api.createPlatformFirm.mockResolvedValue({ firm: created, admin: created.admins[0], email_sent: false });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.type(within(dialog).getByLabelText("Büro adı *"), "Yıldız Hukuk");
    await userEvent.type(within(dialog).getByLabelText("Yönetici adı soyadı *"), "Selin Yıldız");
    await userEvent.type(within(dialog).getByLabelText("Yönetici e-postası *"), "selin@yildiz.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Davet e-postası gönderilemedi");
  });

  it("keeps the form open with the server's message", async () => {
    api.createPlatformFirm.mockRejectedValue(new ApiError("Bu adla bir büro zaten var.", 409));
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.type(within(dialog).getByLabelText("Büro adı *"), "Demir Hukuk");
    await userEvent.type(within(dialog).getByLabelText("Yönetici adı soyadı *"), "Ali Demir");
    await userEvent.type(within(dialog).getByLabelText("Yönetici e-postası *"), "ali@demir.test");
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Bu adla bir büro zaten var.");
  });

  it("checks the form before sending", async () => {
    render(<PlatformView />);
    await userEvent.click(await screen.findByRole("button", { name: "Yeni büro" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni büro" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Büroyu oluştur" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Büro adı boş olamaz.");
    expect(api.createPlatformFirm).not.toHaveBeenCalled();
  });

  it("re-sends a pending admin's invite from the firm panel", async () => {
    api.resendPlatformAdminInvite.mockResolvedValue({ admin: DEMIR.admins[1], email_sent: true });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Demir Hukuk" }));
    const panel = screen.getByRole("dialog", { name: "Demir Hukuk" });
    expect(within(panel).queryByRole("button", { name: "Daveti yeniden gönder, Ayşe Demir" })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Daveti yeniden gönder, Bekleyen Kişi" }));

    expect(api.resendPlatformAdminInvite).toHaveBeenCalledWith("f1", "p1");
    expect(await within(panel).findByRole("status")).toHaveTextContent("Davet gönderildi.");
  });

  it("suspends a firm after confirmation", async () => {
    api.suspendPlatformFirm.mockResolvedValue({ ...KAYA, is_active: false, suspended_at: "2026-10-23T20:00:00" });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Kaya Hukuk" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Kaya Hukuk" })).getByRole("button", { name: "Büroyu askıya al" }));
    const confirm = screen.getByRole("dialog", { name: "Büroyu askıya al" });
    expect(confirm).toHaveTextContent("Veriler silinmez");
    await userEvent.click(within(confirm).getByRole("button", { name: "Askıya al" }));

    expect(api.suspendPlatformFirm).toHaveBeenCalledWith("f2");
    const panel = await screen.findByRole("dialog", { name: "Kaya Hukuk" });
    expect(within(panel).getByRole("status")).toHaveTextContent("Büro askıya alındı.");
    expect(within(panel).getByRole("button", { name: "Büroyu aktifleştir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaya Hukuk" }).closest("tr")).toHaveTextContent("Askıda");
  });

  it("adds an admin to a suspended firm and says the invite waits", async () => {
    const suspended = { ...KAYA, is_active: false, suspended_at: "2026-10-23T20:00:00" };
    api.listPlatformFirms.mockResolvedValue([suspended]);
    api.addPlatformFirmAdmin.mockResolvedValue({ admin: admin("n1", "Yeni Yönetici", { status: "pending" }), email_sent: false });
    render(<PlatformView />);

    await userEvent.click(await screen.findByRole("button", { name: "Kaya Hukuk" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Kaya Hukuk" })).getByRole("button", { name: "Yönetici ekle" }));
    const form = screen.getByRole("dialog", { name: "Yönetici ekle — Kaya Hukuk" });
    await userEvent.type(within(form).getByLabelText("Ad soyad *"), "Yeni Yönetici");
    await userEvent.type(within(form).getByLabelText("E-posta *"), "yeni@kaya.test");
    await userEvent.click(within(form).getByRole("button", { name: "Ekle" }));

    expect(api.addPlatformFirmAdmin).toHaveBeenCalledWith("f2", { full_name: "Yeni Yönetici", email: "yeni@kaya.test" });
    const panel = await screen.findByRole("dialog", { name: "Kaya Hukuk" });
    expect(within(panel).getByRole("alert")).toHaveTextContent("Büro askıda olduğu için davet e-postası gönderilmedi");
    expect(within(panel).getByText("Yeni Yönetici")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    api.listPlatformFirms.mockRejectedValue(new Error("network"));
    render(<PlatformView />);
    expect(await screen.findByText("Bürolar yüklenemedi. Lütfen daha sonra tekrar deneyin.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/PlatformView.test.tsx`
Expected: FAIL. The module `@/components/platform/PlatformView` is not found.

- [ ] **Step 3: Write `NoticeLine`**

`frontend/src/components/platform/NoticeLine.tsx`:

```tsx
export type Notice = { tone: "ok" | "warn" | "error"; text: string };

const TONES = { ok: "text-emerald-700", warn: "text-amber-700", error: "text-red-700" } as const;

/** One-line outcome of the last action: a status for success, an alert otherwise. */
export function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p role={notice.tone === "ok" ? "status" : "alert"} className={`mb-3 text-sm ${TONES[notice.tone]}`}>
      {notice.text}
    </p>
  );
}
```

- [ ] **Step 4: Write `FirmFormModal`**

`frontend/src/components/platform/FirmFormModal.tsx`:

```tsx
"use client";

import { useRef, useState, type FormEvent } from "react";

import { ModalFrame } from "@/components/ModalFrame";
import { addPlatformFirmAdmin, createPlatformFirm } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { PlatformAdminInvite, PlatformFirm, PlatformFirmCreated } from "@/types";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";
const LABEL = "text-xs font-medium text-navy-600";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FirmSaved =
  | { kind: "firm"; created: PlatformFirmCreated }
  | { kind: "admin"; firmId: string; invite: PlatformAdminInvite };

/** Without `firm`: a new firm and its first admin. With `firm`: one more admin for it. */
export function FirmFormModal({
  firm,
  onClose,
  onSaved,
}: {
  firm?: PlatformFirm;
  onClose: () => void;
  onSaved: (result: FirmSaved) => void;
}) {
  const [firmName, setFirmName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const name = firmName.trim();
    const person = fullName.trim();
    const address = email.trim();
    if (!firm && !name) return setError("Büro adı boş olamaz.");
    if (!person) return setError("Ad soyad boş olamaz.");
    if (!address) return setError("E-posta adresi gerekli.");
    if (!EMAIL_SHAPE.test(address)) return setError("Geçerli bir e-posta adresi girin.");
    setError(null);

    inFlight.current = true;
    setSaving(true);
    try {
      if (firm) {
        const invite = await addPlatformFirmAdmin(firm.id, { full_name: person, email: address });
        onSaved({ kind: "admin", firmId: firm.id, invite });
      } else {
        const created = await createPlatformFirm({ name, admin_full_name: person, admin_email: address });
        onSaved({ kind: "firm", created });
      }
    } catch (err) {
      setError(userMessage(err, firm ? "Yönetici eklenemedi. Lütfen tekrar deneyin." : "Büro oluşturulamadı. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={firm ? `Yönetici ekle — ${firm.name}` : "Yeni büro"} onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {!firm && (
          <label className="block">
            <span className={LABEL}>Büro adı *</span>
            <input className={INPUT} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className={LABEL}>{firm ? "Ad soyad *" : "Yönetici adı soyadı *"}</span>
          <input className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>{firm ? "E-posta *" : "Yönetici e-postası *"}</span>
          <input type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <p className="text-xs text-navy-500">Yönetici, e-postayla gelen bağlantıdan kendi şifresini belirler.</p>
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
            {saving ? "Kaydediliyor..." : firm ? "Ekle" : "Büroyu oluştur"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
```

- [ ] **Step 5: Write `FirmDetailModal`**

`frontend/src/components/platform/FirmDetailModal.tsx`:

```tsx
"use client";

import { ModalFrame } from "@/components/ModalFrame";
import { NoticeLine, type Notice } from "@/components/platform/NoticeLine";
import type { PlatformAdmin, PlatformFirm, UserStatus } from "@/types";

const STATUS_LABELS: Record<UserStatus, string> = { active: "Aktif", pending: "Davet bekliyor", inactive: "Pasif" };
const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  inactive: "bg-surface-muted text-navy-500",
};
const SECONDARY =
  "rounded-xl border border-surface-border px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60";

/** One firm: its administrators and the platform actions on it. */
export function FirmDetailModal({
  firm,
  notice,
  busy,
  onClose,
  onResend,
  onAddAdmin,
  onToggle,
}: {
  firm: PlatformFirm;
  notice: Notice | null;
  busy: boolean;
  onClose: () => void;
  onResend: (admin: PlatformAdmin) => void;
  onAddAdmin: () => void;
  onToggle: () => void;
}) {
  return (
    <ModalFrame title={firm.name} onClose={onClose} busy={busy} wide>
      <p className="mb-3 text-sm text-navy-600">
        Durum: {firm.is_active ? "Aktif" : "Askıda"} · Aktif kullanıcı: {firm.active_user_count}
      </p>
      {notice && <NoticeLine notice={notice} />}

      <h3 className="mb-2 text-sm font-medium text-navy-700">Yöneticiler</h3>
      <ul className="divide-y divide-surface-border">
        {firm.admins.map((admin) => (
          <li key={admin.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-navy-800">{admin.full_name}</p>
              <p className="truncate text-navy-500">{admin.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[admin.status]}`}>{STATUS_LABELS[admin.status]}</span>
              {admin.status === "pending" && firm.is_active && (
                <button
                  type="button"
                  aria-disabled={busy}
                  aria-label={`Daveti yeniden gönder, ${admin.full_name}`}
                  onClick={() => !busy && onResend(admin)}
                  className={SECONDARY}
                >
                  Daveti yeniden gönder
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-disabled={busy}
          onClick={() => !busy && onToggle()}
          className={
            firm.is_active
              ? "rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              : "rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          }
        >
          {firm.is_active ? "Büroyu askıya al" : "Büroyu aktifleştir"}
        </button>
        <div className="flex gap-2">
          <button type="button" aria-disabled={busy} onClick={() => !busy && onAddAdmin()} className={SECONDARY}>
            Yönetici ekle
          </button>
          <button type="button" aria-disabled={busy} onClick={() => !busy && onClose()} className={SECONDARY}>
            Kapat
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
```

- [ ] **Step 6: Write `PlatformView` and the page**

`frontend/src/components/platform/PlatformView.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { FirmDetailModal } from "@/components/platform/FirmDetailModal";
import { FirmFormModal, type FirmSaved } from "@/components/platform/FirmFormModal";
import { NoticeLine, type Notice } from "@/components/platform/NoticeLine";
import { activatePlatformFirm, listPlatformFirms, resendPlatformAdminInvite, suspendPlatformFirm } from "@/lib/api";
import { userMessage } from "@/lib/userMessages";
import type { PlatformAdmin, PlatformFirm } from "@/types";

const INVITE_FAILED = "Davet e-postası gönderilemedi; daveti yeniden gönderebilirsiniz.";
const SUSPENDED_ADD =
  "Yönetici eklendi. Büro askıda olduğu için davet e-postası gönderilmedi; büroyu aktifleştirdikten sonra daveti gönderin.";

type Dialog =
  | { kind: "create" }
  | { kind: "detail"; firmId: string }
  | { kind: "add-admin"; firmId: string }
  | { kind: "confirm"; firmId: string; suspend: boolean };

function byName(a: PlatformFirm, b: PlatformFirm) {
  return a.name.localeCompare(b.name, "tr");
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("tr-TR") : "—";
}

/** The CaseBridge team's list of customer firms (/platform). */
export function PlatformView() {
  const [firms, setFirms] = useState<PlatformFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    listPlatformFirms()
      .then((result) => active && setFirms([...result].sort(byName)))
      .catch((err) => active && setLoadError(userMessage(err, "Bürolar yüklenemedi. Lütfen daha sonra tekrar deneyin.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function putFirm(next: PlatformFirm) {
    setFirms((prev) => [...prev.filter((item) => item.id !== next.id), next].sort(byName));
  }

  function putAdmin(firmId: string, admin: PlatformAdmin) {
    setFirms((prev) =>
      prev.map((item) => {
        if (item.id !== firmId) return item;
        const known = item.admins.some((a) => a.id === admin.id);
        return { ...item, admins: known ? item.admins.map((a) => (a.id === admin.id ? admin : a)) : [...item.admins, admin] };
      }),
    );
  }

  function openDetail(firmId: string) {
    setNotice(null);
    setDialog({ kind: "detail", firmId });
  }

  function saved(result: FirmSaved) {
    if (result.kind === "firm") {
      putFirm(result.created.firm);
      setDialog(null);
      setNotice(result.created.email_sent ? { tone: "ok", text: "Büro oluşturuldu, davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
      return;
    }
    const target = firms.find((item) => item.id === result.firmId);
    putAdmin(result.firmId, result.invite.admin);
    setDialog({ kind: "detail", firmId: result.firmId });
    setNotice(
      result.invite.email_sent
        ? { tone: "ok", text: "Yönetici eklendi, davet gönderildi." }
        : { tone: "warn", text: target && !target.is_active ? SUSPENDED_ADD : INVITE_FAILED },
    );
  }

  async function resend(firmId: string, admin: PlatformAdmin) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await resendPlatformAdminInvite(firmId, admin.id);
      putAdmin(firmId, result.admin);
      setNotice(result.email_sent ? { tone: "ok", text: "Davet gönderildi." } : { tone: "warn", text: INVITE_FAILED });
    } catch (err) {
      setNotice({ tone: "error", text: userMessage(err, "Davet gönderilemedi. Lütfen tekrar deneyin.") });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function changeStatus(firmId: string, suspend: boolean) {
    const next = suspend ? await suspendPlatformFirm(firmId) : await activatePlatformFirm(firmId);
    putFirm(next);
    setDialog({ kind: "detail", firmId });
    setNotice({ tone: "ok", text: suspend ? "Büro askıya alındı." : "Büro aktifleştirildi." });
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const current = dialog && dialog.kind !== "create" ? firms.find((item) => item.id === dialog.firmId) : undefined;
  const confirm = dialog?.kind === "confirm" ? dialog : null;

  return (
    <section aria-labelledby="platform-firms" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h1 id="platform-firms" className="text-base font-semibold text-navy-900">
          Bürolar
        </h1>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setDialog({ kind: "create" });
          }}
          className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white"
        >
          Yeni büro
        </button>
      </div>

      {notice && !dialog && <NoticeLine notice={notice} />}

      {firms.length === 0 ? (
        <p className="text-sm text-navy-500">Henüz büro yok. &quot;Yeni büro&quot; ile ilk büroyu açın.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs text-navy-500">
                <th className="py-2 pr-3 font-medium">Büro</th>
                <th className="py-2 pr-3 font-medium">Durum</th>
                <th className="py-2 pr-3 font-medium">Aktif kullanıcı</th>
                <th className="py-2 pr-3 font-medium">Yöneticiler</th>
                <th className="py-2 font-medium">Oluşturulma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {firms.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3">
                    <button type="button" onClick={() => openDetail(item.id)} className="font-medium text-navy-800 hover:underline">
                      {item.name}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                    >
                      {item.is_active ? "Aktif" : "Askıda"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-navy-600">{item.active_user_count}</td>
                  <td className="py-2 pr-3 text-navy-600">
                    {item.admins.map((admin) => (
                      <span key={admin.id} className="mr-3 inline-flex items-center gap-1">
                        {admin.full_name}
                        {admin.status === "pending" && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Davet bekliyor</span>
                        )}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 text-navy-600">{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" && <FirmFormModal onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "add-admin" && current && (
        <FirmFormModal firm={current} onClose={() => setDialog({ kind: "detail", firmId: current.id })} onSaved={saved} />
      )}
      {dialog?.kind === "detail" && current && (
        <FirmDetailModal
          firm={current}
          notice={notice}
          busy={busy}
          onClose={() => {
            setNotice(null);
            setDialog(null);
          }}
          onResend={(admin) => void resend(current.id, admin)}
          onAddAdmin={() => {
            setNotice(null);
            setDialog({ kind: "add-admin", firmId: current.id });
          }}
          onToggle={() => {
            setNotice(null);
            setDialog({ kind: "confirm", firmId: current.id, suspend: current.is_active });
          }}
        />
      )}
      {confirm && current && (
        <CaseConfirmModal
          title={confirm.suspend ? "Büroyu askıya al" : "Büroyu aktifleştir"}
          message={
            confirm.suspend
              ? `${current.name} bürosunun hiçbir kullanıcısı giriş yapamayacak ve açık oturumlar kapanacak. Veriler silinmez; büroyu daha sonra yeniden aktifleştirebilirsiniz.`
              : `${current.name} bürosunun kullanıcıları yeniden giriş yapabilecek.`
          }
          confirmLabel={confirm.suspend ? "Askıya al" : "Aktifleştir"}
          fallbackError="İşlem tamamlanamadı. Lütfen tekrar deneyin."
          onConfirm={() => changeStatus(current.id, confirm.suspend)}
          onClose={() => setDialog({ kind: "detail", firmId: current.id })}
        />
      )}
    </section>
  );
}
```

`frontend/src/app/platform/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { PlatformView } from "@/components/platform/PlatformView";

export default function PlatformPage() {
  return (
    <AppShell platform>
      <PlatformView />
    </AppShell>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/__tests__/PlatformView.test.tsx`
Expected: PASS.

Then run `npx tsc --noEmit && npx vitest run` (about two minutes).
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/platform frontend/src/app/platform/page.tsx frontend/src/components/__tests__/PlatformView.test.tsx
git commit -m "feat: platform panel page for firms, firm admins and suspension"
```

---

### Task 8: End-to-end flow and final verification

**Files:**
- Create: `tests/e2e/specs/14-platform-firms.spec.ts`
- Modify: `tests/e2e/specs/helpers.ts`

**Interfaces:**
- Consumes:
  - The demo platform account from Task 5.
  - The `/platform` UI from Task 7.
  - The suspension redirect from Task 6.
  - `newestPasswordLink`, `login`.

- [ ] **Step 1: Update the helpers**

`tests/e2e/specs/helpers.ts`:
- After `DEMO_LAWYER`, add:

```ts
export const DEMO_PLATFORM = { email: "platform@demo.casebridge.dev", password: "demo1234" };
```

- In `login`, replace the comment and the URL check with:

```ts
  // Platform admins land on /platform, firm admins on /admin, lawyers on /dashboard.
  await expect(page).toHaveURL(/\/(dashboard|admin|platform)(\/|$|\?)/);
```

- [ ] **Step 2: Write the spec**

`tests/e2e/specs/14-platform-firms.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { DEMO_PLATFORM, login, newestPasswordLink } from "./helpers";

// Flow 14: the CaseBridge team opens a firm in the platform panel, the firm's
// first administrator sets a password from the e-mailed link and lands in the
// admin panel; the team suspends the firm, the open session ends with the
// suspension notice and a new sign-in is refused.

const STAMP = Date.now();
const FIRM = `E2E Hukuk ${STAMP}`;
const ADMIN_NAME = `Büro Yöneticisi ${STAMP}`;
const ADMIN_EMAIL = `yonetici.${STAMP}@e2e.casebridge.dev`;
const PASSWORD = "Yeni-Sifre-2026";
const SUSPENDED = "Büronuzun erişimi askıya alındı.";

test("open a firm, its admin signs in, then the firm is suspended", async ({ page, browser }) => {
  await login(page, DEMO_PLATFORM);
  await expect(page).toHaveURL(/\/platform/);
  await expect(page.getByRole("link", { name: /Davalar/ })).toHaveCount(0);

  // 1. Open the firm with its first administrator.
  await page.getByRole("button", { name: "Yeni büro" }).click();
  const form = page.getByRole("dialog", { name: "Yeni büro" });
  await form.getByLabel("Büro adı *").fill(FIRM);
  await form.getByLabel("Yönetici adı soyadı *").fill(ADMIN_NAME);
  await form.getByLabel("Yönetici e-postası *").fill(ADMIN_EMAIL);
  await form.getByRole("button", { name: "Büroyu oluştur" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Büro oluşturuldu, davet gönderildi." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: FIRM })).toContainText("Davet bekliyor");

  // 2. The administrator sets a password from the e-mailed link.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto(await newestPasswordLink(ADMIN_EMAIL));
  await expect(adminPage.getByText(`Merhaba ${ADMIN_NAME}`)).toBeVisible();
  await adminPage.getByLabel("Yeni şifre", { exact: true }).fill(PASSWORD);
  await adminPage.getByLabel("Yeni şifre (tekrar)").fill(PASSWORD);
  await adminPage.getByRole("button", { name: "Şifreyi belirle" }).click();
  await expect(adminPage).toHaveURL(/\/admin/);

  // 3. The platform team suspends the firm.
  await page.reload();
  await page.getByRole("button", { name: FIRM }).click();
  await page.getByRole("dialog", { name: FIRM }).getByRole("button", { name: "Büroyu askıya al" }).click();
  await page.getByRole("dialog", { name: "Büroyu askıya al" }).getByRole("button", { name: "Askıya al" }).click();
  await expect(page.getByRole("dialog", { name: FIRM }).getByRole("status")).toHaveText("Büro askıya alındı.");
  await expect(page.getByRole("row").filter({ hasText: FIRM })).toContainText("Askıda");

  // 4. The administrator's open session ends with the notice ...
  await adminPage.goto("/dashboard");
  await expect(adminPage).toHaveURL(/\/login\?askida=1/);
  await expect(adminPage.getByRole("alert")).toHaveText(SUSPENDED);

  // ... and signing in again is refused.
  await adminPage.getByLabel(/e-posta/i).fill(ADMIN_EMAIL);
  await adminPage.getByLabel(/şifre/i).fill(PASSWORD);
  await adminPage.getByRole("button", { name: /giriş/i }).click();
  await expect(adminPage.getByRole("alert")).toHaveText(SUSPENDED);
  await adminContext.close();
});
```

- [ ] **Step 3: Run the new spec and the user-management spec**

Run (from `tests/e2e/`): `npx playwright test specs/14-platform-firms.spec.ts specs/10-user-management.spec.ts`
Expected: 2 passed.

- [ ] **Step 4: Run every suite once**

Each must pass before committing:
- Backend, from `backend/`: `.venv/bin/python -m pytest -q`
- Frontend, from `frontend/`: `npx tsc --noEmit && npx vitest run && npm run build`
- E2E, from `tests/e2e/`: `npx playwright test`

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/14-platform-firms.spec.ts tests/e2e/specs/helpers.ts
git commit -m "test: e2e platform firm onboarding and suspension"
```
