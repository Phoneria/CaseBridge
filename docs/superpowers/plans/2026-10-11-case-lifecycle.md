# Dava Yaşam Döngüsü (Düzenle, Kapat, Arşivle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the responsible lawyer (and administrators) correct a case's basic information, close it with an outcome, decision date, note and an optional decision document, reopen it, archive it and bring it back from the archive, so that the dashboard's win rate, the analytics and the by-lawyer charts finally count real results.

**Architecture:** Backend: `cases` gains `decision_date` / `closing_note`; a new module `app/api/case_access.py` holds the permission rule (responsible lawyer or admin) and the archived-case guard; a new `CaseLifecycleService` implements close / reopen / archive / unarchive and the PATCH restrictions; four new routes (`POST /cases/{id}/close|reopen|archive|unarchive`) call it, `PATCH /cases/{id}` can no longer close, set an outcome or reopen, and every write that touches an archived case (events, tasks, documents, linked calendar events) answers 409. Frontend: an `İşlemler` menu on the case page opens an edit dialog (the shared case-form fields, case number read-only), a close dialog (outcome, decision date, note, decision document) and two confirmation dialogs; closed cases get a decision card, archived cases an archive banner and no add/edit controls; the case list gets an `Arşivi göster` switch and an `Arşivli` badge; every `Uzlaşma` label becomes `Sulh`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (`batch_alter_table` for SQLite), pydantic v2, pytest; Next.js 14 (app router), React 18, Tailwind, Vitest + Testing Library + user-event; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-case-lifecycle-design.md`

## Global Constraints

Every task's requirements include this section.

**Process**

- Work on branch `feature/case-lifecycle` (already checked out; do not switch branches, do not push, never use `git stash`). One commit per task. Every commit message ends with a blank line and then exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY`
- Always `git add` explicit paths, never `git add .` or `git add ..` (`backend/.venv`, `frontend/node_modules` and `tests/e2e/node_modules` may be symlinks and must never be committed).
- No new Python packages and no new npm packages.
- Backend commands run from `backend/` (`.venv/bin/python -m pytest ...`), frontend commands from `frontend/` (`npx vitest run ...`, `npx tsc --noEmit`, `npm run build`), E2E from `tests/e2e/` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` when a pinned Chromium is needed. The full backend suite takes about ten minutes (bcrypt-slow logins): run it with a generous timeout (`timeout: 600000` in a tool call) or in the background.

**Project rules (code review checks every one)**

- **Only `ApiError` messages are shown to users.** Anything else (a thrown `Error`, a network failure) is replaced by a Turkish fallback sentence. The helper is `userMessage(error, fallback)` in `frontend/src/lib/userMessages.ts` (already in the repository); never render `error.message` of a plain `Error`.
- **A button the user just clicked uses `aria-disabled` plus a guard, never `disabled`.** The click handler returns early while a request is in flight (an `inFlight` ref), so a second click does nothing and focus is not lost.
- **No ref reads inside React state updaters.** A functional `setState(prev => ...)` must be pure; read refs before calling it.
- **No stale state reads after an `await`.** After an await use the awaited value or a functional update, never a state variable captured before the await.
- **Modals use the existing `ModalFrame`** (`role="dialog"`, `aria-modal`, focus moves in on open and back to the opener on close, Escape/Vazgeç locked while saving).
- **Every case query is firm-scoped.** A case, task, document or calendar event of another firm answers 404 (never 403, never 409, never a different message), also from the archived guard.
- **Check order of every lifecycle route: 404 (firm-scoped lookup), then 403 (permission), then 409 (archived), then 422 and the other state rules.** A lawyer who may not manage a case never learns whether it is archived or closed.
- **Turkish UI and API copy is used exactly as written in this plan** (copied from the spec; strings the spec does not word are fixed in the code blocks below).

**Data model**

- `cases.decision_date` (Date, nullable) and `cases.closing_note` (Text, nullable); Alembic revision `e6c1b9a4d2f8` (down revision `d5b2f8a1c3e6`, the head before this work). Existing closed cases keep both `NULL` (the UI shows `—`). `CaseOut` and `CaseDetailOut` return both.
- Open statuses: `devam_eden`, `durusma_bekleyen`, `karar_bekleyen`. `kapali` is reached only through `POST /cases/{id}/close` and left only through `POST /cases/{id}/reopen`. `outcome` is `ongoing` while the case is open and `won` | `lost` | `settled` once closed. Archiving requires a closed case; a legacy row that is archived but still open (the old endpoint allowed it) can still be unarchived and archive on it is a no-op.
- "Today" is `app.core.timeutil.local_today()` (`APP_TIMEZONE`, default `Europe/Istanbul`), the same clock the calendar and the reminders use. The route passes it into the service, so tests patch one name.

**API (all firm-scoped)**

- `POST /cases/{id}/close` `{outcome: "won"|"lost"|"settled", decision_date: date, note?: str}` → updated case. Note: trimmed, at most 4000 characters (422 above), blank becomes `null`. Errors: 409 `Dava zaten kapalı.`; 422 `Karar tarihi ileri bir tarih olamaz.` when `decision_date` is after today. Writes `status=kapali`, `outcome`, `decision_date`, `closing_note` and a timeline event (`event_date` = decision date, title `Dava kapatıldı — <Kazanıldı|Kaybedildi|Sulh>`, description = note, type `other`, `created_by` = the user) in one commit.
- `POST /cases/{id}/reopen` → updated case. 409 `Dava zaten açık.`. Writes `status=devam_eden`, `outcome=ongoing`, clears `decision_date` / `closing_note`, adds the event `Dava yeniden açıldı` dated today (type `other`). The closing event stays.
- `POST /cases/{id}/archive` → updated case; 409 `Yalnızca kapalı davalar arşivlenebilir.` when not closed; already archived → unchanged answer (idempotent). `POST /cases/{id}/unarchive` → `is_archived=false` (idempotent). Neither is blocked by the archived guard.
- `PATCH /cases/{id}`: 422 `Davayı kapatmak için 'Davayı kapat' işlemini kullanın.` for `status=kapali`; 422 `Sonuç yalnızca dava kapatılırken girilebilir.` when `outcome` is present at all; 422 `Kapalı davayı açmak için 'Yeniden aç' işlemini kullanın.` when `status` is sent for a closed case. `case_name`, `case_type`, `status`, `opening_date` cannot be set to `null`; `case_name` 1–255 characters (trimmed), `court` at most 255, `case_value` not negative; `opening_date` becomes editable.
- Permission (`PATCH`, close, reopen, archive, unarchive): 403 `Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.` unless the user is an admin or `assigned_lawyer_id == user.id`. A case without a responsible lawyer can be changed by an admin only.
- Archived guard: 409 `Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.` — see Decision 3 for the exact list of endpoints.
- Reads, downloads and unarchive stay open on an archived case.

**UI strings (exact)**

- Menu `İşlemler`: `Bilgileri düzenle`, `Davayı kapat`, `Yeniden aç`, `Arşivle`, `Arşivden çıkar` (open case: edit + close; closed, not archived: edit + reopen + archive; archived: unarchive only; nobody else sees the menu).
- Edit dialog `Bilgileri düzenle`: `Dava no` (read-only), `Dava adı`, `Dava türü`, `Mahkeme`, `Esas no`, `Dava tarihi`, `Dava değeri`, `Durum` (open statuses only, not shown for a closed case); `Kaydet`, `Kaydediliyor...`, `Vazgeç`; validation `Dava adı gerekli.`, `Dava tarihi gerekli.`, `Dava değeri geçerli bir sayı olmalı.`; fallback `Dava bilgileri kaydedilemedi. Lütfen tekrar deneyin.`
- Close dialog `Davayı kapat`: `Sonuç` (`Kazanıldı` / `Kaybedildi` / `Sulh`), `Karar tarihi`, `Karar notu`, `Karar belgesi ekle`, warning `Bu davada <n> bekleyen görev var.`, buttons `Davayı kapat` / `Kapatılıyor...` / `Vazgeç`; validation `Sonuç seçin.`, `Karar tarihi gerekli.`, `Karar tarihi ileri bir tarih olamaz.`, `En fazla 4000 karakter olabilir.`; fallback `Dava kapatılamadı. Lütfen tekrar deneyin.`; upload failure notice `Dava kapatıldı ancak karar belgesi yüklenemedi.`
- Confirmations: `Dava yeniden açılsın mı?` / `Sonuç ve karar bilgisi temizlenecek; kapanış kaydı zaman çizelgesinde kalır.` / `Yeniden aç` (fallback `Dava yeniden açılamadı. Lütfen tekrar deneyin.`); `Dava arşivlensin mi?` / `Arşivli dava salt okunur olur.` / `Arşivle` (fallback `Dava arşivlenemedi. Lütfen tekrar deneyin.`); busy label `Lütfen bekleyin...`; unarchive fallback `Dava arşivden çıkarılamadı. Lütfen tekrar deneyin.`
- Page: badge group `Dava durumu` (status badge, plus an outcome badge on a closed case: `Kazanıldı` green, `Kaybedildi` red, `Sulh` slate), decision card `Karar bilgisi` (`Sonuç`, `Karar tarihi`, `Karar notu`, `—` for what is missing), archive banner `Bu dava arşivlendi; salt okunur.` with `Arşivden çıkar` for those who may manage the case.
- List: checkbox `Arşivi göster` (URL parameter `arsiv=dahil`), badge `Arşivli`. Labels everywhere: `Kazanıldı`, `Kaybedildi`, `Sulh`, `Devam ediyor`; the URL slug `sulh` is unchanged.

**Out of scope:** entering the hearing date from the case page and syncing it with the calendar (separate work), more outcome types, clearing `next_hearing_date` when a case is closed, computing `average_case_duration_days` from `decision_date` (spec §7: the analytics code is unchanged), a list column for the outcome.

---


## Decisions made while planning

The spec leaves these open; the plan fixes them. Each one was built and verified in a scratch worktree (backend suite, frontend suite, `tsc`, `npm run build`, Playwright) before being written down here.

1. **Task order keeps every commit green.** The new endpoints (Task 2) come before the PATCH restrictions (Task 3), so no commit leaves the application without a way to close a case. Task 3 is the one that breaks old fixtures (they PATCHed `status=kapali` / `outcome`); it migrates them in the same commit (Decision 7).
2. **Where the permission check lives.** One module, `backend/app/api/case_access.py`: `can_manage_case(user, case)` (admin, or `assigned_lawyer_id` set and equal to `user.id`), `require_case_manager(user, case)` (403) and the archived guards (Decision 3). It is called from the route functions, not from a service, because the service layer has no notion of the current user's role. Routes use `_managed_case(db, case_id, user)` in `routes/cases.py`: firm-scoped lookup (404) then `require_case_manager` (403). The order everywhere is 404, 403, 409, 422 (Global Constraints), so a lawyer without permission cannot probe a case's state. The existing "a lawyer cannot reassign `assigned_lawyer_id` to somebody else" 403 in PATCH keeps running first.
3. **Where the archived guard lives and what it covers.** Also in `case_access.py`: `require_case_writable(case)` (409 when `case.is_archived`) for routes that already hold the case, and `require_case_id_writable(db, case_id, law_firm_id)` for routes that only hold a `case_id` (it looks the case up firm-scoped; `None` or a case of another firm does nothing, so the endpoint's own 404 stands). Guarded write endpoints, and nothing else:
   - `PATCH /cases/{id}`, `POST /cases/{id}/close`, `POST /cases/{id}/reopen`, `POST /cases/{id}/events`;
   - `POST /cases/{id}/tasks`, `PATCH /cases/{id}/tasks/{task_id}` and the global `PATCH /tasks/{task_id}`;
   - `POST /cases/{id}/documents` (the check runs before the upload is read into memory) and `DELETE /documents/{id}`;
   - `POST`, `PATCH` and `DELETE` on `/calendar/events` when the event is, or would become, linked to an archived case (`PATCH` checks the existing and the new `case_id`).
4. **Deliberately not guarded.** Archive and unarchive (idempotent by design, and unarchive is the way out); simulations, courtroom sessions, chat and the hand-over report (they write only their own AI records, never the case); the admin `PATCH /admin/cases/{id}/lawyer` (an ownership change by an administrator); every `GET` and document download.
5. **"Today" for the decision date** is `local_today()` (`APP_TIMEZONE`, default `Europe/Istanbul`), the clock of the calendar and the reminders. Routes call it and pass the date into `CaseLifecycleService.close/reopen`; tests patch `app.api.routes.cases.local_today`. The browser form defaults to the browser's local date (`todayLocalISO()`, not the UTC date); the server stays the authority and its 422 message is shown.
6. **How the frontend gets `me`.** `CaseDetailView` calls the existing `getMe()` (`GET /users/me`) in its own effect with an `active` flag. A failed lookup leaves `me` empty: the page still loads and simply shows no actions (the backend remains the authority). The menu rule is the pure function `caseActions(me, case)` in `frontend/src/lib/caseAccess.ts`.
7. **Existing tests and E2E that PATCH `status` / `outcome`.** Backend fixtures that closed a case with `PATCH {"status": "kapali", "outcome": ...}` now use a new `close_case` fixture in `backend/tests/conftest.py` (a real `POST /close`, which also writes the timeline event): `test_cases.py`, `test_analytics.py` (4 tests), `test_reports.py` (2), `test_institutional_memory.py`; `test_case_parties.py` used `status: "kapali"` only as an arbitrary value and now uses `karar_bekleyen`. The E2E specs 01–10 contain no PATCH of status or outcome; seed and importer write through the model and are unaffected.
8. **Archived cases and calendar hearing sync.** An archived case blocks the calendar writes listed in Decision 3, so the sync that copies a hearing event into `next_hearing_date` can never change an archived case. The cost: a calendar event that is linked to an archived case cannot be edited or deleted until the case is unarchived (its drawer shows the server's 409 message).
9. **`POST /cases` is left permissive** for `status=kapali` (API back-compat for integrations); only the new-case form changed: it now offers the three open statuses.
10. **PATCH 422 messages are plain strings.** The three PATCH rules raise `HTTPException(422, "<Turkish text>")`, so the client's `ApiError` shows them; pydantic's own validation errors have a list `detail`, for which the client falls back to its own sentence. `outcome` therefore stays in `CaseUpdate` (so its presence can be detected and answered with the Turkish message) instead of being removed.
11. **`CaseUpdate` hardening.** The edit dialog needs `opening_date` and sends explicit `null` for emptied optional fields, so `CaseUpdate` gains `opening_date`, `case_name` 1–255, `court` ≤255 (blank → `null`), `case_value ≥ 0`, and rejects an explicit `null` for `case_name`, `case_type`, `status`, `opening_date` (required columns).
12. **Legacy rows.** A case closed before this work has `outcome` possibly `ongoing` and no decision data: no outcome badge, the decision card shows `—` in all three rows. `archive` on a legacy archived-but-open row is a no-op, `unarchive` works, so such a row can be cleaned up.
13. **Closing with a decision document is two requests**, as the spec says: `closeCase`, then `uploadDocument`. If only the upload fails, the dialog closes, the page shows the case as closed and a dismissible notice `Dava kapatıldı ancak karar belgesi yüklenemedi.`; the page then reloads the case and the document list (a failed reload keeps the merged state). `PATCH`, close, reopen and archive responses carry no `timeline`, so the page merges them into the loaded case and keeps the old timeline until the reload.
14. **`ModalFrame` gains two small things:** a `wide` prop (`max-w-2xl`, for the edit dialog) and a `data-autofocus` hook (focus goes to the first element that has it, otherwise to the first control as before), because the first control of the edit dialog is the read-only case number.
15. **Who sees which edit buttons.** The Taraflar and Uyuşmazlık cards now take a required `canEdit` prop (`!archived && canManageCase(me, case)`), as the spec requires; this removes their `Düzenle` button from lawyers who are not responsible for the case (before, every lawyer of the firm saw it and PATCH accepted it). Task checkboxes of an archived case are `disabled` (static state, not a just-clicked button); `Gelişme ekle →` / `Görev ekle →` shortcuts on the overview read `Tümünü aç →` on an archived case.
16. **Other pages show the server's text.** `TasksView.handleToggle`, `CalendarEventDrawer.run` and the case page's event/task/document handlers use `userMessage(err, fallback)` so a 409 from the archived guard is readable instead of a generic sentence. The calendar form already showed `error.message`. The global Görevler page still lists tasks of archived cases (read-only is enforced by the 409); new-task and calendar case selectors use `getCases()`, which already excludes archived cases.
17. **E2E login budget.** The login endpoint allows 5 attempts per IP and e-mail per minute and the specs already log in as the demo lawyer in 01, 06, 07 (twice), 08 and 09. The new spec 11 logs in exactly once as the demo lawyer and reuses that session's token (`localStorage.casebridge_token`) for its API set-up requests. The full run needed no change to `helpers.ts`.
18. **Known failing E2E test, unrelated:** `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply` fails identically before this work (it waits for the text `Standart · mock`).

## File Map

Each task below lists its own files; this map shows what each unit is responsible for. All paths are relative to the repository root.

**Backend**

| File | Task | Responsibility |
|---|---|---|
| `backend/alembic/versions/e6c1b9a4d2f8_add_case_decision_fields.py` | 1 | `cases.decision_date`, `cases.closing_note` |
| `backend/app/models/case.py`, `backend/app/schemas/case.py` | 1, 2, 3 | columns; `CaseOut` fields; `CaseClose`; hardened `CaseUpdate` |
| `backend/app/api/case_access.py` | 2, 4 | permission rule and archived guards |
| `backend/app/services/case_lifecycle.py` | 2, 3 | close / reopen / archive / unarchive; PATCH restrictions |
| `backend/app/services/case_service.py` | 2 | loses the old `archive_case` |
| `backend/app/api/routes/cases.py` | 2, 3, 4 | the four lifecycle routes; PATCH permission and rules; event guard |
| `backend/app/api/routes/tasks.py`, `documents.py`, `calendar.py` | 4 | archived guard on the write endpoints |

**Frontend**

| File | Task | Responsibility |
|---|---|---|
| `frontend/src/types/index.ts`, `src/lib/api.ts` | 5 | types, `closeCase` / `reopenCase` / `unarchiveCase` |
| `frontend/src/lib/caseAccess.ts` | 5 | `canManageCase`, `caseActions`, menu labels |
| `frontend/src/lib/labels.ts`, `filters.ts`, `components/AnalyticsView.tsx` | 5 | `Sulh` naming, `OPEN_CASE_STATUSES` |
| `frontend/src/lib/caseIntake.ts`, `components/case-form/BasicInfoFields.tsx` | 6 | edit-form state, validation, PATCH payload; read-only case number, status list |
| `frontend/src/components/ModalFrame.tsx` | 6 | `wide`, `data-autofocus` |
| `frontend/src/components/CaseActionsMenu.tsx`, `CaseHeader.tsx`, `CaseEditModal.tsx` | 6, 8 | menu, badges and archive banner, edit dialog |
| `frontend/src/lib/closing.ts`, `components/CaseCloseModal.tsx`, `CaseConfirmModal.tsx` | 7 | close form rules and dialog, reopen/archive confirmation |
| `frontend/src/components/CaseDetailView.tsx` | 6, 7, 8 | `me`, dialogs, notices, read-only archived page |
| `frontend/src/components/CaseDecisionCard.tsx` | 8 | `Karar bilgisi` |
| `frontend/src/components/CasePartiesCard.tsx`, `CaseDisputeCard.tsx`, `CaseDocumentsPanel.tsx` | 8 | `canEdit` / `readOnly` |
| `frontend/src/components/TasksView.tsx`, `calendar/CalendarEventDrawer.tsx` | 8 | show the server's message |
| `frontend/src/components/CaseListView.tsx` | 9 | `Arşivi göster`, `Arşivli` |

**E2E and docs**

| File | Task | Responsibility |
|---|---|---|
| `tests/e2e/specs/11-case-lifecycle.spec.ts` | 10 | edit → close with document → dashboard count → archive → unarchive → reopen |
| `README.md`, `PROGRESS.md` | 10 | feature notes |

---

## Tasks


### Task 1: Case decision columns and migration

Foundation: a case can store its decision date and closing note. Nothing is exposed except two new (empty) fields in the case responses.

**Files:**
- Create: `backend/alembic/versions/e6c1b9a4d2f8_add_case_decision_fields.py`
- Modify: `backend/app/models/case.py`
- Modify: `backend/app/schemas/case.py`
- Test (modify): `backend/tests/api/test_cases.py`
- Test (create): `backend/tests/integration/test_case_lifecycle_migration.py`

**Interfaces:**
- Consumes: existing `Case` model, `CaseOut` schema, Alembic head `d5b2f8a1c3e6`.
- Produces: `Case.decision_date: date | None`, `Case.closing_note: str | None`, the same two optional fields on `CaseOut` / `CaseDetailOut` (default `None`); Alembic revision `e6c1b9a4d2f8` (down revision `d5b2f8a1c3e6`), whose downgrade drops both columns.

- [ ] **Step 1: Write the failing tests**

Modify `backend/tests/api/test_cases.py`:

```diff
--- a/backend/tests/api/test_cases.py
+++ b/backend/tests/api/test_cases.py
@@ -35,6 +35,8 @@ def test_create_case_success(client, two_firms_two_users):
     assert body["case_number"] == "2026/101"
     assert body["status"] == "devam_eden"
     assert body["is_archived"] is False
+    assert body["decision_date"] is None
+    assert body["closing_note"] is None
 
 
 def test_create_case_missing_required_field_fails(client, two_firms_two_users):
```

Create `backend/tests/integration/test_case_lifecycle_migration.py`:

```python
"""The Alembic chain adds cases.decision_date / closing_note; existing cases
(closed ones included) keep both empty."""
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "d5b2f8a1c3e6"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _insert_case(conn, case_id, number, status, outcome):
    conn.execute(
        sa.text(
            "INSERT INTO cases (id, law_firm_id, case_number, case_name, client_name, "
            "case_type, opening_date, status, outcome, is_archived, is_precedent, created_at, updated_at) "
            "VALUES (:id, 'firm-1', :number, 'Dava', 'Müvekkil', 'kira', '2026-01-01', :status, :outcome, "
            "0, 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
        ),
        {"id": case_id, "number": number, "status": status, "outcome": outcome},
    )


def test_migration_adds_empty_decision_columns_and_downgrades(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES ('firm-1', 'Büro', '2026-01-01 00:00:00')"))
        _insert_case(conn, "c-open", "2026/1", "devam_eden", "ongoing")
        _insert_case(conn, "c-closed", "2026/2", "kapali", "won")

    command.upgrade(config, "head")
    inspector = sa.inspect(sa.create_engine(url))
    columns = {column["name"]: column for column in inspector.get_columns("cases")}
    assert {"decision_date", "closing_note"} <= set(columns)
    assert all(columns[name]["nullable"] for name in ("decision_date", "closing_note"))

    with sa.create_engine(url).connect() as conn:
        rows = conn.execute(sa.text("SELECT id, decision_date, closing_note, outcome FROM cases ORDER BY id")).all()
        assert [(row[0], row[1], row[2], row[3]) for row in rows] == [
            ("c-closed", None, None, "won"),
            ("c-open", None, None, "ongoing"),
        ]

    command.downgrade(config, PREVIOUS_HEAD)
    inspector = sa.inspect(sa.create_engine(url))
    assert not ({"decision_date", "closing_note"} & {column["name"] for column in inspector.get_columns("cases")})
    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM cases")).scalar_one() == 2
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_cases.py tests/integration/test_case_lifecycle_migration.py -q
```

Expected: FAIL —

```text
FAILED tests/api/test_cases.py::test_create_case_success - KeyError: 'decision_date'
FAILED tests/integration/test_case_lifecycle_migration.py::test_migration_adds_empty_decision_columns_and_downgrades
2 failed, 16 passed
```

- [ ] **Step 3: Implement**

Create `backend/alembic/versions/e6c1b9a4d2f8_add_case_decision_fields.py`:

```python
"""add case decision date and closing note

Revision ID: e6c1b9a4d2f8
Revises: d5b2f8a1c3e6
Create Date: 2026-10-11 12:00:00

cases.decision_date and cases.closing_note are filled when a case is closed
with POST /cases/{id}/close. Cases that were closed before this release keep
both empty (the UI shows a dash).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6c1b9a4d2f8"
down_revision: Union[str, Sequence[str], None] = "d5b2f8a1c3e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("decision_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("closing_note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.drop_column("closing_note")
        batch.drop_column("decision_date")
```

Modify `backend/app/models/case.py`:

```diff
--- a/backend/app/models/case.py
+++ b/backend/app/models/case.py
@@ -68,6 +68,10 @@ class Case(Base):
 
     status: Mapped[CaseStatus] = mapped_column(str_enum(CaseStatus), default=CaseStatus.DEVAM_EDEN, nullable=False)
     outcome: Mapped[CaseOutcome] = mapped_column(str_enum(CaseOutcome), default=CaseOutcome.ONGOING, nullable=False)
+    # Set by POST /cases/{id}/close, cleared by /reopen. Cases closed before
+    # the close endpoint existed keep both empty.
+    decision_date: Mapped[date | None] = mapped_column(Date, nullable=True)
+    closing_note: Mapped[str | None] = mapped_column(Text, nullable=True)
 
     case_value: Mapped[float] = mapped_column(Float, nullable=True)
     description: Mapped[str] = mapped_column(Text, nullable=True)
```

Modify `backend/app/schemas/case.py`:

```diff
--- a/backend/app/schemas/case.py
+++ b/backend/app/schemas/case.py
@@ -124,6 +124,8 @@ class CaseOut(BaseModel):
     next_hearing_date: Optional[date] = None
     status: CaseStatus
     outcome: CaseOutcome
+    decision_date: Optional[date] = None
+    closing_note: Optional[str] = None
     case_value: Optional[float] = None
     description: Optional[str] = None
     client_role: Optional[str] = None
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_cases.py tests/integration/test_case_lifecycle_migration.py -q
```

Expected: PASS —

```text
18 passed
```

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (773 tests). The full backend suite takes several minutes (about ten at the end of the plan): run it in the background or with a long timeout.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/e6c1b9a4d2f8_add_case_decision_fields.py backend/app/models/case.py backend/app/schemas/case.py backend/tests/api/test_cases.py backend/tests/integration/test_case_lifecycle_migration.py
git commit -F - <<'EOF'
feat: case decision_date and closing_note columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 2: Permission rule, close / reopen / archive / unarchive endpoints

The four lifecycle routes, the service behind them and the permission rule. After this task a case can be closed and reopened through the API; PATCH still accepts the old fields (Task 3 removes them), so every existing test keeps passing except `test_archive_case`, which now closes its case first (archiving an open case is a 409 from now on).

**Files:**
- Modify: `backend/app/schemas/case.py`
- Create: `backend/app/services/case_lifecycle.py`
- Modify: `backend/app/services/case_service.py`
- Create: `backend/app/api/case_access.py`
- Modify: `backend/app/api/routes/cases.py`
- Test (create): `backend/tests/api/test_case_lifecycle.py`
- Test (modify): `backend/tests/api/test_cases.py`
- Test (modify): `backend/tests/conftest.py`

**Interfaces:**
- Consumes: `Case`, `CaseEvent`, `CaseEventType.OTHER`, `CaseRepository.get_by_id_in_firm`, `app.core.timeutil.local_today`, `get_current_user`.
- Produces: `app.api.case_access`: `NOT_CASE_MANAGER`, `CASE_ARCHIVED`, `can_manage_case(user, case) -> bool`, `require_case_manager(user, case) -> None` (403), `require_case_writable(case) -> None` (409); `app.schemas.case.CaseClose` and `ClosingNote`; `app.services.case_lifecycle`: `CaseStateError(status_code, detail)`, `OUTCOME_LABELS`, `CaseLifecycleService(db).close(case, payload, closed_by, today)`, `.reopen(case, reopened_by, today)`, `.archive(case)`, `.unarchive(case)`; routes `POST /cases/{id}/close|reopen|archive|unarchive`; test fixture `close_case(headers, case_id, outcome="won", decision_date=None, note=None)` (asserts 200 and returns the case).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_case_lifecycle.py`:

```python
"""POST /cases/{id}/close, /reopen, /archive and /unarchive: rules, timeline events,
permissions (responsible lawyer or admin), firm isolation and the effect on analytics."""
from datetime import date

import pytest

from app.models.case import Case, CaseEvent, CaseStatus, CaseType

NOT_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
TODAY = date(2026, 10, 11)


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch):
    """The routes take "today" from the application time zone; pin it."""
    monkeypatch.setattr("app.api.routes.cases.local_today", lambda: TODAY)


def _new_case(client, headers, number="2026/1", **overrides):
    payload = {"case_number": number, "case_name": "Alacak Davası", "client_name": "Müvekkil", "case_type": "kira", **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _close_payload(**overrides):
    return {"outcome": "won", "decision_date": "2026-10-01", **overrides}


def _timeline(client, headers, case_id):
    return client.get(f"/cases/{case_id}", headers=headers).json()["timeline"]


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


# --- close -----------------------------------------------------------------------------

@pytest.mark.parametrize("outcome, label", [("won", "Kazanıldı"), ("lost", "Kaybedildi"), ("settled", "Sulh")])
def test_close_writes_the_decision_and_a_timeline_event(client, db_session, office, lawyer, outcome, label):
    case = _new_case(client, lawyer)

    response = client.post(
        f"/cases/{case['id']}/close",
        json=_close_payload(outcome=outcome, note="Karar tebliğ edildi."),
        headers=lawyer,
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["outcome"]) == ("kapali", outcome)
    assert (body["decision_date"], body["closing_note"]) == ("2026-10-01", "Karar tebliğ edildi.")
    assert body["is_archived"] is False
    timeline = _timeline(client, lawyer, case["id"])
    assert [(e["event_date"], e["title"], e["description"], e["event_type"]) for e in timeline] == [
        ("2026-10-01", f"Dava kapatıldı — {label}", "Karar tebliğ edildi.", "other"),
    ]
    event = db_session.query(CaseEvent).filter(CaseEvent.case_id == case["id"]).one()
    assert event.created_by == office.lawyer_a1.id and event.law_firm_id == office.firm_a.id


def test_close_trims_the_note_and_treats_a_blank_note_as_none(client, lawyer):
    first = _new_case(client, lawyer, "2026/1")
    second = _new_case(client, lawyer, "2026/2")
    third = _new_case(client, lawyer, "2026/3")

    trimmed = client.post(f"/cases/{first['id']}/close", json=_close_payload(note="  Not  \n"), headers=lawyer).json()
    blank = client.post(f"/cases/{second['id']}/close", json=_close_payload(note="   "), headers=lawyer).json()
    omitted = client.post(f"/cases/{third['id']}/close", json=_close_payload(), headers=lawyer).json()

    assert trimmed["closing_note"] == "Not"
    assert blank["closing_note"] is None and omitted["closing_note"] is None
    assert _timeline(client, lawyer, second["id"])[0]["description"] is None


def test_close_accepts_a_4000_character_note_and_rejects_a_longer_one(client, lawyer):
    case = _new_case(client, lawyer)

    too_long = client.post(f"/cases/{case['id']}/close", json=_close_payload(note="a" * 4001), headers=lawyer)
    assert too_long.status_code == 422
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["status"] == "devam_eden"

    ok = client.post(f"/cases/{case['id']}/close", json=_close_payload(note=" " + "a" * 4000 + " "), headers=lawyer)
    assert ok.status_code == 200 and len(ok.json()["closing_note"]) == 4000


@pytest.mark.parametrize("outcome", ["ongoing", "other", "", None])
def test_close_requires_one_of_the_three_outcomes(client, lawyer, outcome):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/close", json=_close_payload(outcome=outcome), headers=lawyer)
    assert response.status_code == 422


def test_close_requires_a_decision_date(client, lawyer):
    case = _new_case(client, lawyer)
    assert client.post(f"/cases/{case['id']}/close", json={"outcome": "won"}, headers=lawyer).status_code == 422
    bad = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="yarın"), headers=lawyer)
    assert bad.status_code == 422


def test_close_rejects_a_decision_date_after_today_but_accepts_today(client, db_session, lawyer):
    case = _new_case(client, lawyer)

    future = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="2026-10-12"), headers=lawyer)
    assert future.status_code == 422
    assert future.json()["detail"] == "Karar tarihi ileri bir tarih olamaz."
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["status"] == "devam_eden"
    assert db_session.query(CaseEvent).filter(CaseEvent.case_id == case["id"]).count() == 0

    today = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="2026-10-11"), headers=lawyer)
    assert today.status_code == 200 and today.json()["decision_date"] == "2026-10-11"


def test_today_is_the_application_local_date(client, lawyer, monkeypatch):
    """The route compares with local_today() (APP_TIMEZONE), not with the UTC date."""
    case = _new_case(client, lawyer)
    monkeypatch.setattr("app.api.routes.cases.local_today", lambda: date(2026, 10, 13))

    response = client.post(f"/cases/{case['id']}/close", json=_close_payload(decision_date="2026-10-13"), headers=lawyer)

    assert response.status_code == 200


def test_closing_a_closed_case_is_a_409_and_changes_nothing(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"], outcome="won", decision_date="2026-10-01")

    response = client.post(f"/cases/{case['id']}/close", json=_close_payload(outcome="lost"), headers=lawyer)

    assert response.status_code == 409
    assert response.json()["detail"] == "Dava zaten kapalı."
    detail = client.get(f"/cases/{case['id']}", headers=lawyer).json()
    assert detail["outcome"] == "won" and len(detail["timeline"]) == 1


# --- reopen ----------------------------------------------------------------------------

def test_reopen_clears_the_decision_and_adds_an_event_dated_today(client, lawyer, close_case):
    case = _new_case(client, lawyer, status="karar_bekleyen")
    close_case(lawyer, case["id"], outcome="lost", decision_date="2026-10-01", note="Ret")

    response = client.post(f"/cases/{case['id']}/reopen", headers=lawyer)

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["outcome"]) == ("devam_eden", "ongoing")
    assert (body["decision_date"], body["closing_note"]) == (None, None)
    timeline = _timeline(client, lawyer, case["id"])
    assert [(e["event_date"], e["title"], e["description"], e["event_type"]) for e in timeline] == [
        ("2026-10-01", "Dava kapatıldı — Kaybedildi", "Ret", "other"),
        ("2026-10-11", "Dava yeniden açıldı", None, "other"),
    ]


def test_reopening_an_open_case_is_a_409(client, lawyer):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/reopen", headers=lawyer)
    assert response.status_code == 409
    assert response.json()["detail"] == "Dava zaten açık."
    assert _timeline(client, lawyer, case["id"]) == []


def test_a_reopened_case_can_be_closed_again(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/reopen", headers=lawyer)

    again = close_case(lawyer, case["id"], outcome="settled", decision_date="2026-10-05")

    assert (again["outcome"], again["decision_date"]) == ("settled", "2026-10-05")
    assert len(_timeline(client, lawyer, case["id"])) == 3


# --- archive / unarchive ---------------------------------------------------------------

def test_only_a_closed_case_can_be_archived(client, lawyer, close_case):
    case = _new_case(client, lawyer)

    refused = client.post(f"/cases/{case['id']}/archive", headers=lawyer)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Yalnızca kapalı davalar arşivlenebilir."

    close_case(lawyer, case["id"])
    archived = client.post(f"/cases/{case['id']}/archive", headers=lawyer)
    assert archived.status_code == 200 and archived.json()["is_archived"] is True


def test_archiving_twice_returns_the_case_unchanged(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    first = client.post(f"/cases/{case['id']}/archive", headers=lawyer).json()

    second = client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    assert second.status_code == 200
    assert second.json() == first


def test_an_archived_case_that_is_still_open_is_returned_unchanged_too(client, db_session, office, lawyer):
    """Cases archived before closing was required stay archived; archiving them again is not an error."""
    case = _new_case(client, lawyer)
    row = db_session.get(Case, case["id"])
    row.is_archived = True
    db_session.commit()

    response = client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    assert response.status_code == 200 and response.json()["is_archived"] is True


def test_unarchive_is_idempotent_and_keeps_the_case_closed(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    first = client.post(f"/cases/{case['id']}/unarchive", headers=lawyer)
    second = client.post(f"/cases/{case['id']}/unarchive", headers=lawyer)

    assert first.status_code == second.status_code == 200
    assert first.json()["is_archived"] is False and second.json() == first.json()
    assert first.json()["status"] == "kapali"
    assert client.get("/cases", headers=lawyer).json()[0]["id"] == case["id"]


def test_an_archived_case_cannot_be_closed_or_reopened(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    reopen = client.post(f"/cases/{case['id']}/reopen", headers=lawyer)
    close = client.post(f"/cases/{case['id']}/close", json=_close_payload(), headers=lawyer)

    assert (reopen.status_code, reopen.json()["detail"]) == (409, ARCHIVED)
    assert (close.status_code, close.json()["detail"]) == (409, ARCHIVED)
    assert client.post(f"/cases/{case['id']}/unarchive", headers=lawyer).status_code == 200
    assert client.post(f"/cases/{case['id']}/reopen", headers=lawyer).status_code == 200


# --- who may do it -----------------------------------------------------------------------

def _actions(case_id):
    return [
        ("close", f"/cases/{case_id}/close", _close_payload()),
        ("reopen", f"/cases/{case_id}/reopen", None),
        ("archive", f"/cases/{case_id}/archive", None),
        ("unarchive", f"/cases/{case_id}/unarchive", None),
    ]


def test_another_lawyer_of_the_firm_gets_a_403_on_every_action(client, office, auth_headers, lawyer):
    case = _new_case(client, lawyer)
    other = auth_headers(office.lawyer_a2)

    for name, path, body in _actions(case["id"]):
        response = client.post(path, headers=other, **({"json": body} if body else {}))
        assert (response.status_code, response.json()["detail"]) == (403, NOT_MANAGER), name


def test_an_admin_can_close_reopen_archive_and_unarchive_any_case_of_the_firm(client, office, auth_headers, lawyer):
    case = _new_case(client, lawyer)
    admin = auth_headers(office.admin_a)

    assert client.post(f"/cases/{case['id']}/close", json=_close_payload(), headers=admin).status_code == 200
    assert client.post(f"/cases/{case['id']}/archive", headers=admin).status_code == 200
    assert client.post(f"/cases/{case['id']}/unarchive", headers=admin).status_code == 200
    assert client.post(f"/cases/{case['id']}/reopen", headers=admin).status_code == 200


def test_a_case_without_a_responsible_lawyer_is_only_managed_by_an_admin(client, db_session, office, auth_headers, lawyer):
    orphan = Case(
        law_firm_id=office.firm_a.id, case_number="2026/77", case_name="Sahipsiz", client_name="M",
        case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN, assigned_lawyer_id=None,
    )
    db_session.add(orphan)
    db_session.commit()

    for name, path, body in _actions(orphan.id):
        response = client.post(path, headers=lawyer, **({"json": body} if body else {}))
        assert (response.status_code, response.json()["detail"]) == (403, NOT_MANAGER), name
    closed = client.post(f"/cases/{orphan.id}/close", json=_close_payload(), headers=auth_headers(office.admin_a))
    assert closed.status_code == 200


def test_another_firm_gets_a_404_on_every_action_even_as_admin(client, office, auth_headers, lawyer):
    case = _new_case(client, lawyer)
    foreign_admin = auth_headers(office.admin_b)

    for name, path, body in _actions(case["id"]):
        response = client.post(path, headers=foreign_admin, **({"json": body} if body else {}))
        assert response.status_code == 404, name
    assert client.post(f"/cases/{case['id']}/close", json=_close_payload(), headers=lawyer).status_code == 200


def test_the_actions_need_a_login(client, office, lawyer):
    case = _new_case(client, lawyer)
    for name, path, body in _actions(case["id"]):
        assert client.post(path, **({"json": body} if body else {})).status_code == 401, name


def test_permission_is_checked_before_the_case_state(client, office, auth_headers, lawyer):
    """A stranger learns nothing about the case: 403 even when the state would be a 409."""
    case = _new_case(client, lawyer)
    other = auth_headers(office.lawyer_a2)
    assert client.post(f"/cases/{case['id']}/reopen", headers=other).status_code == 403
    assert client.post(f"/cases/{case['id']}/archive", headers=other).status_code == 403


# --- effect on the numbers -----------------------------------------------------------------

def test_closing_cases_moves_the_analytics_counts(client, office, auth_headers, lawyer, close_case):
    won = _new_case(client, lawyer, "2026/1")
    lost = _new_case(client, lawyer, "2026/2")
    settled = _new_case(client, lawyer, "2026/3")
    _new_case(client, lawyer, "2026/4")
    admin = auth_headers(office.admin_a)

    before = client.get("/analytics/overview", headers=admin).json()
    assert (before["active_cases"], before["won_cases"], before["lost_cases"], before["win_rate"]) == (4, 0, 0, 0.0)

    close_case(lawyer, won["id"], "won")
    close_case(lawyer, lost["id"], "lost")
    close_case(lawyer, settled["id"], "settled")
    after = client.get("/analytics/overview", headers=admin).json()

    assert (after["total_cases"], after["active_cases"]) == (4, 1)
    assert (after["won_cases"], after["lost_cases"], after["win_rate"]) == (1, 1, 50.0)
    mine = next(row for row in after["by_lawyer"] if row["lawyer_id"] == office.lawyer_a1.id)
    assert (mine["won"], mine["lost"], mine["active"]) == (1, 1, 1)

    client.post(f"/cases/{won['id']}/reopen", headers=lawyer)
    reopened = client.get("/analytics/overview", headers=admin).json()
    assert (reopened["active_cases"], reopened["won_cases"]) == (2, 0)
```

Modify `backend/tests/api/test_cases.py`:

```diff
--- a/backend/tests/api/test_cases.py
+++ b/backend/tests/api/test_cases.py
@@ -68,9 +68,10 @@ def test_update_case(client, two_firms_two_users):
     assert response.json()["status"] == "karar_bekleyen"
 
 
-def test_archive_case(client, two_firms_two_users):
+def test_archive_case(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     created = client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()
+    close_case(headers, created["id"])
 
     response = client.post(f"/cases/{created['id']}/archive", headers=headers)
     assert response.status_code == 200
```

Modify `backend/tests/conftest.py`:

```diff
--- a/backend/tests/conftest.py
+++ b/backend/tests/conftest.py
@@ -212,3 +212,20 @@ def auth_headers(client, office):
         return {"Authorization": f"Bearer {response.json()['access_token']}"}
 
     return _headers
+
+
+@pytest.fixture()
+def close_case(client):
+    """close_case(headers, case_id, outcome="won", decision_date=None, note=None) -> the closed
+    case (JSON). decision_date is an ISO string and defaults to today in the app's time zone."""
+    from app.core.timeutil import local_today
+
+    def _close(headers, case_id, outcome="won", decision_date=None, note=None):
+        payload = {"outcome": outcome, "decision_date": decision_date or local_today().isoformat()}
+        if note is not None:
+            payload["note"] = note
+        response = client.post(f"/cases/{case_id}/close", json=payload, headers=headers)
+        assert response.status_code == 200, response.text
+        return response.json()
+
+    return _close
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_case_lifecycle.py tests/api/test_cases.py -q
```

Expected: FAIL —

```text
FAILED tests/api/test_cases.py::test_archive_case - AssertionError: {"detail"...
ERROR tests/api/test_case_lifecycle.py::test_close_writes_the_decision_and_a_timeline_event[won-Kazan\u0131ld\u0131]
ERROR tests/api/test_case_lifecycle.py::test_close_writes_the_decision_and_a_timeline_event[lost-Kaybedildi]
ERROR tests/api/test_case_lifecycle.py::test_close_writes_the_decision_and_a_timeline_event[settled-Sulh]
ERROR tests/api/test_case_lifecycle.py::test_close_trims_the_note_and_treats_a_blank_note_as_none
... and 24 more
1 failed, 16 passed, 28 errors
```

- [ ] **Step 3: Implement**

Modify `backend/app/schemas/case.py`:

```diff
--- a/backend/app/schemas/case.py
+++ b/backend/app/schemas/case.py
@@ -1,11 +1,12 @@
 from datetime import date, datetime
-from typing import Annotated, Optional
+from typing import Annotated, Literal, Optional
 
 from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator
 
 from app.models.case import CaseEventType, CaseOutcome, CaseStatus, CaseType, ClientRole, PartyRole
 
 PartyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
+ClosingNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]
 
 
 class CaseEventCreate(BaseModel):
@@ -99,6 +100,20 @@ class CaseUpdate(BaseModel):
     parties: Optional[list[CasePartyIn]] = Field(default=None, min_length=1, max_length=20)
 
 
+class CaseClose(BaseModel):
+    """POST /cases/{id}/close. The outcome is one of the three closing outcomes
+    ("ongoing" is not a way to close); the note is trimmed, a blank note is none."""
+
+    outcome: Literal["won", "lost", "settled"]
+    decision_date: date
+    note: Optional[ClosingNote] = None
+
+    @field_validator("note")
+    @classmethod
+    def _blank_note_is_none(cls, value: Optional[str]) -> Optional[str]:
+        return value or None
+
+
 class CaseAssignment(BaseModel):
     assigned_lawyer_id: str
 
```

Create `backend/app/services/case_lifecycle.py`:

```python
"""Closing, reopening and archiving a case.

HTTP-agnostic like the other services: a broken rule raises CaseStateError and
the route turns it into the response. "today" is passed in by the route (the
application time zone, like the calendar), so the rules are testable.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.case import Case, CaseEvent, CaseEventType, CaseOutcome, CaseStatus
from app.schemas.case import CaseClose

OUTCOME_LABELS = {
    CaseOutcome.WON: "Kazanıldı",
    CaseOutcome.LOST: "Kaybedildi",
    CaseOutcome.SETTLED: "Sulh",
}


class CaseStateError(Exception):
    """A lifecycle rule was broken; carries the HTTP status and the Turkish message."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class CaseLifecycleService:
    def __init__(self, db: Session):
        self.db = db

    def _save(self, case: Case, event: Optional[CaseEvent] = None) -> Case:
        """The case and its timeline event are committed together."""
        self.db.add(case)
        if event is not None:
            self.db.add(event)
        self.db.commit()
        self.db.refresh(case)
        return case

    def close(self, case: Case, payload: CaseClose, closed_by: str, today: date) -> Case:
        if case.status == CaseStatus.KAPALI:
            raise CaseStateError(409, "Dava zaten kapalı.")
        if payload.decision_date > today:
            raise CaseStateError(422, "Karar tarihi ileri bir tarih olamaz.")
        outcome = CaseOutcome(payload.outcome)
        case.status = CaseStatus.KAPALI
        case.outcome = outcome
        case.decision_date = payload.decision_date
        case.closing_note = payload.note
        event = CaseEvent(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            event_date=payload.decision_date,
            title=f"Dava kapatıldı — {OUTCOME_LABELS[outcome]}",
            description=payload.note,
            event_type=CaseEventType.OTHER,
            created_by=closed_by,
        )
        return self._save(case, event)

    def reopen(self, case: Case, reopened_by: str, today: date) -> Case:
        if case.status != CaseStatus.KAPALI:
            raise CaseStateError(409, "Dava zaten açık.")
        case.status = CaseStatus.DEVAM_EDEN
        case.outcome = CaseOutcome.ONGOING
        case.decision_date = None
        case.closing_note = None
        event = CaseEvent(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            event_date=today,
            title="Dava yeniden açıldı",
            description=None,
            event_type=CaseEventType.OTHER,
            created_by=reopened_by,
        )
        return self._save(case, event)

    def archive(self, case: Case) -> Case:
        """Idempotent: an archived case is returned as it is. Only closed cases are archived."""
        if case.is_archived:
            return case
        if case.status != CaseStatus.KAPALI:
            raise CaseStateError(409, "Yalnızca kapalı davalar arşivlenebilir.")
        case.is_archived = True
        return self._save(case)

    def unarchive(self, case: Case) -> Case:
        """Idempotent: a case that is not archived is returned as it is."""
        if not case.is_archived:
            return case
        case.is_archived = False
        return self._save(case)
```

Modify `backend/app/services/case_service.py`:

```diff
--- a/backend/app/services/case_service.py
+++ b/backend/app/services/case_service.py
@@ -112,10 +112,6 @@ class CaseService:
             case.parties = party_models(parties, case.law_firm_id)
         return self.cases.save(case)
 
-    def archive_case(self, case: Case) -> Case:
-        case.is_archived = True
-        return self.cases.save(case)
-
     def get_timeline(self, case_id: str, law_firm_id: str) -> list[CaseEvent]:
         return self.events.list_for_case(case_id, law_firm_id)
 
```

Create `backend/app/api/case_access.py`:

```python
"""Who may change a case, and the archived read-only rule.

Every route that writes to a case, or to something that belongs to a case,
runs the firm-scoped lookup first (another firm's case is a 404 before any of
this) and then:

    require_case_manager(user, case)   403 unless admin or the responsible lawyer
    require_case_writable(case)        409 when the case is archived

The order matters: a stranger gets the 403 even when the state would be a 409.
"""
from fastapi import HTTPException, status

from app.models.case import Case
from app.models.user import User, UserRole

NOT_CASE_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
CASE_ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."


def can_manage_case(user: User, case: Case) -> bool:
    """Admins manage every case of the firm; a lawyer only the cases they are
    responsible for. A case without a responsible lawyer belongs to the admins."""
    if user.role == UserRole.ADMIN:
        return True
    return case.assigned_lawyer_id is not None and case.assigned_lawyer_id == user.id


def require_case_manager(user: User, case: Case) -> None:
    if not can_manage_case(user, case):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_CASE_MANAGER)


def require_case_writable(case: Case) -> None:
    if case.is_archived:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CASE_ARCHIVED)
```

Modify `backend/app/api/routes/cases.py`:

```diff
--- a/backend/app/api/routes/cases.py
+++ b/backend/app/api/routes/cases.py
@@ -3,11 +3,14 @@ from typing import Optional
 from fastapi import APIRouter, Depends, HTTPException, Query, status
 from sqlalchemy.orm import Session
 
+from app.api.case_access import require_case_manager, require_case_writable
 from app.api.deps import get_current_law_firm_id, get_current_user
+from app.core.timeutil import local_today
 from app.db.session import get_db
 from app.models.case import CaseOutcome, CaseStatus, CaseType
 from app.models.user import User, UserRole
-from app.schemas.case import CaseCreate, CaseDetailOut, CaseEventCreate, CaseEventOut, CaseOut, CaseUpdate
+from app.schemas.case import CaseClose, CaseCreate, CaseDetailOut, CaseEventCreate, CaseEventOut, CaseOut, CaseUpdate
+from app.services.case_lifecycle import CaseLifecycleService, CaseStateError
 from app.services.case_parties import InvalidPartiesError
 from app.services.case_service import CaseService, DuplicateCaseNumberError
 
@@ -21,6 +24,21 @@ def _get_owned_case_or_404(service: CaseService, case_id: str, law_firm_id: str)
     return case
 
 
+def _managed_case(db: Session, case_id: str, current_user: User):
+    """The firm's case (404 otherwise) that the user may change (403 otherwise)."""
+    case = _get_owned_case_or_404(CaseService(db), case_id, current_user.law_firm_id)
+    require_case_manager(current_user, case)
+    return case
+
+
+def _lifecycle(action):
+    """Runs a lifecycle action and turns a broken rule into its HTTP response."""
+    try:
+        return action()
+    except CaseStateError as exc:
+        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
+
+
 @router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
 def create_case(
     payload: CaseCreate,
@@ -112,15 +130,47 @@ def update_case(
         raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
 
 
+@router.post("/{case_id}/close", response_model=CaseOut)
+def close_case(
+    case_id: str,
+    payload: CaseClose,
+    current_user: User = Depends(get_current_user),
+    db: Session = Depends(get_db),
+):
+    case = _managed_case(db, case_id, current_user)
+    require_case_writable(case)
+    return _lifecycle(lambda: CaseLifecycleService(db).close(case, payload, current_user.id, local_today()))
+
+
+@router.post("/{case_id}/reopen", response_model=CaseOut)
+def reopen_case(
+    case_id: str,
+    current_user: User = Depends(get_current_user),
+    db: Session = Depends(get_db),
+):
+    case = _managed_case(db, case_id, current_user)
+    require_case_writable(case)
+    return _lifecycle(lambda: CaseLifecycleService(db).reopen(case, current_user.id, local_today()))
+
+
 @router.post("/{case_id}/archive", response_model=CaseOut)
 def archive_case(
     case_id: str,
-    law_firm_id: str = Depends(get_current_law_firm_id),
+    current_user: User = Depends(get_current_user),
     db: Session = Depends(get_db),
 ):
-    service = CaseService(db)
-    case = _get_owned_case_or_404(service, case_id, law_firm_id)
-    return service.archive_case(case)
+    case = _managed_case(db, case_id, current_user)
+    return _lifecycle(lambda: CaseLifecycleService(db).archive(case))
+
+
+@router.post("/{case_id}/unarchive", response_model=CaseOut)
+def unarchive_case(
+    case_id: str,
+    current_user: User = Depends(get_current_user),
+    db: Session = Depends(get_db),
+):
+    case = _managed_case(db, case_id, current_user)
+    return CaseLifecycleService(db).unarchive(case)
 
 
 @router.post("/{case_id}/events", response_model=CaseEventOut, status_code=status.HTTP_201_CREATED)
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_case_lifecycle.py tests/api/test_cases.py -q
```

Expected: PASS —

```text
45 passed
```

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (801 tests). The full backend suite takes several minutes (about ten at the end of the plan): run it in the background or with a long timeout.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/case_access.py backend/app/api/routes/cases.py backend/app/schemas/case.py backend/app/services/case_lifecycle.py backend/app/services/case_service.py backend/tests/api/test_case_lifecycle.py backend/tests/api/test_cases.py backend/tests/conftest.py
git commit -F - <<'EOF'
feat: close, reopen, archive and unarchive endpoints with case permissions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 3: PATCH /cases can no longer close, set an outcome or reopen

`PATCH /cases/{id}` is limited to editing: it is permission-checked, refuses an archived case, rejects `status=kapali`, any `outcome` and a status change on a closed case, and validates field limits. The old test fixtures that closed cases through PATCH move to the `close_case` fixture in the same commit.

**Files:**
- Modify: `backend/app/schemas/case.py`
- Modify: `backend/app/services/case_lifecycle.py`
- Modify: `backend/app/api/routes/cases.py`
- Test (modify): `backend/tests/api/test_analytics.py`
- Test (modify): `backend/tests/api/test_case_parties.py`
- Test (create): `backend/tests/api/test_case_update_rules.py`
- Test (modify): `backend/tests/api/test_cases.py`
- Test (modify): `backend/tests/api/test_institutional_memory.py`
- Test (modify): `backend/tests/api/test_reports.py`

**Interfaces:**
- Consumes: Task 2: `require_case_manager`, `require_case_writable`, `CaseLifecycleService`, `close_case` fixture.
- Produces: `CaseUpdate` with `opening_date`, `case_name` (1–255, trimmed), `court` (≤255, blank → `None`), `case_value ≥ 0`, explicit `null` rejected for `case_name`, `case_type`, `status`, `opening_date`; `CaseLifecycleService.ensure_patch_allowed(case, payload)` (staticmethod, 422 with the three Turkish messages, in the order: `kapali`, `outcome`, status on a closed case); PATCH check order 403 (reassign) → 404/403 (`_managed_case`) → 409 → 422.

- [ ] **Step 1: Write the failing tests**

Modify `backend/tests/api/test_analytics.py`:

```diff
--- a/backend/tests/api/test_analytics.py
+++ b/backend/tests/api/test_analytics.py
@@ -33,12 +33,12 @@ def test_analytics_overview_empty_dataset(client, two_firms_two_users):
     assert body["win_rate"] == 0.0
 
 
-def test_analytics_overview_reflects_created_cases(client, two_firms_two_users):
+def test_analytics_overview_reflects_created_cases(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     won = _create_case(client, headers, case_number="1")
-    client.patch(f"/cases/{won['id']}", json={"status": "kapali", "outcome": "won"}, headers=headers)
+    close_case(headers, won["id"], "won")
     lost = _create_case(client, headers, case_number="2")
-    client.patch(f"/cases/{lost['id']}", json={"status": "kapali", "outcome": "lost"}, headers=headers)
+    close_case(headers, lost["id"], "lost")
 
     response = client.get("/analytics/overview", headers=headers)
     body = response.json()
@@ -48,13 +48,13 @@ def test_analytics_overview_reflects_created_cases(client, two_firms_two_users):
     assert body["win_rate"] == 50.0
 
 
-def test_analytics_isolated_by_law_firm(client, two_firms_two_users):
+def test_analytics_isolated_by_law_firm(client, two_firms_two_users, close_case):
     fixtures = two_firms_two_users
     headers_a = _auth_headers(client, fixtures, "user_a")
     headers_b = _auth_headers(client, fixtures, "user_b")
 
     won = _create_case(client, headers_a, case_number="1")
-    client.patch(f"/cases/{won['id']}", json={"status": "kapali", "outcome": "won"}, headers=headers_a)
+    close_case(headers_a, won["id"], "won")
 
     response_b = client.get("/analytics/overview", headers=headers_b)
     assert response_b.json()["total_cases"] == 0
@@ -84,7 +84,7 @@ def test_analytics_overview_includes_status_breakdown(client, two_firms_two_user
     assert [row["status"] for row in body["by_status"]] == ["devam_eden", "kapali"]
 
 
-def test_overview_counts_match_case_list_filters(client, two_firms_two_users):
+def test_overview_counts_match_case_list_filters(client, two_firms_two_users, close_case):
     """Spec 5.1: every analytics number must equal the row count of the
     list it links to (links from analytics always add include_archived)."""
     headers = _auth_headers(client, two_firms_two_users)
@@ -92,8 +92,8 @@ def test_overview_counts_match_case_list_filters(client, two_firms_two_users):
     _create_case(client, headers, case_number="2026/602", case_type="icra")
     lost = _create_case(client, headers, case_number="2026/603", case_type="kira")
     _create_case(client, headers, case_number="2026/604", case_type="kira", status="karar_bekleyen")
-    client.patch(f"/cases/{won_archived['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)
-    client.patch(f"/cases/{lost['id']}", json={"outcome": "lost", "status": "kapali"}, headers=headers)
+    close_case(headers, won_archived["id"], "won")
+    close_case(headers, lost["id"], "lost")
     client.post(f"/cases/{won_archived['id']}/archive", headers=headers)
 
     overview = client.get("/analytics/overview", headers=headers).json()
```

Modify `backend/tests/api/test_case_parties.py`:

```diff
--- a/backend/tests/api/test_case_parties.py
+++ b/backend/tests/api/test_case_parties.py
@@ -208,7 +208,7 @@ def test_patch_without_parties_keeps_them(client, two_firms_two_users):
 
     body = client.patch(
         f"/cases/{created['id']}",
-        json={"claim": "Yeni talep", "court_file_number": "2026/9 Esas", "status": "kapali"},
+        json={"claim": "Yeni talep", "court_file_number": "2026/9 Esas", "status": "karar_bekleyen"},
         headers=headers,
     ).json()
 
```

Create `backend/tests/api/test_case_update_rules.py`:

```python
"""PATCH /cases/{id}: editable fields, the open-status rules (closing and reopening
have their own endpoints) and who may change a case."""
import pytest

from app.models.case import Case, CaseStatus, CaseType

NOT_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
USE_CLOSE = "Davayı kapatmak için 'Davayı kapat' işlemini kullanın."
NO_OUTCOME = "Sonuç yalnızca dava kapatılırken girilebilir."
USE_REOPEN = "Kapalı davayı açmak için 'Yeniden aç' işlemini kullanın."


def _new_case(client, headers, number="2026/1", **overrides):
    payload = {"case_number": number, "case_name": "Alacak Davası", "client_name": "Müvekkil", "case_type": "kira", **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


@pytest.fixture()
def case(client, lawyer):
    return _new_case(client, lawyer)


def _patch(client, headers, case_id, **body):
    return client.patch(f"/cases/{case_id}", json=body, headers=headers)


# --- status and outcome ------------------------------------------------------------------

def test_patch_cannot_close_a_case(client, lawyer, case):
    response = _patch(client, lawyer, case["id"], status="kapali")
    assert (response.status_code, response.json()["detail"]) == (422, USE_CLOSE)
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["status"] == "devam_eden"


def test_patch_cannot_set_the_outcome(client, lawyer, case):
    for body in ({"outcome": "won"}, {"outcome": "ongoing"}, {"outcome": None}, {"outcome": "won", "case_name": "X"}):
        response = client.patch(f"/cases/{case['id']}", json=body, headers=lawyer)
        assert (response.status_code, response.json()["detail"]) == (422, NO_OUTCOME), body
    detail = client.get(f"/cases/{case['id']}", headers=lawyer).json()
    assert (detail["outcome"], detail["case_name"]) == ("ongoing", "Alacak Davası")


def test_closing_and_outcome_together_report_the_closing_message(client, lawyer, case):
    response = _patch(client, lawyer, case["id"], status="kapali", outcome="won")
    assert (response.status_code, response.json()["detail"]) == (422, USE_CLOSE)


def test_open_statuses_can_be_changed_freely(client, lawyer, case):
    for status in ("durusma_bekleyen", "karar_bekleyen", "devam_eden", "karar_bekleyen"):
        response = _patch(client, lawyer, case["id"], status=status)
        assert response.status_code == 200 and response.json()["status"] == status


def test_a_closed_case_rejects_a_status_but_accepts_other_edits(client, lawyer, case, close_case):
    close_case(lawyer, case["id"], outcome="lost", decision_date="2026-10-01", note="Ret")

    for status in ("devam_eden", "durusma_bekleyen", "kapali"):
        response = _patch(client, lawyer, case["id"], status=status)
        assert response.status_code == 422, status
    assert _patch(client, lawyer, case["id"], status="devam_eden").json()["detail"] == USE_REOPEN

    edited = _patch(client, lawyer, case["id"], case_name="Düzeltilmiş ad", court="Ankara 3. Asliye Hukuk")
    assert edited.status_code == 200
    body = edited.json()
    assert (body["case_name"], body["court"]) == ("Düzeltilmiş ad", "Ankara 3. Asliye Hukuk")
    assert (body["status"], body["outcome"], body["decision_date"], body["closing_note"]) == (
        "kapali", "lost", "2026-10-01", "Ret",
    )


# --- editable fields -----------------------------------------------------------------------

def test_the_basic_fields_can_be_edited_and_cleared(client, lawyer, case):
    response = _patch(
        client, lawyer, case["id"],
        case_name="  Yeni Ad  ", case_type="icra", court="İzmir 1. İcra Hukuk", court_file_number="2026/5 E.",
        opening_date="2026-02-03", case_value=12500.5, description="Not",
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["case_name"], body["case_type"], body["court"]) == ("Yeni Ad", "icra", "İzmir 1. İcra Hukuk")
    assert (body["court_file_number"], body["opening_date"], body["case_value"]) == ("2026/5 E.", "2026-02-03", 12500.5)
    assert body["case_number"] == case["case_number"]

    cleared = _patch(client, lawyer, case["id"], court=None, case_value=None, court_file_number=None).json()
    assert (cleared["court"], cleared["case_value"], cleared["court_file_number"]) == (None, None, None)


def test_a_blank_court_is_stored_as_none(client, lawyer, case):
    assert _patch(client, lawyer, case["id"], court="   ").json()["court"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"case_name": ""},
        {"case_name": "   "},
        {"case_name": "a" * 256},
        {"case_name": None},
        {"case_type": None},
        {"case_type": "bilinmeyen"},
        {"status": None},
        {"opening_date": None},
        {"opening_date": "dün"},
        {"court": "a" * 256},
        {"case_value": -1},
    ],
)
def test_invalid_edits_are_rejected_and_change_nothing(client, lawyer, case, body):
    assert client.patch(f"/cases/{case['id']}", json=body, headers=lawyer).status_code == 422
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["case_name"] == "Alacak Davası"


def test_the_responsible_lawyer_cannot_be_changed_here(client, lawyer, case, office):
    response = _patch(client, lawyer, case["id"], assigned_lawyer_id=office.lawyer_a2.id)
    assert response.status_code == 403


# --- who may edit ----------------------------------------------------------------------------

def test_responsible_lawyer_and_admin_may_edit_other_lawyers_may_not(client, office, auth_headers, lawyer, case):
    admin = auth_headers(office.admin_a)
    other = auth_headers(office.lawyer_a2)

    assert _patch(client, lawyer, case["id"], case_name="A").status_code == 200
    assert _patch(client, admin, case["id"], case_name="B").status_code == 200
    denied = _patch(client, other, case["id"], case_name="C")
    assert (denied.status_code, denied.json()["detail"]) == (403, NOT_MANAGER)
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["case_name"] == "B"


def test_the_parties_and_dispute_edits_follow_the_same_rule(client, office, auth_headers, case):
    other = auth_headers(office.lawyer_a2)
    parties = [{"name": "Yeni Müvekkil", "role": "plaintiff", "is_client": True}]
    assert _patch(client, other, case["id"], parties=parties).status_code == 403
    assert _patch(client, other, case["id"], claim="Talep", facts_summary="Olay").status_code == 403
    assert _patch(client, other, case["id"], description=None).status_code == 403


def test_a_case_without_a_responsible_lawyer_is_only_edited_by_an_admin(client, db_session, office, auth_headers, lawyer):
    orphan = Case(
        law_firm_id=office.firm_a.id, case_number="2026/77", case_name="Sahipsiz", client_name="M",
        case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN, assigned_lawyer_id=None,
    )
    db_session.add(orphan)
    db_session.commit()

    assert _patch(client, lawyer, orphan.id, case_name="Denendi").status_code == 403
    assert _patch(client, auth_headers(office.admin_a), orphan.id, case_name="Düzenlendi").status_code == 200


def test_another_firm_gets_a_404_and_no_login_a_401(client, office, auth_headers, case):
    assert _patch(client, auth_headers(office.admin_b), case["id"], case_name="X").status_code == 404
    assert _patch(client, auth_headers(office.admin_b), case["id"], status="kapali").status_code == 404
    assert client.patch(f"/cases/{case['id']}", json={"case_name": "X"}).status_code == 401


def test_permission_is_checked_before_the_state_rules(client, office, auth_headers, case):
    other = auth_headers(office.lawyer_a2)
    assert _patch(client, other, case["id"], status="kapali").status_code == 403
    assert _patch(client, other, case["id"], outcome="won").status_code == 403


# --- archived cases -----------------------------------------------------------------------------

def test_an_archived_case_cannot_be_edited_until_it_is_unarchived(client, office, auth_headers, lawyer, case, close_case):
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    for headers in (lawyer, auth_headers(office.admin_a)):
        response = _patch(client, headers, case["id"], case_name="Değişti")
        assert (response.status_code, response.json()["detail"]) == (409, ARCHIVED)
    # the archived guard answers before the status rules
    assert _patch(client, lawyer, case["id"], status="kapali").status_code == 409

    client.post(f"/cases/{case['id']}/unarchive", headers=lawyer)
    assert _patch(client, lawyer, case["id"], case_name="Değişti").status_code == 200
```

Modify `backend/tests/api/test_cases.py`:

```diff
--- a/backend/tests/api/test_cases.py
+++ b/backend/tests/api/test_cases.py
@@ -206,11 +206,11 @@ def _create(client, headers, **overrides):
     return response.json()
 
 
-def test_filter_cases_by_outcome(client, two_firms_two_users):
+def test_filter_cases_by_outcome(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     won = _create(client, headers, case_number="2026/701")
     _create(client, headers, case_number="2026/702")
-    client.patch(f"/cases/{won['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)
+    close_case(headers, won["id"], "won")
 
     response = client.get("/cases?outcome=won", headers=headers)
 
```

Modify `backend/tests/api/test_institutional_memory.py`:

```diff
--- a/backend/tests/api/test_institutional_memory.py
+++ b/backend/tests/api/test_institutional_memory.py
@@ -111,7 +111,7 @@ def test_archived_cases_remain_searchable_with_include_archived(client, two_firm
     assert results[0]["is_archived"] is True
 
 
-def test_closed_historical_case_outcome_is_retrievable(client, two_firms_two_users):
+def test_closed_historical_case_outcome_is_retrievable(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     created = client.post(
         "/cases",
@@ -120,11 +120,11 @@ def test_closed_historical_case_outcome_is_retrievable(client, two_firms_two_use
             "case_name": "Gecmis Dava",
             "client_name": "M",
             "case_type": "diger",
-            "status": "kapali",
+            "status": "devam_eden",
         },
         headers=headers,
     ).json()
-    client.patch(f"/cases/{created['id']}", json={"outcome": "won"}, headers=headers)
+    close_case(headers, created["id"], "won")
 
     response = client.get(f"/cases/{created['id']}", headers=headers)
     assert response.json()["outcome"] == "won"
```

Modify `backend/tests/api/test_reports.py`:

```diff
--- a/backend/tests/api/test_reports.py
+++ b/backend/tests/api/test_reports.py
@@ -88,10 +88,10 @@ def test_tasks_csv_has_turkish_status_labels(client, two_firms_two_users):
     assert any(line.startswith("Biten Gorev,") and line.endswith(",Tamamlandı") for line in lines)
 
 
-def test_performance_csv_starts_with_total_row(client, two_firms_two_users):
+def test_performance_csv_starts_with_total_row(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     case = _create_case(client, headers, case_number="2026/931")
-    client.patch(f"/cases/{case['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)
+    close_case(headers, case["id"], "won")
 
     lines = _csv_lines(client.get("/reports/performance.csv", headers=headers))
 
@@ -100,13 +100,13 @@ def test_performance_csv_starts_with_total_row(client, two_firms_two_users):
     assert lines[2] == "Diğer,1,1,0,100.0"
 
 
-def test_summary_matches_the_lists_it_links_to(client, two_firms_two_users):
+def test_summary_matches_the_lists_it_links_to(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     today = date.today()
     soon = _create_case(client, headers, case_number="2026/941",
                         next_hearing_date=(today + timedelta(days=3)).isoformat())
     _create_case(client, headers, case_number="2026/942")
-    client.patch(f"/cases/{soon['id']}", json={"outcome": "won"}, headers=headers)
+    close_case(headers, soon["id"], "won")
     client.post(f"/cases/{soon['id']}/tasks", json={"title": "Acik"}, headers=headers)
     done = client.post(f"/cases/{soon['id']}/tasks", json={"title": "Bitti"}, headers=headers).json()
     client.patch(f"/cases/{soon['id']}/tasks/{done['id']}", json={"status": "completed"}, headers=headers)
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_analytics.py tests/api/test_case_parties.py tests/api/test_case_update_rules.py tests/api/test_cases.py tests/api/test_institutional_memory.py tests/api/test_reports.py -q
```

Expected: FAIL —

```text
FAILED tests/api/test_case_update_rules.py::test_patch_cannot_close_a_case
FAILED tests/api/test_case_update_rules.py::test_patch_cannot_set_the_outcome
FAILED tests/api/test_case_update_rules.py::test_closing_and_outcome_together_report_the_closing_message
FAILED tests/api/test_case_update_rules.py::test_a_closed_case_rejects_a_status_but_accepts_other_edits
FAILED tests/api/test_case_update_rules.py::test_the_basic_fields_can_be_edited_and_cleared
... and 16 more
21 failed, 63 passed
```

- [ ] **Step 3: Implement**

Modify `backend/app/schemas/case.py`:

```diff
--- a/backend/app/schemas/case.py
+++ b/backend/app/schemas/case.py
@@ -6,6 +6,7 @@ from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_vali
 from app.models.case import CaseEventType, CaseOutcome, CaseStatus, CaseType, ClientRole, PartyRole
 
 PartyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
+CaseName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
 ClosingNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]
 
 
@@ -79,17 +80,26 @@ class CaseCreate(BaseModel):
         return self
 
 
+_REQUIRED_ON_UPDATE = ("case_name", "case_type", "status", "opening_date")
+
+
 class CaseUpdate(BaseModel):
-    case_name: Optional[str] = None
+    """PATCH /cases/{id}. `status` only moves between the open statuses and
+    `outcome` is not accepted at all (CaseLifecycleService.ensure_patch_allowed
+    answers those with their Turkish messages); the field stays here so that
+    sending it can be told apart from leaving it out."""
+
+    case_name: Optional[CaseName] = None
     client_name: Optional[str] = None
     opposing_party: Optional[str] = None
     case_type: Optional[CaseType] = None
-    court: Optional[str] = None
+    court: Optional[str] = Field(default=None, max_length=255)
     assigned_lawyer_id: Optional[str] = None
+    opening_date: Optional[date] = None
     next_hearing_date: Optional[date] = None
     status: Optional[CaseStatus] = None
     outcome: Optional[CaseOutcome] = None
-    case_value: Optional[float] = None
+    case_value: Optional[float] = Field(default=None, ge=0)
     description: Optional[str] = None
     client_role: Optional[ClientRole] = None
     court_file_number: Optional[str] = Field(default=None, max_length=100)
@@ -99,6 +109,19 @@ class CaseUpdate(BaseModel):
     defendant_position: Optional[str] = None
     parties: Optional[list[CasePartyIn]] = Field(default=None, min_length=1, max_length=20)
 
+    @field_validator("court")
+    @classmethod
+    def _blank_court_is_none(cls, value: Optional[str]) -> Optional[str]:
+        value = value.strip() if value else None
+        return value or None
+
+    @model_validator(mode="after")
+    def _required_fields_are_not_null(self):
+        for field in _REQUIRED_ON_UPDATE:
+            if field in self.model_fields_set and getattr(self, field) is None:
+                raise ValueError(f"{field} cannot be null")
+        return self
+
 
 class CaseClose(BaseModel):
     """POST /cases/{id}/close. The outcome is one of the three closing outcomes
```

Modify `backend/app/services/case_lifecycle.py`:

```diff
--- a/backend/app/services/case_lifecycle.py
+++ b/backend/app/services/case_lifecycle.py
@@ -10,7 +10,7 @@ from typing import Optional
 from sqlalchemy.orm import Session
 
 from app.models.case import Case, CaseEvent, CaseEventType, CaseOutcome, CaseStatus
-from app.schemas.case import CaseClose
+from app.schemas.case import CaseClose, CaseUpdate
 
 OUTCOME_LABELS = {
     CaseOutcome.WON: "Kazanıldı",
@@ -41,6 +41,16 @@ class CaseLifecycleService:
         self.db.refresh(case)
         return case
 
+    @staticmethod
+    def ensure_patch_allowed(case: Case, payload: CaseUpdate) -> None:
+        """PATCH edits the case; it neither closes nor reopens it and never sets the outcome."""
+        if payload.status == CaseStatus.KAPALI:
+            raise CaseStateError(422, "Davayı kapatmak için 'Davayı kapat' işlemini kullanın.")
+        if "outcome" in payload.model_fields_set:
+            raise CaseStateError(422, "Sonuç yalnızca dava kapatılırken girilebilir.")
+        if "status" in payload.model_fields_set and case.status == CaseStatus.KAPALI:
+            raise CaseStateError(422, "Kapalı davayı açmak için 'Yeniden aç' işlemini kullanın.")
+
     def close(self, case: Case, payload: CaseClose, closed_by: str, today: date) -> Case:
         if case.status == CaseStatus.KAPALI:
             raise CaseStateError(409, "Dava zaten kapalı.")
```

Modify `backend/app/api/routes/cases.py`:

```diff
--- a/backend/app/api/routes/cases.py
+++ b/backend/app/api/routes/cases.py
@@ -117,15 +117,16 @@ def get_case(
 def update_case(
     case_id: str,
     payload: CaseUpdate,
-    law_firm_id: str = Depends(get_current_law_firm_id),
+    current_user: User = Depends(get_current_user),
     db: Session = Depends(get_db),
 ):
     if "assigned_lawyer_id" in payload.model_fields_set:
         raise HTTPException(status_code=403, detail="Use admin case assignment to change the lawyer")
-    service = CaseService(db)
-    case = _get_owned_case_or_404(service, case_id, law_firm_id)
+    case = _managed_case(db, case_id, current_user)
+    require_case_writable(case)
+    _lifecycle(lambda: CaseLifecycleService.ensure_patch_allowed(case, payload))
     try:
-        return service.update_case(case, payload)
+        return CaseService(db).update_case(case, payload)
     except InvalidPartiesError as exc:
         raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
 
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_analytics.py tests/api/test_case_parties.py tests/api/test_case_update_rules.py tests/api/test_cases.py tests/api/test_institutional_memory.py tests/api/test_reports.py -q
```

Expected: PASS —

```text
84 passed
```

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (826 tests). The full backend suite takes several minutes (about ten at the end of the plan): run it in the background or with a long timeout.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/cases.py backend/app/schemas/case.py backend/app/services/case_lifecycle.py backend/tests/api/test_analytics.py backend/tests/api/test_case_parties.py backend/tests/api/test_case_update_rules.py backend/tests/api/test_cases.py backend/tests/api/test_institutional_memory.py backend/tests/api/test_reports.py
git commit -F - <<'EOF'
feat: PATCH /cases rejects closing, outcomes and reopening and checks permissions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 4: Archived cases are read-only

Every write endpoint that touches a case now refuses an archived one with 409 until it is unarchived. The exact list is Decision 3.

**Files:**
- Modify: `backend/app/api/case_access.py`
- Modify: `backend/app/api/routes/cases.py`
- Modify: `backend/app/api/routes/calendar.py`
- Modify: `backend/app/api/routes/documents.py`
- Modify: `backend/app/api/routes/tasks.py`
- Test (create): `backend/tests/api/test_archived_case_readonly.py`

**Interfaces:**
- Consumes: Task 2: `require_case_writable`; `CaseRepository.get_by_id_in_firm`.
- Produces: `require_case_id_writable(db, case_id: Optional[str], law_firm_id) -> None` in `app.api.case_access`; the guard on `POST /cases/{id}/events`, `POST /cases/{id}/tasks`, `PATCH /cases/{id}/tasks/{task_id}`, `PATCH /tasks/{task_id}`, `POST /cases/{id}/documents`, `DELETE /documents/{id}` and the calendar event create / update / delete routes.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_archived_case_readonly.py`:

```python
"""An archived case is read-only: everything that writes to the case or to its
tasks, documents, timeline and calendar events answers 409 until it is unarchived.
Reading, downloading, the AI analyses and the hand-over report stay available."""
import os
from types import SimpleNamespace

import pytest

ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
HEARING = "2099-03-10"


@pytest.fixture()
def world(client, office, auth_headers, close_case, tmp_path):
    """A lawyer's case with a task, a document and a linked hearing, closed and archived."""
    lawyer = auth_headers(office.lawyer_a1)
    case = client.post(
        "/cases",
        json={"case_number": "2026/1", "case_name": "Arşivlenecek", "client_name": "Müvekkil", "case_type": "kira"},
        headers=lawyer,
    ).json()
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Dilekçe hazırla"}, headers=lawyer).json()
    document = client.post(
        f"/cases/{case['id']}/documents", files={"file": ("not.txt", b"ilk not", "text/plain")}, headers=lawyer
    ).json()
    hearing = client.post(
        "/calendar/events",
        json={"title": "Duruşma", "event_type": "hearing", "starts_at": f"{HEARING}T10:00:00", "case_id": case["id"]},
        headers=lawyer,
    ).json()
    free_event = client.post(
        "/calendar/events", json={"title": "Toplantı", "event_type": "meeting", "starts_at": "2099-04-01T09:00:00"},
        headers=lawyer,
    ).json()
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["next_hearing_date"] == HEARING
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    return SimpleNamespace(
        lawyer=lawyer, admin=auth_headers(office.admin_a), case=case, task=task, document=document,
        hearing=hearing, free_event=free_event,
    )


def _stored_files():
    from app.core.config import settings

    return sorted(name for _, _, names in os.walk(settings.storage_dir) for name in names)


def _conflict(response):
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == ARCHIVED


# --- the case and its timeline --------------------------------------------------------------

def test_case_edits_and_events_are_refused(client, world):
    case_id = world.case["id"]
    for headers in (world.lawyer, world.admin):
        _conflict(client.patch(f"/cases/{case_id}", json={"case_name": "Yeni"}, headers=headers))
        _conflict(client.post(f"/cases/{case_id}/close", json={"outcome": "won", "decision_date": "2026-01-01"}, headers=headers))
        _conflict(client.post(f"/cases/{case_id}/reopen", headers=headers))
        _conflict(client.post(
            f"/cases/{case_id}/events", json={"event_date": "2026-05-01", "title": "Not"}, headers=headers
        ))
    detail = client.get(f"/cases/{case_id}", headers=world.lawyer).json()
    assert detail["case_name"] == "Arşivlenecek"
    assert [event["title"] for event in detail["timeline"]] == ["Dava kapatıldı — Kazanıldı"]


# --- tasks -------------------------------------------------------------------------------------

def test_tasks_cannot_be_created_or_changed(client, world):
    case_id, task_id = world.case["id"], world.task["id"]
    _conflict(client.post(f"/cases/{case_id}/tasks", json={"title": "Yeni görev"}, headers=world.lawyer))
    _conflict(client.patch(f"/cases/{case_id}/tasks/{task_id}", json={"status": "completed"}, headers=world.lawyer))
    # the firm-wide endpoint used by the calendar and the task list is guarded too
    _conflict(client.patch(f"/tasks/{task_id}", json={"status": "completed"}, headers=world.lawyer))
    _conflict(client.patch(f"/tasks/{task_id}", json={"reminder_days": [2]}, headers=world.admin))
    tasks = client.get(f"/cases/{case_id}/tasks", headers=world.lawyer).json()
    assert [(t["title"], t["status"]) for t in tasks] == [("Dilekçe hazırla", "pending")]
    assert [t["id"] for t in client.get("/tasks", headers=world.lawyer).json()] == [task_id]


# --- documents -----------------------------------------------------------------------------------

def test_documents_cannot_be_uploaded_or_deleted_but_can_be_read(client, world):
    case_id, document_id = world.case["id"], world.document["id"]
    stored_before = _stored_files()

    _conflict(client.post(
        f"/cases/{case_id}/documents", files={"file": ("yeni.txt", b"yeni", "text/plain")}, headers=world.lawyer
    ))
    _conflict(client.delete(f"/documents/{document_id}", headers=world.lawyer))

    documents = client.get(f"/cases/{case_id}/documents", headers=world.lawyer).json()
    assert [d["filename"] for d in documents] == ["not.txt"]
    download = client.get(f"/documents/{document_id}/download", headers=world.lawyer)
    assert download.status_code == 200 and download.content == b"ilk not"
    assert _stored_files() == stored_before and len(stored_before) == 1


# --- calendar events linked to the case ---------------------------------------------------------------

def test_calendar_events_of_the_case_are_frozen_and_the_hearing_date_stays(client, world):
    case_id = world.case["id"]
    event_id = world.hearing["id"]

    earlier = {
        "title": "Yeni duruşma", "event_type": "hearing", "starts_at": "2098-01-05T10:00:00", "case_id": case_id,
    }
    _conflict(client.post("/calendar/events", json=earlier, headers=world.lawyer))
    _conflict(client.patch(f"/calendar/events/{event_id}", json={"starts_at": "2098-01-05T10:00:00"}, headers=world.lawyer))
    _conflict(client.patch(f"/calendar/events/{event_id}", json={"case_id": None}, headers=world.lawyer))
    _conflict(client.patch(f"/calendar/events/{event_id}", json={"reminder_days": [5]}, headers=world.admin))
    _conflict(client.delete(f"/calendar/events/{event_id}", headers=world.lawyer))

    assert client.get(f"/calendar/events/{event_id}", headers=world.lawyer).json()["starts_at"] == f"{HEARING}T10:00:00"
    assert client.get(f"/cases/{case_id}", headers=world.lawyer).json()["next_hearing_date"] == HEARING
    items = client.get("/calendar", params={"from": HEARING, "to": HEARING}, headers=world.lawyer).json()
    assert [item["title"] for item in items if item["kind"] == "event"] == ["Duruşma"]


def test_an_event_cannot_be_moved_onto_an_archived_case(client, world):
    free_id = world.free_event["id"]
    _conflict(client.patch(f"/calendar/events/{free_id}", json={"case_id": world.case["id"]}, headers=world.lawyer))
    assert client.get(f"/calendar/events/{free_id}", headers=world.lawyer).json()["case_id"] is None


def test_calendar_events_without_the_case_are_not_affected(client, world):
    free_id = world.free_event["id"]
    created = client.post(
        "/calendar/events", json={"title": "Başka", "event_type": "other", "starts_at": "2099-05-01T09:00:00"},
        headers=world.lawyer,
    )
    assert created.status_code == 201
    assert client.patch(f"/calendar/events/{free_id}", json={"title": "Taşındı"}, headers=world.lawyer).status_code == 200
    assert client.delete(f"/calendar/events/{free_id}", headers=world.lawyer).status_code == 204


# --- what stays open -------------------------------------------------------------------------------------

def test_reading_and_analysis_stay_available(client, world):
    case_id = world.case["id"]
    assert client.get(f"/cases/{case_id}", headers=world.lawyer).status_code == 200
    assert client.post(f"/cases/{case_id}/handover", headers=world.lawyer).status_code == 201
    assert client.post(f"/cases/{case_id}/simulations", headers=world.lawyer).status_code == 202


def test_unarchive_is_allowed_and_restores_every_write(client, world):
    case_id, task_id = world.case["id"], world.task["id"]
    assert client.post(f"/cases/{case_id}/unarchive", headers=world.lawyer).status_code == 200

    assert client.patch(f"/cases/{case_id}", json={"case_name": "Yeni"}, headers=world.lawyer).status_code == 200
    assert client.post(f"/cases/{case_id}/tasks", json={"title": "Yeni görev"}, headers=world.lawyer).status_code == 201
    assert client.patch(f"/tasks/{task_id}", json={"status": "completed"}, headers=world.lawyer).status_code == 200
    assert client.post(
        f"/cases/{case_id}/documents", files={"file": ("yeni.txt", b"yeni", "text/plain")}, headers=world.lawyer
    ).status_code == 201
    assert client.post(
        f"/cases/{case_id}/events", json={"event_date": "2026-05-01", "title": "Not"}, headers=world.lawyer
    ).status_code == 201
    assert client.delete(f"/calendar/events/{world.hearing['id']}", headers=world.lawyer).status_code == 204
    assert client.post(f"/cases/{case_id}/reopen", headers=world.lawyer).status_code == 200


# --- order of the checks ---------------------------------------------------------------------------------------

def test_another_firm_still_gets_a_404_not_a_409(client, office, auth_headers, world):
    foreign = auth_headers(office.admin_b)
    case_id = world.case["id"]
    assert client.post(f"/cases/{case_id}/tasks", json={"title": "X"}, headers=foreign).status_code == 404
    assert client.patch(f"/tasks/{world.task['id']}", json={"status": "completed"}, headers=foreign).status_code == 404
    assert client.delete(f"/documents/{world.document['id']}", headers=foreign).status_code == 404
    assert client.post(
        f"/cases/{case_id}/documents", files={"file": ("x.txt", b"x", "text/plain")}, headers=foreign
    ).status_code == 404
    assert client.post(
        "/calendar/events", json={"title": "X", "event_type": "other", "starts_at": "2099-05-01T09:00:00", "case_id": case_id},
        headers=foreign,
    ).status_code == 404
    assert client.patch(f"/calendar/events/{world.hearing['id']}", json={"title": "X"}, headers=foreign).status_code == 404


def test_adding_events_tasks_and_documents_stays_open_to_the_whole_firm(client, office, auth_headers):
    owner = auth_headers(office.lawyer_a1)
    colleague = auth_headers(office.lawyer_a2)
    case = client.post(
        "/cases",
        json={"case_number": "2026/9", "case_name": "Açık dava", "client_name": "Müvekkil", "case_type": "kira"},
        headers=owner,
    ).json()

    assert client.post(
        f"/cases/{case['id']}/events", json={"event_date": "2026-05-01", "title": "Not"}, headers=colleague
    ).status_code == 201
    task = client.post(f"/cases/{case['id']}/tasks", json={"title": "Görev"}, headers=colleague)
    assert task.status_code == 201
    assert client.patch(f"/tasks/{task.json()['id']}", json={"status": "completed"}, headers=colleague).status_code == 200
    assert client.post(
        f"/cases/{case['id']}/documents", files={"file": ("a.txt", b"a", "text/plain")}, headers=colleague
    ).status_code == 201
    # ... but changing the case itself stays with the responsible lawyer and the admins
    assert client.patch(f"/cases/{case['id']}", json={"case_name": "X"}, headers=colleague).status_code == 403
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_archived_case_readonly.py -q
```

Expected: FAIL —

```text
FAILED tests/api/test_archived_case_readonly.py::test_case_edits_and_events_are_refused
FAILED tests/api/test_archived_case_readonly.py::test_tasks_cannot_be_created_or_changed
FAILED tests/api/test_archived_case_readonly.py::test_documents_cannot_be_uploaded_or_deleted_but_can_be_read
FAILED tests/api/test_archived_case_readonly.py::test_calendar_events_of_the_case_are_frozen_and_the_hearing_date_stays
FAILED tests/api/test_archived_case_readonly.py::test_an_event_cannot_be_moved_onto_an_archived_case
5 failed, 5 passed
```

- [ ] **Step 3: Implement**

Modify `backend/app/api/case_access.py`:

```diff
--- a/backend/app/api/case_access.py
+++ b/backend/app/api/case_access.py
@@ -8,11 +8,17 @@ this) and then:
     require_case_writable(case)        409 when the case is archived
 
 The order matters: a stranger gets the 403 even when the state would be a 409.
+Routes that only know a child row (a task, a document, a calendar event) use
+require_case_id_writable.
 """
+from typing import Optional
+
 from fastapi import HTTPException, status
+from sqlalchemy.orm import Session
 
 from app.models.case import Case
 from app.models.user import User, UserRole
+from app.repositories.case_repository import CaseRepository
 
 NOT_CASE_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
 CASE_ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
@@ -34,3 +40,14 @@ def require_case_manager(user: User, case: Case) -> None:
 def require_case_writable(case: Case) -> None:
     if case.is_archived:
         raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CASE_ARCHIVED)
+
+
+def require_case_id_writable(db: Session, case_id: Optional[str], law_firm_id: str) -> None:
+    """For endpoints that reach a case through one of its children. No case, or
+    a case of another firm, is not this helper's business: the endpoint answers
+    404 for it as it did before."""
+    if case_id is None:
+        return
+    case = CaseRepository(db).get_by_id_in_firm(case_id, law_firm_id)
+    if case is not None:
+        require_case_writable(case)
```

Modify `backend/app/api/routes/cases.py`:

```diff
--- a/backend/app/api/routes/cases.py
+++ b/backend/app/api/routes/cases.py
@@ -184,4 +184,5 @@ def add_case_event(
 ):
     service = CaseService(db)
     case = _get_owned_case_or_404(service, case_id, law_firm_id)
+    require_case_writable(case)
     return service.add_event(case, payload, created_by=current_user.id)
```

Modify `backend/app/api/routes/calendar.py`:

```diff
--- a/backend/app/api/routes/calendar.py
+++ b/backend/app/api/routes/calendar.py
@@ -11,6 +11,7 @@ from typing import Optional
 from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
 from sqlalchemy.orm import Session
 
+from app.api.case_access import require_case_id_writable
 from app.api.deps import get_current_law_firm_id, get_current_user
 from app.core.timeutil import local_today
 from app.db.session import get_db
@@ -63,6 +64,7 @@ def create_calendar_event(
     current_user: User = Depends(get_current_user),
     db: Session = Depends(get_db),
 ):
+    require_case_id_writable(db, payload.case_id, current_user.law_firm_id)
     try:
         return CalendarService(db).create_event(
             current_user.law_firm_id, current_user.id, payload, today=local_today()
@@ -91,6 +93,9 @@ def update_calendar_event(
 ):
     service = CalendarService(db)
     event = _owned_event_or_404(service, event_id, law_firm_id)
+    # Both the case the event belongs to and the case it is being moved to must be writable.
+    require_case_id_writable(db, event.case_id, law_firm_id)
+    require_case_id_writable(db, payload.case_id, law_firm_id)
     try:
         return service.update_event(event, payload, today=local_today())
     except CalendarReferenceNotFound as exc:
@@ -106,5 +111,7 @@ def delete_calendar_event(
     db: Session = Depends(get_db),
 ):
     service = CalendarService(db)
-    service.delete_event(_owned_event_or_404(service, event_id, law_firm_id), today=local_today())
+    event = _owned_event_or_404(service, event_id, law_firm_id)
+    require_case_id_writable(db, event.case_id, law_firm_id)
+    service.delete_event(event, today=local_today())
     return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Modify `backend/app/api/routes/documents.py`:

```diff
--- a/backend/app/api/routes/documents.py
+++ b/backend/app/api/routes/documents.py
@@ -2,6 +2,7 @@ from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
 from fastapi.responses import FileResponse
 from sqlalchemy.orm import Session
 
+from app.api.case_access import require_case_id_writable, require_case_writable
 from app.api.deps import get_current_law_firm_id, get_current_user
 from app.core.config import settings
 from app.db.session import get_db
@@ -29,7 +30,8 @@ async def upload_document(
     current_user: User = Depends(get_current_user),
     db: Session = Depends(get_db),
 ):
-    _get_owned_case_or_404(db, case_id, law_firm_id)
+    case = _get_owned_case_or_404(db, case_id, law_firm_id)
+    require_case_writable(case)
     raw_bytes = await file.read()
     if len(raw_bytes) > settings.max_upload_size_bytes:
         raise HTTPException(
@@ -107,4 +109,5 @@ def delete_document(
     document = service.get(document_id, law_firm_id)
     if document is None:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
+    require_case_id_writable(db, document.case_id, law_firm_id)
     service.delete(document)
```

Modify `backend/app/api/routes/tasks.py`:

```diff
--- a/backend/app/api/routes/tasks.py
+++ b/backend/app/api/routes/tasks.py
@@ -9,6 +9,7 @@ from typing import Optional
 from fastapi import APIRouter, Depends, HTTPException, Query, status
 from sqlalchemy.orm import Session
 
+from app.api.case_access import require_case_id_writable, require_case_writable
 from app.api.deps import get_current_law_firm_id, get_current_user
 from app.db.session import get_db
 from app.models.task import TaskStatus
@@ -38,6 +39,7 @@ def create_task(
     db: Session = Depends(get_db),
 ):
     case = _get_owned_case_or_404(db, case_id, law_firm_id)
+    require_case_writable(case)
     try:
         return TaskService(db).create_task(case, payload, created_by=current_user.id)
     except AssigneeNotFound as exc:
@@ -64,11 +66,12 @@ def update_case_task(
     law_firm_id: str = Depends(get_current_law_firm_id),
     db: Session = Depends(get_db),
 ):
-    _get_owned_case_or_404(db, case_id, law_firm_id)
+    case = _get_owned_case_or_404(db, case_id, law_firm_id)
     service = TaskService(db)
     task = service.get(task_id, law_firm_id)
     if task is None or task.case_id != case_id:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
+    require_case_writable(case)
     try:
         return service.update_task(task, payload)
     except AssigneeNotFound as exc:
@@ -106,6 +109,7 @@ def update_task(
     task = service.get(task_id, law_firm_id)
     if task is None:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Görev bulunamadı")
+    require_case_id_writable(db, task.case_id, law_firm_id)
     try:
         return service.update_task(task, payload)
     except AssigneeNotFound as exc:
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest tests/api/test_archived_case_readonly.py -q
```

Expected: PASS —

```text
10 passed
```

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: PASS — no failures (836 tests). The full backend suite takes several minutes (about ten at the end of the plan): run it in the background or with a long timeout.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/case_access.py backend/app/api/routes/calendar.py backend/app/api/routes/cases.py backend/app/api/routes/documents.py backend/app/api/routes/tasks.py backend/tests/api/test_archived_case_readonly.py
git commit -F - <<'EOF'
feat: archived cases are read-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 5: Lifecycle API client, access rules and Sulh labels (frontend)

The frontend building blocks the next tasks use: types, three new API calls, the pure `caseActions` rule behind the `İşlemler` menu, and the unified `Sulh` naming. No screen changes except the analytics wording.

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/caseAccess.ts`
- Modify: `frontend/src/lib/filters.ts`
- Modify: `frontend/src/lib/labels.ts`
- Modify: `frontend/src/components/AnalyticsView.tsx`
- Test (modify): `frontend/src/components/__tests__/AnalyticsView.test.tsx`
- Test (modify): `frontend/src/lib/__tests__/api.test.ts`
- Test (create): `frontend/src/lib/__tests__/caseAccess.test.ts`
- Test (create): `frontend/src/lib/__tests__/labels.test.ts`

**Interfaces:**
- Consumes: Task 2–4 endpoints; existing `request()` helper, `Case` / `AppUser` types, `CASE_OUTCOME_LABELS`.
- Produces: Types `OpenCaseStatus`, `ClosingOutcome`, `CaseClosePayload`, `Case.decision_date` / `Case.closing_note`, wider `CaseUpdatePayload`; `closeCase(id, payload)`, `reopenCase(id)`, `unarchiveCase(id)` (`archiveCase` already existed); `OPEN_CASE_STATUSES` in `filters.ts`; `canManageCase(me, case)`, `CaseAction`, `CASE_ACTION_LABELS`, `caseActions(me, case)` in `lib/caseAccess.ts`; `CASE_OUTCOME_LABELS` = `Devam ediyor` / `Kazanıldı` / `Kaybedildi` / `Sulh`.

- [ ] **Step 1: Write the failing tests**

Modify `frontend/src/components/__tests__/AnalyticsView.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/AnalyticsView.test.tsx
+++ b/frontend/src/components/__tests__/AnalyticsView.test.tsx
@@ -39,6 +39,8 @@ describe("AnalyticsView", () => {
     await waitFor(() => expect(screen.getByText("108")).toBeInTheDocument());
     expect(screen.getByText("%69.77")).toBeInTheDocument();
     expect(screen.getByText("60 ÷ (60 + 26) × 100 = %69.77")).toBeInTheDocument();
+    expect(screen.getByText(/Devam eden ve sulhla kapanan davalar paydaya girmez/)).toBeInTheDocument();
+    expect(screen.queryByText(/uzlaş/i)).not.toBeInTheDocument();
   });
 
   it("renders zeros (not an error) for an empty dataset", async () => {
```

Modify `frontend/src/lib/__tests__/api.test.ts`:

```diff
--- a/frontend/src/lib/__tests__/api.test.ts
+++ b/frontend/src/lib/__tests__/api.test.ts
@@ -203,4 +203,29 @@ describe("case intake API", () => {
     expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
     expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ parties });
   });
+  it("closes, reopens, archives and unarchives a case with the lifecycle endpoints", async () => {
+    window.localStorage.setItem("casebridge_token", "t");
+    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "c1" }) });
+    global.fetch = fetchMock as unknown as typeof fetch;
+
+    const { archiveCase, closeCase, reopenCase, unarchiveCase } = await import("@/lib/api");
+    await closeCase("c1", { outcome: "settled", decision_date: "2026-10-01", note: "Sulh protokolü" });
+    await reopenCase("c1");
+    await archiveCase("c1");
+    await unarchiveCase("c1");
+
+    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), init.method]);
+    expect(calls).toEqual([
+      ["http://localhost:8000/cases/c1/close", "POST"],
+      ["http://localhost:8000/cases/c1/reopen", "POST"],
+      ["http://localhost:8000/cases/c1/archive", "POST"],
+      ["http://localhost:8000/cases/c1/unarchive", "POST"],
+    ]);
+    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
+      outcome: "settled",
+      decision_date: "2026-10-01",
+      note: "Sulh protokolü",
+    });
+    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
+  });
 });
```

Create `frontend/src/lib/__tests__/caseAccess.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CASE_ACTION_LABELS, canManageCase, caseActions } from "@/lib/caseAccess";

const admin = { id: "u-admin", role: "admin" as const };
const owner = { id: "u-owner", role: "lawyer" as const };
const colleague = { id: "u-colleague", role: "lawyer" as const };

const open = { assigned_lawyer_id: "u-owner", status: "devam_eden" as const, is_archived: false };
const closed = { ...open, status: "kapali" as const };
const archived = { ...closed, is_archived: true };

describe("canManageCase", () => {
  it("allows the responsible lawyer and admins only", () => {
    expect(canManageCase(owner, open)).toBe(true);
    expect(canManageCase(admin, open)).toBe(true);
    expect(canManageCase(colleague, open)).toBe(false);
  });

  it("leaves a case without a responsible lawyer to the admins", () => {
    const orphan = { ...open, assigned_lawyer_id: null };
    expect(canManageCase(admin, orphan)).toBe(true);
    expect(canManageCase(owner, orphan)).toBe(false);
  });

  it("allows nobody until the user is known", () => {
    expect(canManageCase(null, open)).toBe(false);
  });
});

describe("caseActions", () => {
  it("offers edit and close on an open case", () => {
    expect(caseActions(owner, open)).toEqual(["edit", "close"]);
    expect(caseActions(admin, { ...open, status: "karar_bekleyen" })).toEqual(["edit", "close"]);
  });

  it("offers edit, reopen and archive on a closed case that is not archived", () => {
    expect(caseActions(owner, closed)).toEqual(["edit", "reopen", "archive"]);
  });

  it("offers only unarchive on an archived case", () => {
    expect(caseActions(owner, archived)).toEqual(["unarchive"]);
    expect(caseActions(admin, archived)).toEqual(["unarchive"]);
  });

  it("offers nothing to a user who may not manage the case", () => {
    expect(caseActions(colleague, open)).toEqual([]);
    expect(caseActions(colleague, closed)).toEqual([]);
    expect(caseActions(colleague, archived)).toEqual([]);
    expect(caseActions(null, open)).toEqual([]);
  });

  it("labels every action exactly", () => {
    expect(CASE_ACTION_LABELS).toEqual({
      edit: "Bilgileri düzenle",
      close: "Davayı kapat",
      reopen: "Yeniden aç",
      archive: "Arşivle",
      unarchive: "Arşivden çıkar",
    });
  });
});
```

Create `frontend/src/lib/__tests__/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { OPEN_CASE_STATUSES, OUTCOME_SLUG_LABELS, OUTCOME_SLUGS } from "@/lib/filters";
import { CASE_OUTCOME_LABELS } from "@/lib/labels";

describe("outcome labels", () => {
  it("uses the same four words everywhere, with Sulh instead of Uzlaşma", () => {
    expect(CASE_OUTCOME_LABELS).toEqual({
      ongoing: "Devam ediyor",
      won: "Kazanıldı",
      lost: "Kaybedildi",
      settled: "Sulh",
    });
    expect(OUTCOME_SLUG_LABELS.sulh).toBe("Sulh");
    expect(OUTCOME_SLUGS.sulh).toBe("settled");
    expect(JSON.stringify([CASE_OUTCOME_LABELS, OUTCOME_SLUG_LABELS])).not.toMatch(/uzla/i);
  });
});

describe("open statuses", () => {
  it("are the three statuses a case can be edited between", () => {
    expect(OPEN_CASE_STATUSES).toEqual(["devam_eden", "durusma_bekleyen", "karar_bekleyen"]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/AnalyticsView.test.tsx src/lib/__tests__/api.test.ts src/lib/__tests__/caseAccess.test.ts src/lib/__tests__/labels.test.ts
```

Expected: FAIL —

```text
FAIL src/lib/__tests__/caseAccess.test.ts
FAIL src/components/__tests__/AnalyticsView.test.tsx
FAIL src/lib/__tests__/api.test.ts
FAIL src/lib/__tests__/labels.test.ts
Error: Failed to resolve import "@/lib/caseAccess" from "src/lib/__tests__/caseAccess.test.ts". Does the file exist?
TestingLibraryElementError: Unable to find an element with the text: /Devam eden ve sulhla kapanan davalar paydaya girmez/. This could be because the text is broken up by
Test Files 4 failed (4)
Tests 4 failed | 14 passed (18)
```

- [ ] **Step 3: Implement**

Modify `frontend/src/types/index.ts`:

```diff
--- a/frontend/src/types/index.ts
+++ b/frontend/src/types/index.ts
@@ -1,6 +1,10 @@
 export type CaseType = "is_hukuku" | "ticaret_hukuku" | "sozlesme" | "kira" | "icra" | "diger";
 export type CaseStatus = "devam_eden" | "durusma_bekleyen" | "karar_bekleyen" | "kapali";
 export type CaseOutcome = "ongoing" | "won" | "lost" | "settled";
+/** The statuses a case can be edited between; "kapali" is reached only by closing. */
+export type OpenCaseStatus = Exclude<CaseStatus, "kapali">;
+/** What a case is closed with ("ongoing" is not a way to close). */
+export type ClosingOutcome = Exclude<CaseOutcome, "ongoing">;
 
 export type PartyRole = "plaintiff" | "defendant" | "intervener" | "other";
 export type ClientRole = "plaintiff" | "defendant" | "other";
@@ -29,6 +33,9 @@ export interface Case {
   next_hearing_date: string | null;
   status: CaseStatus;
   outcome: CaseOutcome;
+  /** Set when the case is closed (YYYY-MM-DD); empty for cases closed before the close action existed. */
+  decision_date: string | null;
+  closing_note: string | null;
   case_value: number | null;
   description: string | null;
   client_role: ClientRole | null;
@@ -73,10 +80,30 @@ export interface CasePayload {
   assigned_lawyer_id?: string;
 }
 
-/** PATCH /cases/{id}: any subset; null clears a text field. */
+/** PATCH /cases/{id}: any subset; null clears an optional field. The status is one of the open statuses and is not sent for a closed case. */
 export type CaseUpdatePayload = Partial<
-  Pick<Case, "court_file_number" | "claim" | "facts_summary" | "plaintiff_position" | "defendant_position" | "description">
-> & { parties?: CasePartyPayload[] };
+  Pick<
+    Case,
+    | "court"
+    | "court_file_number"
+    | "case_value"
+    | "claim"
+    | "facts_summary"
+    | "plaintiff_position"
+    | "defendant_position"
+    | "description"
+  >
+> &
+  Partial<{ case_name: string; case_type: CaseType; opening_date: string; status: OpenCaseStatus }> & {
+    parties?: CasePartyPayload[];
+  };
+
+/** POST /cases/{id}/close. */
+export interface CaseClosePayload {
+  outcome: ClosingOutcome;
+  decision_date: string;
+  note?: string;
+}
 
 export interface CaseIntakeParty {
   name: string;
```

Modify `frontend/src/lib/api.ts`:

```diff
--- a/frontend/src/lib/api.ts
+++ b/frontend/src/lib/api.ts
@@ -5,6 +5,7 @@ import type {
   ChatStatus,
   AnalyticsOverview,
   Case,
+  CaseClosePayload,
   CaseDetail,
   CaseEvent,
   CaseEventType,
@@ -292,10 +293,22 @@ export async function updateCase(id: string, payload: CaseUpdatePayload): Promis
   return request(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
 }
 
+export async function closeCase(id: string, payload: CaseClosePayload): Promise<Case> {
+  return request(`/cases/${id}/close`, { method: "POST", body: JSON.stringify(payload) });
+}
+
+export async function reopenCase(id: string): Promise<Case> {
+  return request(`/cases/${id}/reopen`, { method: "POST" });
+}
+
 export async function archiveCase(id: string): Promise<Case> {
   return request(`/cases/${id}/archive`, { method: "POST" });
 }
 
+export async function unarchiveCase(id: string): Promise<Case> {
+  return request(`/cases/${id}/unarchive`, { method: "POST" });
+}
+
 export async function addCaseEvent(
   caseId: string,
   payload: { event_date: string; title: string; description?: string; event_type?: CaseEventType | string }
```

Create `frontend/src/lib/caseAccess.ts`:

```ts
import type { AppUser, Case } from "@/types";

/**
 * Who may change a case: the responsible lawyer and admins. A case without a
 * responsible lawyer belongs to the admins. This only decides what the page
 * shows; the backend (app/api/case_access.py) answers 403 whatever the page does.
 */
export function canManageCase(
  me: Pick<AppUser, "id" | "role"> | null,
  item: Pick<Case, "assigned_lawyer_id">,
): boolean {
  if (!me) return false;
  return me.role === "admin" || (item.assigned_lawyer_id !== null && item.assigned_lawyer_id === me.id);
}

export type CaseAction = "edit" | "close" | "reopen" | "archive" | "unarchive";

export const CASE_ACTION_LABELS: Record<CaseAction, string> = {
  edit: "Bilgileri düzenle",
  close: "Davayı kapat",
  reopen: "Yeniden aç",
  archive: "Arşivle",
  unarchive: "Arşivden çıkar",
};

/** The entries of the "İşlemler" menu, in menu order; empty for a user who may not manage the case. */
export function caseActions(
  me: Pick<AppUser, "id" | "role"> | null,
  item: Pick<Case, "assigned_lawyer_id" | "status" | "is_archived">,
): CaseAction[] {
  if (!canManageCase(me, item)) return [];
  if (item.is_archived) return ["unarchive"];
  if (item.status === "kapali") return ["edit", "reopen", "archive"];
  return ["edit", "close"];
}
```

Modify `frontend/src/lib/filters.ts`:

```diff
--- a/frontend/src/lib/filters.ts
+++ b/frontend/src/lib/filters.ts
@@ -6,12 +6,14 @@
  */
 import type { CaseListFilters } from "@/lib/api";
 import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
-import type { CaseOutcome, CaseStatus, CaseType, DocumentItem, DocumentWithCase, TaskWithCase } from "@/types";
+import type { CaseOutcome, CaseStatus, CaseType, DocumentItem, DocumentWithCase, OpenCaseStatus, TaskWithCase } from "@/types";
 
 type ParamSource = { get(name: string): string | null };
 
 export const CASE_TYPES: CaseType[] = ["is_hukuku", "ticaret_hukuku", "sozlesme", "kira", "icra", "diger"];
 export const CASE_STATUSES: CaseStatus[] = ["devam_eden", "durusma_bekleyen", "karar_bekleyen", "kapali"];
+/** The statuses a case can be created with and edited between ("kapali" only through the close action). */
+export const OPEN_CASE_STATUSES: OpenCaseStatus[] = ["devam_eden", "durusma_bekleyen", "karar_bekleyen"];
 
 export const OUTCOME_SLUGS = {
   kazanilan: "won",
@@ -25,7 +27,7 @@ const OUTCOME_SLUG_VALUES = Object.keys(OUTCOME_SLUGS) as OutcomeSlug[];
 export const OUTCOME_SLUG_LABELS: Record<OutcomeSlug, string> = {
   kazanilan: "Kazanılan",
   kaybedilen: "Kaybedilen",
-  sulh: "Uzlaşma",
+  sulh: "Sulh",
   devam: "Devam Eden",
 };
 
```

Modify `frontend/src/lib/labels.ts`:

```diff
--- a/frontend/src/lib/labels.ts
+++ b/frontend/src/lib/labels.ts
@@ -15,10 +15,10 @@ export const CASE_STATUS_LABELS: Record<string, string> = {
 };
 
 export const CASE_OUTCOME_LABELS: Record<string, string> = {
-  ongoing: "Devam Ediyor",
+  ongoing: "Devam ediyor",
   won: "Kazanıldı",
   lost: "Kaybedildi",
-  settled: "Uzlaşma",
+  settled: "Sulh",
 };
 
 export const SIMULATION_STATUS_LABELS: Record<string, string> = {
```

Modify `frontend/src/components/AnalyticsView.tsx`:

```diff
--- a/frontend/src/components/AnalyticsView.tsx
+++ b/frontend/src/components/AnalyticsView.tsx
@@ -68,7 +68,7 @@ export function AnalyticsView() {
 
       <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
         <h2 className="text-sm font-semibold text-navy-800">Kazanma oranı nasıl hesaplanır?</h2>
-        <p className="mt-2 text-sm text-navy-700">Kazanılan dava sayısı ÷ (kazanılan + kaybedilen dava sayısı) × 100. Devam eden ve uzlaşmayla kapanan davalar paydaya girmez. Arşivdeki davalar dahildir; bu oran bir tahmin veya hukuki başarı garantisi değildir.</p>
+        <p className="mt-2 text-sm text-navy-700">Kazanılan dava sayısı ÷ (kazanılan + kaybedilen dava sayısı) × 100. Devam eden ve sulhla kapanan davalar paydaya girmez. Arşivdeki davalar dahildir; bu oran bir tahmin veya hukuki başarı garantisi değildir.</p>
         <p className="mt-2 text-sm font-medium text-navy-900">{overview.won_cases} ÷ ({overview.won_cases} + {overview.lost_cases}) × 100 = %{overview.win_rate}</p>
         {overview.won_cases + overview.lost_cases === 0 && <p className="mt-1 text-xs text-navy-500">Henüz karara bağlanmış kazanılan veya kaybedilen dava yok; oran %0 olarak gösterilir.</p>}
       </section>
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/AnalyticsView.test.tsx src/lib/__tests__/api.test.ts src/lib/__tests__/caseAccess.test.ts src/lib/__tests__/labels.test.ts
cd frontend && npx tsc --noEmit
```

Expected: PASS —

```text
Test Files 4 passed (4)
Tests 26 passed (26)
```

`tsc` prints nothing.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
```

Expected: PASS — no failures (490 tests in 54 files); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AnalyticsView.tsx frontend/src/components/__tests__/AnalyticsView.test.tsx frontend/src/lib/__tests__/api.test.ts frontend/src/lib/__tests__/caseAccess.test.ts frontend/src/lib/__tests__/labels.test.ts frontend/src/lib/api.ts frontend/src/lib/caseAccess.ts frontend/src/lib/filters.ts frontend/src/lib/labels.ts frontend/src/types/index.ts
git commit -F - <<'EOF'
feat: case lifecycle API client, access rules and Sulh labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 6: Case header badges, İşlemler menu and the edit dialog (frontend)

The case page header gets status / outcome badges and the `İşlemler` menu (visible only to the responsible lawyer and administrators); `Bilgileri düzenle` opens a dialog built from the shared case-form fields. The menu already lists every action of the spec; this task wires `edit` and `unarchive`, Task 7 wires close / reopen / archive.

**Files:**
- Modify: `frontend/src/lib/caseIntake.ts`
- Modify: `frontend/src/components/case-form/BasicInfoFields.tsx`
- Modify: `frontend/src/components/ModalFrame.tsx`
- Create: `frontend/src/components/CaseActionsMenu.tsx`
- Create: `frontend/src/components/CaseEditModal.tsx`
- Create: `frontend/src/components/CaseHeader.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx`
- Test (create): `frontend/src/components/__tests__/CaseActionsMenu.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseDetailActions.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseDetailView.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseEditModal.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseFormSections.test.tsx`
- Test (modify): `frontend/src/lib/__tests__/caseIntake.test.ts`

**Interfaces:**
- Consumes: Task 5 (`caseActions`, `CaseAction`, `OPEN_CASE_STATUSES`, `updateCase`, `unarchiveCase`); existing `ModalFrame`, `BasicInfoFields`, `Field`, `userMessage`, `getMe`.
- Produces: `ModalFrame` props `wide?: boolean` and the `data-autofocus` hook; `BasicInfoFields` props `caseNumberReadOnly?`, `statuses?: readonly OpenCaseStatus[] | null` (default: the three open statuses, `null` hides `Durum`), `focusName?`; `CaseFormState.status: OpenCaseStatus`; `formFromCase` fills the basic-info fields; `validateBasicInfo(form)`, `hasBasicInfoErrors(errors)`, `buildBasicInfoPayload(form, {includeStatus})` in `caseIntake.ts`; components `CaseActionsMenu({actions, busy, onPick})`, `CaseHeader({caseDetail, actions, busy, actionError, onPick})`, `CaseEditModal({caseDetail, onClose, onSaved})`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/CaseActionsMenu.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaseActionsMenu } from "@/components/CaseActionsMenu";

describe("CaseActionsMenu", () => {
  it("renders nothing when there is no action", () => {
    const { container } = render(<CaseActionsMenu actions={[]} busy={false} onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the actions with their labels once opened", async () => {
    render(<CaseActionsMenu actions={["edit", "reopen", "archive"]} busy={false} onPick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "İşlemler" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Bilgileri düzenle",
      "Yeniden aç",
      "Arşivle",
    ]);
  });

  it("reports the picked action, closes the menu and puts focus back on the button", async () => {
    const onPick = vi.fn();
    render(<CaseActionsMenu actions={["edit", "close"]} busy={false} onPick={onPick} />);
    const trigger = screen.getByRole("button", { name: "İşlemler" });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Davayı kapat" }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("close");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and returns focus to the button", async () => {
    render(<CaseActionsMenu actions={["unarchive"]} busy={false} onPick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "İşlemler" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("ignores a pick while an action is running (aria-disabled, not disabled)", async () => {
    const onPick = vi.fn();
    render(<CaseActionsMenu actions={["unarchive"]} busy onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "İşlemler" }));

    const item = screen.getByRole("menuitem", { name: "Arşivden çıkar" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toBeDisabled();
    await userEvent.click(item);

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
```

Create `frontend/src/components/__tests__/CaseDetailActions.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const getMe = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const listCaseTasks = vi.fn();
const updateCase = vi.fn();
const unarchiveCase = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  updateCase: (...args: unknown[]) => updateCase(...args),
  unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
  startSimulation: vi.fn(),
  getSimulation: vi.fn(),
  retrySimulation: vi.fn(),
  uploadDocument: vi.fn(),
  addCaseEvent: vi.fn(),
  generateHandover: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

import { CaseDetailView } from "@/components/CaseDetailView";
import { ApiError } from "@/lib/apiError";

const owner = { id: "u-owner", role: "lawyer", full_name: "Ayşe Avukat" };
const colleague = { id: "u-colleague", role: "lawyer", full_name: "Mehmet Avukat" };
const admin = { id: "u-admin", role: "admin", full_name: "Yönetici" };

const baseCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Sözleşmenin Feshi Davası",
  client_name: "Deniz Arslan",
  opposing_party: "Mavi Yapı A.Ş.",
  case_type: "sozlesme",
  court: "İstanbul 2. Asliye Hukuk Mahkemesi",
  court_file_number: null,
  assigned_lawyer_id: "u-owner",
  opening_date: "2026-01-12",
  next_hearing_date: null,
  status: "devam_eden",
  outcome: "ongoing",
  decision_date: null,
  closing_note: null,
  case_value: null,
  description: null,
  client_role: null,
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [],
  is_archived: false,
  is_precedent: false,
  timeline: [
    { id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" },
  ],
};
const closedCase = { ...baseCase, status: "kapali", outcome: "won", decision_date: "2026-10-01", closing_note: "Karar tebliğ edildi." };
const archivedCase = { ...closedCase, is_archived: true };

async function renderCase(caseDetail: object, me: object | null = owner) {
  getCase.mockResolvedValue(caseDetail);
  if (me) getMe.mockResolvedValue(me);
  else getMe.mockRejectedValue(new ApiError("Oturum bulunamadı", 401));
  render(<CaseDetailView caseId="c1" />);
  await screen.findByRole("heading", { name: caseDetail === undefined ? "" : (caseDetail as typeof baseCase).case_name });
}

async function menuItems() {
  await userEvent.click(await screen.findByRole("button", { name: "İşlemler" }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");
  for (const mock of [getCase, getMe, listSimulations, listDocuments, listCaseTasks, updateCase, unarchiveCase]) mock.mockReset();
  listSimulations.mockResolvedValue([]);
  listDocuments.mockResolvedValue([]);
  listCaseTasks.mockResolvedValue([]);
});

describe("İşlemler menu on the case page", () => {
  it("offers edit and close to the responsible lawyer of an open case", async () => {
    await renderCase(baseCase, owner);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Davayı kapat"]);
  });

  it("offers edit, reopen and archive on a closed case", async () => {
    await renderCase(closedCase, owner);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Yeniden aç", "Arşivle"]);
  });

  it("offers only unarchive on an archived case", async () => {
    await renderCase(archivedCase, owner);
    expect(await menuItems()).toEqual(["Arşivden çıkar"]);
  });

  it("is available to an admin on any case of the firm", async () => {
    await renderCase(baseCase, admin);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Davayı kapat"]);
  });

  it("is available to an admin on a case without a responsible lawyer", async () => {
    await renderCase({ ...baseCase, assigned_lawyer_id: null }, admin);
    expect(await menuItems()).toEqual(["Bilgileri düzenle", "Davayı kapat"]);
  });

  it("is hidden from another lawyer and from the owner of nothing", async () => {
    await renderCase(baseCase, colleague);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "İşlemler" })).toBeNull();
  });

  it("is hidden for a case without a responsible lawyer when the user is a lawyer", async () => {
    await renderCase({ ...baseCase, assigned_lawyer_id: null }, owner);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "İşlemler" })).toBeNull();
  });

  it("stays hidden, and the page still loads, when the current user cannot be read", async () => {
    await renderCase(baseCase, null);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "İşlemler" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Sözleşmenin Feshi Davası" })).toBeInTheDocument();
  });
});

describe("status badges in the header", () => {
  it("shows the status of an open case without an outcome badge", async () => {
    await renderCase(baseCase);
    const group = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(group).getByText("Devam Eden")).toBeInTheDocument();
    expect(within(group).queryByText("Kazanıldı")).toBeNull();
  });

  it.each([
    ["won", "Kazanıldı", "text-emerald-700"],
    ["lost", "Kaybedildi", "text-red-700"],
    ["settled", "Sulh", "text-slate-700"],
  ])("adds the %s outcome badge, in its own colour, to a closed case", async (outcome, label, tone) => {
    await renderCase({ ...closedCase, outcome });
    const group = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(group).getByText("Kapalı")).toBeInTheDocument();
    expect(within(group).getByText(label)).toBeInTheDocument();
    expect(within(group).getByText(label)).toHaveClass(tone);
  });

  it("shows no outcome badge for a case closed before outcomes were recorded", async () => {
    await renderCase({ ...closedCase, outcome: "ongoing" });
    const group = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(group).getByText("Kapalı")).toBeInTheDocument();
    expect(within(group).queryByText("Devam ediyor")).toBeNull();
  });
});

describe("Bilgileri düzenle", () => {
  it("opens the dialog from the menu, saves, updates the page and returns focus to the menu button", async () => {
    updateCase.mockResolvedValue({ ...baseCase, case_name: "Yeni Dava Adı", timeline: undefined });
    await renderCase(baseCase);

    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Bilgileri düzenle" }));
    const dialog = screen.getByRole("dialog", { name: "Bilgileri düzenle" });
    const name = within(dialog).getByLabelText(/^Dava adı/);
    expect(name).toHaveFocus();
    await userEvent.clear(name);
    await userEvent.type(name, "Yeni Dava Adı");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateCase).toHaveBeenCalledWith("c1", expect.objectContaining({ case_name: "Yeni Dava Adı" }));
    expect(screen.getByRole("heading", { name: "Yeni Dava Adı" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İşlemler" })).toHaveFocus();

    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
  });

  it("keeps the dialog open and shows the server's message when saving fails", async () => {
    updateCase.mockRejectedValueOnce(new ApiError("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.", 403));
    await renderCase(baseCase);
    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Bilgileri düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.");
    expect(screen.getByRole("dialog", { name: "Bilgileri düzenle" })).toBeInTheDocument();
  });
});

describe("Arşivden çıkar", () => {
  it("unarchives straight from the menu and swaps the menu for a closed case's", async () => {
    unarchiveCase.mockResolvedValue({ ...archivedCase, is_archived: false, timeline: undefined });
    await renderCase(archivedCase);

    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Arşivden çıkar" }));

    await waitFor(() => expect(unarchiveCase).toHaveBeenCalledTimes(1));
    expect(unarchiveCase).toHaveBeenCalledWith("c1");
    await waitFor(async () => expect(await menuItems()).toEqual(["Bilgileri düzenle", "Yeniden aç", "Arşivle"]));
  });

  it("shows the server's message when it fails, and a Turkish fallback otherwise", async () => {
    unarchiveCase.mockRejectedValueOnce(new ApiError("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.", 403));
    await renderCase(archivedCase);
    await menuItems();
    await userEvent.click(screen.getByRole("menuitem", { name: "Arşivden çıkar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir.");

    unarchiveCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "İşlemler" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Arşivden çıkar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Dava arşivden çıkarılamadı. Lütfen tekrar deneyin."));
  });
});
```

Modify `frontend/src/components/__tests__/CaseDetailView.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseDetailView.test.tsx
+++ b/frontend/src/components/__tests__/CaseDetailView.test.tsx
@@ -6,6 +6,7 @@ vi.mock("next/navigation", async () => (await import("@/test/navigation")).navig
 import { nav, resetNav, setUrl } from "@/test/navigation";
 
 const getCase = vi.fn();
+const getMe = vi.fn();
 const listSimulations = vi.fn();
 const listDocuments = vi.fn();
 const startSimulation = vi.fn();
@@ -21,6 +22,7 @@ const updateCase = vi.fn();
 
 vi.mock("@/lib/api", () => ({
   getCase: (...args: unknown[]) => getCase(...args),
+  getMe: (...args: unknown[]) => getMe(...args),
   listSimulations: (...args: unknown[]) => listSimulations(...args),
   listDocuments: (...args: unknown[]) => listDocuments(...args),
   startSimulation: (...args: unknown[]) => startSimulation(...args),
@@ -59,6 +61,8 @@ beforeEach(() => {
   setUrl("/davalar/c1");
 
   getCase.mockReset();
+  getMe.mockReset();
+  getMe.mockResolvedValue({ id: "u-admin", role: "admin", full_name: "Yönetici" });
   listSimulations.mockReset();
   listDocuments.mockReset();
   startSimulation.mockReset();
```

Create `frontend/src/components/__tests__/CaseEditModal.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateCase = vi.fn();
vi.mock("@/lib/api", () => ({
  updateCase: (...args: unknown[]) => updateCase(...args),
}));

import { CaseEditModal } from "@/components/CaseEditModal";
import { ApiError } from "@/lib/apiError";
import type { Case } from "@/types";

const openCase = {
  id: "c1",
  case_number: "2026/7",
  case_name: "Tahliye Davası",
  case_type: "kira",
  court: "Ankara 3. Asliye Hukuk",
  court_file_number: "2026/7 E.",
  opening_date: "2026-02-03",
  case_value: 125000,
  status: "durusma_bekleyen",
  outcome: "ongoing",
} as unknown as Case;
const closedCase = { ...openCase, status: "kapali", outcome: "won" } as unknown as Case;

function renderModal(caseDetail: Case = openCase, props: { onClose?: () => void; onSaved?: (updated: Case) => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onSaved = props.onSaved ?? vi.fn();
  render(<CaseEditModal caseDetail={caseDetail} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

beforeEach(() => updateCase.mockReset());

describe("CaseEditModal", () => {
  it("is a modal dialog titled Bilgileri düzenle with the current values", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Bilgileri düzenle" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Tahliye Davası");
    expect(screen.getByLabelText(/^Dava türü/)).toHaveValue("kira");
    expect(screen.getByLabelText("Mahkeme")).toHaveValue("Ankara 3. Asliye Hukuk");
    expect(screen.getByLabelText("Esas no")).toHaveValue("2026/7 E.");
    expect(screen.getByLabelText("Dava tarihi")).toHaveValue("2026-02-03");
    expect(screen.getByLabelText("Dava değeri")).toHaveValue(125000);
    expect(screen.getByLabelText("Durum")).toHaveValue("durusma_bekleyen");
  });

  it("shows the case number read-only", async () => {
    renderModal();
    const number = screen.getByLabelText("Dava no");
    expect(number).toHaveValue("2026/7");
    expect(number).toHaveAttribute("readonly");
    await userEvent.type(number, "9");
    expect(number).toHaveValue("2026/7");
  });

  it("offers only the open statuses", () => {
    renderModal();
    const status = screen.getByLabelText("Durum") as HTMLSelectElement;
    expect([...status.options].map((option) => option.text)).toEqual(["Devam Eden", "Duruşma Bekleyen", "Karar Bekleyen"]);
  });

  it("has no status field for a closed case and does not send one", async () => {
    updateCase.mockResolvedValue(closedCase);
    renderModal(closedCase);
    expect(screen.queryByLabelText("Durum")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateCase).toHaveBeenCalledTimes(1));
    expect(updateCase.mock.calls[0][1]).not.toHaveProperty("status");
  });

  it("saves the edited fields and reports the updated case", async () => {
    const updated = { ...openCase, case_name: "Yeni Ad" } as Case;
    updateCase.mockResolvedValue(updated);
    const { onSaved } = renderModal();

    const name = screen.getByLabelText(/^Dava adı/);
    await userEvent.clear(name);
    await userEvent.type(name, "  Yeni Ad  ");
    await userEvent.selectOptions(screen.getByLabelText(/^Dava türü/), "icra");
    await userEvent.selectOptions(screen.getByLabelText("Durum"), "karar_bekleyen");
    await userEvent.clear(screen.getByLabelText("Mahkeme"));
    await userEvent.clear(screen.getByLabelText("Dava değeri"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateCase).toHaveBeenCalledWith("c1", {
      case_name: "Yeni Ad",
      case_type: "icra",
      court: null,
      court_file_number: "2026/7 E.",
      case_value: null,
      opening_date: "2026-02-03",
      status: "karar_bekleyen",
    });
  });

  it("validates before sending", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText(/^Dava adı/));
    await userEvent.clear(screen.getByLabelText("Dava tarihi"));
    await userEvent.clear(screen.getByLabelText("Dava değeri"));
    await userEvent.type(screen.getByLabelText("Dava değeri"), "-5");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(screen.getByText("Dava adı gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Dava tarihi gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Dava değeri geçerli bir sayı olmalı.")).toBeInTheDocument();
    expect(updateCase).not.toHaveBeenCalled();
  });

  it("shows the server's message in an alert and stays open", async () => {
    updateCase.mockRejectedValueOnce(new ApiError("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.", 409));
    const { onSaved } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a Turkish fallback, never the raw message, for other failures", async () => {
    updateCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dava bilgileri kaydedilemedi. Lütfen tekrar deneyin.");
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("sends once when Kaydet is clicked twice and locks Vazgeç and Escape while saving", async () => {
    let resolve!: (value: Case) => void;
    updateCase.mockReturnValue(new Promise<Case>((r) => (resolve = r)));
    const { onClose, onSaved } = renderModal();

    const save = screen.getByRole("button", { name: "Kaydet" });
    await userEvent.click(save);
    await userEvent.click(screen.getByRole("button", { name: "Kaydediliyor..." }));
    expect(updateCase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Kaydediliyor..." })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    resolve(openCase);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("closes on Vazgeç without saving", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateCase).not.toHaveBeenCalled();
  });
});
```

Modify `frontend/src/components/__tests__/CaseFormSections.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseFormSections.test.tsx
+++ b/frontend/src/components/__tests__/CaseFormSections.test.tsx
@@ -42,7 +42,7 @@ describe("BasicInfoFields", () => {
     const type = screen.getByLabelText(/^Dava türü/) as HTMLSelectElement;
     expect([...type.options].map((option) => option.text)).toEqual(["İş Hukuku", "Ticaret Hukuku", "Sözleşme", "Kira", "İcra", "Diğer"]);
     const status = screen.getByLabelText("Durum") as HTMLSelectElement;
-    expect([...status.options].map((option) => option.text)).toEqual(["Devam Eden", "Duruşma Bekleyen", "Karar Bekleyen", "Kapalı"]);
+    expect([...status.options].map((option) => option.text)).toEqual(["Devam Eden", "Duruşma Bekleyen", "Karar Bekleyen"]);
   });
 
   it("edits values and shows errors next to the field", async () => {
```

Modify `frontend/src/lib/__tests__/caseIntake.test.ts`:

```diff
--- a/frontend/src/lib/__tests__/caseIntake.test.ts
+++ b/frontend/src/lib/__tests__/caseIntake.test.ts
@@ -11,7 +11,10 @@ import {
   emptyCaseForm,
   firstErrorSection,
   hasErrors,
+  buildBasicInfoPayload,
   buildDisputePayload,
+  hasBasicInfoErrors,
+  validateBasicInfo,
   buildPartiesPayload,
   formFromCase,
   hasFillableContent,
@@ -404,4 +407,69 @@ describe("case detail editors", () => {
       { name: "Ev Sahibi", role: "plaintiff", is_client: true, counsel_name: "Av. Ece" },
     ]);
   });
+
+  it("fills the basic-info fields of the form from the case", () => {
+    const form = formFromCase({ ...storedCase, court: "Ankara 3. Asliye Hukuk", opening_date: "2026-02-03", case_value: 125000 } as Case);
+    expect(form).toMatchObject({
+      case_number: "2026/7",
+      case_name: "Tahliye",
+      case_type: "kira",
+      court: "Ankara 3. Asliye Hukuk",
+      opening_date: "2026-02-03",
+      case_value: "125000",
+      status: "durusma_bekleyen",
+    });
+  });
+
+  it("uses empty strings for missing basic info and an open status for a closed case", () => {
+    const form = formFromCase({ ...storedCase, court: null, case_value: null, opening_date: null, status: "kapali" } as unknown as Case);
+    expect(form).toMatchObject({ court: "", case_value: "", opening_date: "", status: "devam_eden" });
+  });
+});
+
+describe("Bilgileri düzenle rules", () => {
+  const valid: CaseFormState = {
+    ...emptyCaseForm(),
+    case_name: " Tahliye ",
+    case_type: "kira",
+    court: "  ",
+    court_file_number: "2026/7 E.",
+    opening_date: "2026-02-03",
+    case_value: "",
+    status: "karar_bekleyen",
+  };
+
+  it("accepts a complete form", () => {
+    expect(hasBasicInfoErrors(validateBasicInfo(valid))).toBe(false);
+  });
+
+  it("requires the case name and the case date", () => {
+    const errors = validateBasicInfo({ ...valid, case_name: "  ", opening_date: "" });
+    expect(errors).toMatchObject({ case_name: "Dava adı gerekli.", opening_date: "Dava tarihi gerekli." });
+    expect(hasBasicInfoErrors(errors)).toBe(true);
+  });
+
+  it("rejects a negative or non-numeric value and over-long texts", () => {
+    expect(validateBasicInfo({ ...valid, case_value: "-5" }).case_value).toBe("Dava değeri geçerli bir sayı olmalı.");
+    expect(validateBasicInfo({ ...valid, case_value: "abc" }).case_value).toBe("Dava değeri geçerli bir sayı olmalı.");
+    expect(validateBasicInfo({ ...valid, court: "x".repeat(256) }).court).toBe("En fazla 255 karakter olabilir.");
+  });
+
+  it("builds a PATCH body that clears emptied optional fields", () => {
+    expect(buildBasicInfoPayload(valid, { includeStatus: true })).toEqual({
+      case_name: "Tahliye",
+      case_type: "kira",
+      court: null,
+      court_file_number: "2026/7 E.",
+      case_value: null,
+      opening_date: "2026-02-03",
+      status: "karar_bekleyen",
+    });
+  });
+
+  it("leaves the status out for a closed case and converts the value to a number", () => {
+    const payload = buildBasicInfoPayload({ ...valid, case_value: "125000.5" }, { includeStatus: false });
+    expect(payload).not.toHaveProperty("status");
+    expect(payload.case_value).toBe(125000.5);
+  });
 });
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseActionsMenu.test.tsx src/components/__tests__/CaseDetailActions.test.tsx src/components/__tests__/CaseDetailView.test.tsx src/components/__tests__/CaseEditModal.test.tsx src/components/__tests__/CaseFormSections.test.tsx src/lib/__tests__/caseIntake.test.ts
```

Expected: FAIL —

```text
FAIL src/components/__tests__/CaseActionsMenu.test.tsx
FAIL src/components/__tests__/CaseEditModal.test.tsx
FAIL src/components/__tests__/CaseDetailActions.test.tsx
Error: Failed to resolve import "@/components/CaseActionsMenu" from "src/components/__tests__/CaseActionsMenu.test.tsx". Does the file exist?
Error: Failed to resolve import "@/components/CaseEditModal" from "src/components/__tests__/CaseEditModal.test.tsx". Does the file exist?
```

- [ ] **Step 3: Implement**

Modify `frontend/src/lib/caseIntake.ts`:

```diff
--- a/frontend/src/lib/caseIntake.ts
+++ b/frontend/src/lib/caseIntake.ts
@@ -7,9 +7,9 @@ import type {
   CasePartyPayload,
   CasePayload,
   CaseUpdatePayload,
-  CaseStatus,
   CaseType,
   ClientRole,
+  OpenCaseStatus,
   PartyRole,
 } from "@/types";
 
@@ -52,7 +52,7 @@ export interface CaseFormState {
   court_file_number: string;
   opening_date: string;
   case_value: string;
-  status: CaseStatus;
+  status: OpenCaseStatus;
   parties: PartyRow[];
   claim: string;
   facts_summary: string;
@@ -332,7 +332,14 @@ export function formFromCase(item: Case): CaseFormState {
   const parties = [...(item.parties ?? [])].sort((a, b) => a.sort_order - b.sort_order);
   return {
     ...emptyCaseForm(),
+    case_number: item.case_number ?? "",
+    case_name: item.case_name ?? "",
+    case_type: item.case_type ?? "diger",
+    court: item.court ?? "",
     court_file_number: item.court_file_number ?? "",
+    opening_date: item.opening_date ?? "",
+    case_value: item.case_value === null || item.case_value === undefined ? "" : String(item.case_value),
+    status: item.status === "kapali" ? "devam_eden" : (item.status ?? "devam_eden"),
     claim: item.claim ?? "",
     facts_summary: item.facts_summary ?? "",
     plaintiff_position: item.plaintiff_position ?? "",
@@ -354,3 +361,44 @@ export function buildDisputePayload(form: CaseFormState): CaseUpdatePayload {
     description: orNull(form.description),
   };
 }
+
+export interface BasicInfoErrors {
+  case_name?: string;
+  case_value?: string;
+  court?: string;
+  court_file_number?: string;
+  opening_date?: string;
+}
+
+/** Rules of the "Bilgileri düzenle" dialog: the case number is not editable there, the case date is required. */
+export function validateBasicInfo(form: CaseFormState): BasicInfoErrors {
+  const errors: BasicInfoErrors = {};
+  if (!form.case_name.trim()) errors.case_name = "Dava adı gerekli.";
+  else errors.case_name = tooLong(form.case_name, FIELD_LIMITS.case_name);
+  if (!form.opening_date.trim()) errors.opening_date = "Dava tarihi gerekli.";
+  errors.court = tooLong(form.court, FIELD_LIMITS.court);
+  errors.court_file_number = tooLong(form.court_file_number, FIELD_LIMITS.court_file_number);
+  if (form.case_value.trim()) {
+    const value = Number(form.case_value);
+    if (!Number.isFinite(value) || value < 0) errors.case_value = "Dava değeri geçerli bir sayı olmalı.";
+  }
+  return errors;
+}
+
+export function hasBasicInfoErrors(errors: BasicInfoErrors): boolean {
+  return Object.values(errors).some(Boolean);
+}
+
+/** PATCH body of "Bilgileri düzenle": emptied court / file number / value become null (cleared); status only for an open case. */
+export function buildBasicInfoPayload(form: CaseFormState, options: { includeStatus: boolean }): CaseUpdatePayload {
+  const payload: CaseUpdatePayload = {
+    case_name: trimmed(form.case_name),
+    case_type: form.case_type,
+    court: trimmed(form.court) || null,
+    court_file_number: trimmed(form.court_file_number) || null,
+    case_value: trimmed(form.case_value) ? Number(form.case_value) : null,
+  };
+  if (trimmed(form.opening_date)) payload.opening_date = trimmed(form.opening_date);
+  if (options.includeStatus) payload.status = form.status;
+  return payload;
+}
```

Modify `frontend/src/components/case-form/BasicInfoFields.tsx`:

```diff
--- a/frontend/src/components/case-form/BasicInfoFields.tsx
+++ b/frontend/src/components/case-form/BasicInfoFields.tsx
@@ -1,9 +1,9 @@
 "use client";
 
-import { CASE_STATUSES, CASE_TYPES } from "@/lib/filters";
+import { CASE_TYPES, OPEN_CASE_STATUSES } from "@/lib/filters";
 import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
 import { FIELD_LIMITS, type CaseFormState } from "@/lib/caseIntake";
-import type { CaseStatus, CaseType } from "@/types";
+import type { CaseType, OpenCaseStatus } from "@/types";
 import { Field, INPUT_CLASS } from "@/components/case-form/Field";
 
 export interface SetField {
@@ -13,19 +13,35 @@ export interface SetField {
 interface Props {
   form: CaseFormState;
   ai: ReadonlySet<string>;
-  errors: { case_number?: string; case_name?: string; case_value?: string; court?: string; court_file_number?: string };
+  errors: { case_number?: string; case_name?: string; case_value?: string; court?: string; court_file_number?: string; opening_date?: string };
   setField: SetField;
+  /** The case number is fixed once the case exists: shown, not editable and not marked required. */
+  caseNumberReadOnly?: boolean;
+  /** Statuses offered by "Durum" (the open ones by default); null hides the field, as for a closed case. */
+  statuses?: readonly OpenCaseStatus[] | null;
+  /** Focus "Dava adı" when the dialog opens (the case number comes first but is read-only). */
+  focusName?: boolean;
 }
 
 /** "Temel bilgiler ve mahkeme" fields. */
-export function BasicInfoFields({ form, ai, errors, setField }: Props) {
+export function BasicInfoFields({ form, ai, errors, setField, caseNumberReadOnly = false, statuses = OPEN_CASE_STATUSES, focusName = false }: Props) {
   return (
     <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
-      <Field id="case_number" label="Dava no" required error={errors.case_number}>
-        {(a11y) => <input {...a11y} maxLength={FIELD_LIMITS.case_number} className={INPUT_CLASS} value={form.case_number} onChange={(e) => setField("case_number", e.target.value)} />}
+      <Field id="case_number" label="Dava no" required={!caseNumberReadOnly} error={errors.case_number}>
+        {(a11y) => (
+          <input
+            {...a11y}
+            maxLength={FIELD_LIMITS.case_number}
+            readOnly={caseNumberReadOnly}
+            aria-readonly={caseNumberReadOnly || undefined}
+            className={INPUT_CLASS}
+            value={form.case_number}
+            onChange={(e) => setField("case_number", e.target.value)}
+          />
+        )}
       </Field>
       <Field id="case_name" label="Dava adı" required ai={ai.has("case_name")} error={errors.case_name}>
-        {(a11y) => <input {...a11y} maxLength={FIELD_LIMITS.case_name} className={INPUT_CLASS} value={form.case_name} onChange={(e) => setField("case_name", e.target.value)} />}
+        {(a11y) => <input {...a11y} data-autofocus={focusName || undefined} maxLength={FIELD_LIMITS.case_name} className={INPUT_CLASS} value={form.case_name} onChange={(e) => setField("case_name", e.target.value)} />}
       </Field>
       <Field id="case_type" label="Dava türü" required ai={ai.has("case_type")}>
         {(a11y) => (
@@ -46,7 +62,7 @@ export function BasicInfoFields({ form, ai, errors, setField }: Props) {
           <input {...a11y} maxLength={FIELD_LIMITS.court_file_number} className={INPUT_CLASS} value={form.court_file_number} onChange={(e) => setField("court_file_number", e.target.value)} />
         )}
       </Field>
-      <Field id="opening_date" label="Dava tarihi" ai={ai.has("opening_date")}>
+      <Field id="opening_date" label="Dava tarihi" ai={ai.has("opening_date")} error={errors.opening_date}>
         {(a11y) => <input {...a11y} type="date" className={INPUT_CLASS} value={form.opening_date} onChange={(e) => setField("opening_date", e.target.value)} />}
       </Field>
       <Field id="case_value" label="Dava değeri" ai={ai.has("case_value")} error={errors.case_value}>
@@ -54,17 +70,19 @@ export function BasicInfoFields({ form, ai, errors, setField }: Props) {
           <input {...a11y} type="number" min="0" step="any" className={INPUT_CLASS} value={form.case_value} onChange={(e) => setField("case_value", e.target.value)} />
         )}
       </Field>
-      <Field id="status" label="Durum">
-        {(a11y) => (
-          <select {...a11y} className={INPUT_CLASS} value={form.status} onChange={(e) => setField("status", e.target.value as CaseStatus)}>
-            {CASE_STATUSES.map((status) => (
-              <option key={status} value={status}>
-                {CASE_STATUS_LABELS[status]}
-              </option>
-            ))}
-          </select>
-        )}
-      </Field>
+      {statuses && (
+        <Field id="status" label="Durum">
+          {(a11y) => (
+            <select {...a11y} className={INPUT_CLASS} value={form.status} onChange={(e) => setField("status", e.target.value as OpenCaseStatus)}>
+              {statuses.map((status) => (
+                <option key={status} value={status}>
+                  {CASE_STATUS_LABELS[status]}
+                </option>
+              ))}
+            </select>
+          )}
+        </Field>
+      )}
     </div>
   );
 }
```

Modify `frontend/src/components/ModalFrame.tsx`:

```diff
--- a/frontend/src/components/ModalFrame.tsx
+++ b/frontend/src/components/ModalFrame.tsx
@@ -7,11 +7,13 @@ export function ModalFrame({
   title,
   onClose,
   busy = false,
+  wide = false,
   children,
 }: {
   title: string;
   onClose: () => void;
   busy?: boolean;
+  wide?: boolean;
   children: ReactNode;
 }) {
   const titleId = useId();
@@ -23,7 +25,9 @@ export function ModalFrame({
 
   useEffect(() => {
     const previous = document.activeElement as HTMLElement | null;
-    const first = dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
+    const first =
+      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
+      dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
     (first ?? dialogRef.current)?.focus();
     function onKeyDown(event: KeyboardEvent) {
       if (event.key === "Escape" && !busyRef.current) closeRef.current();
@@ -63,7 +67,7 @@ export function ModalFrame({
         aria-modal="true"
         aria-labelledby={titleId}
         tabIndex={-1}
-        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-card outline-none"
+        className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-2xl bg-white p-6 shadow-card outline-none`}
       >
         <h2 id={titleId} className="mb-4 text-lg font-semibold text-navy-900">
           {title}
```

Create `frontend/src/components/CaseActionsMenu.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { CASE_ACTION_LABELS, type CaseAction } from "@/lib/caseAccess";

/** The "İşlemler" menu of the case page; renders nothing when the user has no action. */
export function CaseActionsMenu({ actions, busy, onPick }: { actions: CaseAction[]; busy: boolean; onPick: (action: CaseAction) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-surface-muted"
      >
        İşlemler
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-surface-border bg-white py-1 shadow-card">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                setOpen(false);
                triggerRef.current?.focus();
                onPick(action);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60"
            >
              {CASE_ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `frontend/src/components/CaseEditModal.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { updateCase } from "@/lib/api";
import { buildBasicInfoPayload, formFromCase, hasBasicInfoErrors, validateBasicInfo, type CaseFormState } from "@/lib/caseIntake";
import { userMessage } from "@/lib/userMessages";
import type { Case } from "@/types";
import { BasicInfoFields } from "@/components/case-form/BasicInfoFields";
import { ModalFrame } from "@/components/ModalFrame";

interface Props {
  caseDetail: Case;
  onClose: () => void;
  onSaved: (updated: Case) => void;
}

/** "Bilgileri düzenle": the basic-info fields of the new-case form, saved with PATCH. A closed case has no status field. */
export function CaseEditModal({ caseDetail, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CaseFormState>(() => formFromCase(caseDetail));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateBasicInfo(form);
  const closed = caseDetail.status === "kapali";

  function setField<K extends keyof CaseFormState>(field: K, value: CaseFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (inFlight.current) return;
    if (hasBasicInfoErrors(errors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCase(caseDetail.id, buildBasicInfoPayload(form, { includeStatus: !closed }));
      onSaved(updated);
    } catch (err) {
      setError(userMessage(err, "Dava bilgileri kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="Bilgileri düzenle" onClose={onClose} busy={saving} wide>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <BasicInfoFields
          form={form}
          ai={NO_AI}
          errors={showErrors ? errors : {}}
          setField={setField}
          caseNumberReadOnly
          statuses={closed ? null : undefined}
          focusName
        />
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            aria-disabled={saving}
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
          >
            Vazgeç
          </button>
          <button type="submit" aria-disabled={saving} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

const NO_AI: ReadonlySet<string> = new Set();
```

Create `frontend/src/components/CaseHeader.tsx`:

```tsx
"use client";

import { CASE_OUTCOME_LABELS, CASE_STATUS_LABELS } from "@/lib/labels";
import type { CaseAction } from "@/lib/caseAccess";
import type { Case } from "@/types";
import { CaseActionsMenu } from "@/components/CaseActionsMenu";

const OUTCOME_BADGE_STYLES: Record<string, string> = {
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
  settled: "bg-slate-100 text-slate-700",
};

/** Status badge, plus the outcome once the case is closed with one (cases closed before outcomes existed have none). */
function CaseBadges({ item }: { item: Case }) {
  const outcomeStyle = item.status === "kapali" ? OUTCOME_BADGE_STYLES[item.outcome] : undefined;
  return (
    <div role="group" aria-label="Dava durumu" className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700">{CASE_STATUS_LABELS[item.status]}</span>
      {outcomeStyle && (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcomeStyle}`}>{CASE_OUTCOME_LABELS[item.outcome]}</span>
      )}
    </div>
  );
}

interface Props {
  caseDetail: Case;
  actions: CaseAction[];
  busy: boolean;
  actionError: string | null;
  onPick: (action: CaseAction) => void;
}

export function CaseHeader({ caseDetail, actions, busy, actionError, onPick }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent-600">{caseDetail.case_number}</p>
          <h1 className="text-xl font-semibold text-navy-900">{caseDetail.case_name}</h1>
          <p className="text-sm text-navy-500">
            {caseDetail.client_name}
            {caseDetail.opposing_party ? ` vs. ${caseDetail.opposing_party}` : ""}
          </p>
        </div>
        <CaseActionsMenu actions={actions} busy={busy} onPick={onPick} />
      </div>
      <CaseBadges item={caseDetail} />
      {actionError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}
    </div>
  );
}
```

Modify `frontend/src/components/CaseDetailView.tsx`:

```diff
--- a/frontend/src/components/CaseDetailView.tsx
+++ b/frontend/src/components/CaseDetailView.tsx
@@ -1,25 +1,29 @@
 "use client";
 
-import { useEffect, useState } from "react";
+import { useEffect, useRef, useState } from "react";
 
 import {
   addCaseEvent,
   createTask,
   generateHandover,
   getCase,
+  getMe,
   getSimulation,
   listCaseTasks,
   listDocuments,
   listSimulations,
   retrySimulation,
   startSimulation,
+  unarchiveCase,
   updateTaskStatus,
   uploadDocument,
 } from "@/lib/api";
 import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, SIMULATION_STATUS_LABELS, formatDate } from "@/lib/labels";
 import { parseCaseTab, type CaseTabSlug } from "@/lib/filters";
 import { useUrlParams } from "@/lib/urlState";
-import type { Case, CaseDetail, DocumentItem, HandoverReport, Simulation, Task } from "@/types";
+import type { AppUser, Case, CaseDetail, DocumentItem, HandoverReport, Simulation, Task } from "@/types";
+import { caseActions, type CaseAction } from "@/lib/caseAccess";
+import { userMessage } from "@/lib/userMessages";
 import { LoadingState } from "@/components/LoadingState";
 import { ErrorState } from "@/components/ErrorState";
 import { EmptyState } from "@/components/EmptyState";
@@ -31,6 +35,8 @@ import { AI_PERSPECTIVES } from "@/lib/ai";
 import { CaseDocumentsPanel } from "@/components/CaseDocumentsPanel";
 import { CaseDisputeCard } from "@/components/CaseDisputeCard";
 import { CasePartiesCard } from "@/components/CasePartiesCard";
+import { CaseHeader } from "@/components/CaseHeader";
+import { CaseEditModal } from "@/components/CaseEditModal";
 
 const TABS = [
   { slug: "genel", label: "Genel Bakış" },
@@ -79,6 +85,12 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   const [addingTask, setAddingTask] = useState(false);
   const [taskError, setTaskError] = useState<string | null>(null);
   const [skippedDismissed, setSkippedDismissed] = useState(false);
+  // The signed-in user decides which lifecycle actions are offered; the server stays the authority (403/409).
+  const [me, setMe] = useState<AppUser | null>(null);
+  const [dialog, setDialog] = useState<"edit" | null>(null);
+  const [actionBusy, setActionBusy] = useState(false);
+  const [actionError, setActionError] = useState<string | null>(null);
+  const actionInFlight = useRef(false);
   // Set by the new-case page when some events or documents could not be added after the case was created.
   const skippedParam = params.get("eklenemeyen") ?? "";
   const skippedCount = /^[1-9]\d*$/.test(skippedParam) ? Number(skippedParam) : 0;
@@ -111,6 +123,16 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [caseId]);
 
+  useEffect(() => {
+    let active = true;
+    getMe()
+      .then((user) => active && setMe(user))
+      .catch(() => active && setMe(null));
+    return () => {
+      active = false;
+    };
+  }, []);
+
   // Follow external URL changes (e.g. a quick-view shortcut to another tab of this case).
   useEffect(() => {
     setActiveTab(labelForSlug(parseCaseTab(sekmeParam)));
@@ -233,6 +255,26 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
     setCaseDetail((prev) => (prev ? { ...prev, ...updated, timeline: prev.timeline } : prev));
   }
 
+  async function runCaseAction(request: () => Promise<Case>, fallback: string) {
+    if (actionInFlight.current) return;
+    actionInFlight.current = true;
+    setActionBusy(true);
+    setActionError(null);
+    try {
+      handleCaseSaved(await request());
+    } catch (err) {
+      setActionError(userMessage(err, fallback));
+    } finally {
+      actionInFlight.current = false;
+      setActionBusy(false);
+    }
+  }
+
+  function pickAction(action: CaseAction) {
+    if (action === "edit") setDialog("edit");
+    else if (action === "unarchive") void runCaseAction(() => unarchiveCase(caseId), "Dava arşivden çıkarılamadı. Lütfen tekrar deneyin.");
+  }
+
   function dismissSkippedNotice() {
     setSkippedDismissed(true);
     setParams({ eklenemeyen: null });
@@ -260,6 +302,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   if (error) return <ErrorState message={error} />;
   if (!caseDetail) return null;
 
+  const actions = caseActions(me, caseDetail);
   const notes = caseDetail.timeline.filter((e) => e.event_type === "note");
   const pendingTasks = tasks.filter((task) => task.status === "pending").length;
   const latestEvents = [...caseDetail.timeline].sort((a, b) => b.event_date.localeCompare(a.event_date));
@@ -271,16 +314,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
 
   return (
     <div className="space-y-5">
-      <div>
-        <p className="text-xs font-medium uppercase tracking-wide text-accent-600">
-          {caseDetail.case_number}
-        </p>
-        <h1 className="text-xl font-semibold text-navy-900">{caseDetail.case_name}</h1>
-        <p className="text-sm text-navy-500">
-          {caseDetail.client_name}
-          {caseDetail.opposing_party ? ` vs. ${caseDetail.opposing_party}` : ""}
-        </p>
-      </div>
+      <CaseHeader caseDetail={caseDetail} actions={actions} busy={actionBusy} actionError={actionError} onPick={pickAction} />
 
       {skippedCount > 0 && !skippedDismissed && (
         <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
@@ -685,6 +719,16 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
           )}
         </div>
       )}
+      {dialog === "edit" && (
+        <CaseEditModal
+          caseDetail={caseDetail}
+          onClose={() => setDialog(null)}
+          onSaved={(updated) => {
+            handleCaseSaved(updated);
+            setDialog(null);
+          }}
+        />
+      )}
     </div>
   );
 }
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseActionsMenu.test.tsx src/components/__tests__/CaseDetailActions.test.tsx src/components/__tests__/CaseDetailView.test.tsx src/components/__tests__/CaseEditModal.test.tsx src/components/__tests__/CaseFormSections.test.tsx src/lib/__tests__/caseIntake.test.ts
cd frontend && npx tsc --noEmit
```

Expected: PASS —

```text
Test Files 6 passed (6)
Tests 125 passed (125)
```

`tsc` prints nothing.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
```

Expected: PASS — no failures (529 tests in 57 files); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseActionsMenu.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/CaseEditModal.tsx frontend/src/components/CaseHeader.tsx frontend/src/components/ModalFrame.tsx frontend/src/components/__tests__/CaseActionsMenu.test.tsx frontend/src/components/__tests__/CaseDetailActions.test.tsx frontend/src/components/__tests__/CaseDetailView.test.tsx frontend/src/components/__tests__/CaseEditModal.test.tsx frontend/src/components/__tests__/CaseFormSections.test.tsx frontend/src/components/case-form/BasicInfoFields.tsx frontend/src/lib/__tests__/caseIntake.test.ts frontend/src/lib/caseIntake.ts
git commit -F - <<'EOF'
feat: case header badges, İşlemler menu and edit dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 7: Close dialog with decision document, reopen and archive confirmations (frontend)

The remaining three menu actions. Closing is two requests (Decision 13): `closeCase`, then the optional `uploadDocument`; the page reloads the case and the document list afterwards so the new timeline event and document appear.

**Files:**
- Create: `frontend/src/lib/closing.ts`
- Create: `frontend/src/components/CaseCloseModal.tsx`
- Create: `frontend/src/components/CaseConfirmModal.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx`
- Test (create): `frontend/src/components/__tests__/CaseCloseModal.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseConfirmModal.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx`
- Test (create): `frontend/src/lib/__tests__/closing.test.ts`

**Interfaces:**
- Consumes: Task 5 (`closeCase`, `reopenCase`, `archiveCase`), Task 6 (`CaseHeader`, menu wiring, `handleCaseSaved`), `checkDocumentFile` from `caseIntake.ts`, `uploadDocument`, `ModalFrame`.
- Produces: `lib/closing.ts`: `CLOSING_OUTCOME_OPTIONS`, `todayLocalISO(now?)`, `validateClose(form, today)`, `hasCloseErrors`, `buildClosePayload(form)`, `MAX_CLOSING_NOTE`; `CaseCloseModal({caseId, pendingTaskCount, onClose, onClosed})` where `onClosed({updated, documentFailed})`; `CaseConfirmModal({title, message, confirmLabel, fallbackError, onConfirm, onClose})`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/CaseCloseModal.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const closeCase = vi.fn();
const uploadDocument = vi.fn();
vi.mock("@/lib/api", () => ({
  closeCase: (...args: unknown[]) => closeCase(...args),
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
}));

import { CaseCloseModal } from "@/components/CaseCloseModal";
import { ApiError } from "@/lib/apiError";
import { todayLocalISO } from "@/lib/closing";
import type { Case } from "@/types";

const closed = { id: "c1", status: "kapali", outcome: "won" } as unknown as Case;

function renderModal(props: { pendingTaskCount?: number; onClose?: () => void; onClosed?: (result: unknown) => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onClosed = props.onClosed ?? vi.fn();
  render(<CaseCloseModal caseId="c1" pendingTaskCount={props.pendingTaskCount ?? 0} onClose={onClose} onClosed={onClosed} />);
  return { onClose, onClosed };
}

const pdf = () => new File(["%PDF"], "karar.pdf", { type: "application/pdf" });

beforeEach(() => {
  closeCase.mockReset();
  uploadDocument.mockReset();
});

describe("CaseCloseModal", () => {
  it("is a dialog with the outcome choices, today's date and a note", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Davayı kapat" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("radio", { name: "Kazanıldı" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Kaybedildi" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sulh" })).toBeInTheDocument();
    const date = screen.getByLabelText("Karar tarihi");
    expect(date).toHaveValue(todayLocalISO());
    expect(date).toHaveAttribute("max", todayLocalISO());
    expect(screen.getByLabelText("Karar notu")).toHaveValue("");
    expect(screen.getByLabelText("Karar belgesi ekle")).toHaveAttribute("type", "file");
  });

  it("warns about pending tasks without blocking", async () => {
    closeCase.mockResolvedValue(closed);
    renderModal({ pendingTaskCount: 2 });
    expect(screen.getByText("Bu davada 2 bekleyen görev var.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Sulh" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    await waitFor(() => expect(closeCase).toHaveBeenCalledTimes(1));
  });

  it("shows no warning without pending tasks", () => {
    renderModal();
    expect(screen.queryByText(/bekleyen görev var/)).toBeNull();
  });

  it("asks for an outcome before sending", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    expect(screen.getByText("Sonuç seçin.")).toBeInTheDocument();
    expect(closeCase).not.toHaveBeenCalled();
  });

  it("rejects a future date", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    const date = screen.getByLabelText("Karar tarihi");
    await userEvent.clear(date);
    await userEvent.type(date, "2999-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    expect(screen.getByText("Karar tarihi ileri bir tarih olamaz.")).toBeInTheDocument();
    expect(closeCase).not.toHaveBeenCalled();
  });

  it("closes the case with the outcome, date and trimmed note and reports it", async () => {
    closeCase.mockResolvedValue(closed);
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.type(screen.getByLabelText("Karar notu"), "  Karar tebliğ edildi.  ");
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith({ updated: closed, documentFailed: false }));
    expect(closeCase).toHaveBeenCalledWith("c1", { outcome: "won", decision_date: todayLocalISO(), note: "Karar tebliğ edildi." });
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("uploads the decision document after closing", async () => {
    closeCase.mockResolvedValue(closed);
    uploadDocument.mockResolvedValue({ id: "d1" });
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kaybedildi" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), pdf());
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith({ updated: closed, documentFailed: false }));
    expect(uploadDocument).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "karar.pdf" }));
    expect(closeCase.mock.invocationCallOrder[0]).toBeLessThan(uploadDocument.mock.invocationCallOrder[0]);
  });

  it("reports the case as closed when only the document upload fails", async () => {
    closeCase.mockResolvedValue(closed);
    uploadDocument.mockRejectedValue(new Error("boom"));
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), pdf());
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith({ updated: closed, documentFailed: true }));
  });

  it("refuses an unsupported or oversized file before anything is sent", async () => {
    renderModal();
    const input = screen.getByLabelText("Karar belgesi ekle");
    await userEvent.upload(input, new File(["x"], "karar.exe"), { applyAccept: false });
    expect(screen.getByRole("alert")).toHaveTextContent("karar.exe desteklenmeyen bir dosya türü (pdf, docx, txt).");

    const big = new File(["x"], "büyük.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await userEvent.upload(input, big);
    expect(screen.getByRole("alert")).toHaveTextContent("büyük.pdf 10 MB sınırını aşıyor.");
    expect(closeCase).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays open when closing fails", async () => {
    closeCase.mockRejectedValueOnce(new ApiError("Dava zaten kapalı.", 409));
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dava zaten kapalı.");
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("falls back to a Turkish message for other failures", async () => {
    closeCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava kapatılamadı. Lütfen tekrar deneyin.");
  });

  it("sends once on a double click and locks Vazgeç and Escape meanwhile", async () => {
    let resolve!: (value: Case) => void;
    closeCase.mockReturnValue(new Promise<Case>((r) => (resolve = r)));
    const { onClose, onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    await userEvent.click(screen.getByRole("button", { name: "Kapatılıyor..." }));
    expect(closeCase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Kapatılıyor..." })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    resolve(closed);
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it("closes on Vazgeç without sending", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(closeCase).not.toHaveBeenCalled();
  });
});
```

Create `frontend/src/components/__tests__/CaseConfirmModal.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { ApiError } from "@/lib/apiError";

function renderConfirm(onConfirm: () => Promise<void>, onClose = vi.fn()) {
  render(
    <CaseConfirmModal title="Dava arşivlensin mi?" message="Arşivli dava salt okunur olur." confirmLabel="Arşivle" fallbackError="Dava arşivlenemedi. Lütfen tekrar deneyin." onConfirm={onConfirm} onClose={onClose} />,
  );
  return onClose;
}

describe("CaseConfirmModal", () => {
  it("shows the question and runs the confirmation", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderConfirm(onConfirm);
    expect(screen.getByRole("dialog", { name: "Dava arşivlensin mi?" })).toBeInTheDocument();
    expect(screen.getByText("Arşivli dava salt okunur olur.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("cancels without running anything", async () => {
    const onConfirm = vi.fn();
    const onClose = renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays open on failure", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new ApiError("Yalnızca kapalı davalar arşivlenebilir.", 409));
    renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Yalnızca kapalı davalar arşivlenebilir.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("falls back to the Turkish text for a network failure", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dava arşivlenemedi. Lütfen tekrar deneyin.");
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("runs once on a double click and locks Vazgeç and Escape while running", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const onClose = renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    await userEvent.click(screen.getByRole("button", { name: "Lütfen bekleyin..." }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Lütfen bekleyin..." })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve());
  });
});
```

Create `frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const getMe = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const listCaseTasks = vi.fn();
const closeCase = vi.fn();
const reopenCase = vi.fn();
const archiveCase = vi.fn();
const uploadDocument = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  closeCase: (...args: unknown[]) => closeCase(...args),
  reopenCase: (...args: unknown[]) => reopenCase(...args),
  archiveCase: (...args: unknown[]) => archiveCase(...args),
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
  updateCase: vi.fn(),
  unarchiveCase: vi.fn(),
  startSimulation: vi.fn(),
  getSimulation: vi.fn(),
  retrySimulation: vi.fn(),
  addCaseEvent: vi.fn(),
  generateHandover: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

import { CaseDetailView } from "@/components/CaseDetailView";
import { ApiError } from "@/lib/apiError";
import { todayLocalISO } from "@/lib/closing";

const owner = { id: "u-owner", role: "lawyer", full_name: "Ayşe Avukat" };
const openCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Sözleşmenin Feshi Davası",
  client_name: "Deniz Arslan",
  opposing_party: null,
  case_type: "sozlesme",
  court: null,
  court_file_number: null,
  assigned_lawyer_id: "u-owner",
  opening_date: "2026-01-12",
  next_hearing_date: null,
  status: "devam_eden",
  outcome: "ongoing",
  decision_date: null,
  closing_note: null,
  case_value: null,
  description: null,
  client_role: null,
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [],
  is_archived: false,
  is_precedent: false,
  timeline: [{ id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" }],
};
const closeEvent = { id: "e2", event_date: "2026-10-01", title: "Dava kapatıldı — Kazanıldı", description: null, event_type: "other", created_at: "2026-10-01" };
const closedCase = { ...openCase, status: "kapali", outcome: "won", decision_date: "2026-10-01" };
const closedDetail = { ...closedCase, timeline: [...openCase.timeline, closeEvent] };

async function renderCase(caseDetail: object) {
  getCase.mockResolvedValue(caseDetail);
  getMe.mockResolvedValue(owner);
  render(<CaseDetailView caseId="c1" />);
  await screen.findByRole("heading", { name: "Sözleşmenin Feshi Davası" });
}

async function pick(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: "İşlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");
  for (const mock of [getCase, getMe, listSimulations, listDocuments, listCaseTasks, closeCase, reopenCase, archiveCase, uploadDocument]) mock.mockReset();
  listSimulations.mockResolvedValue([]);
  listDocuments.mockResolvedValue([]);
  listCaseTasks.mockResolvedValue([
    { id: "t1", title: "Vekalet", status: "pending", due_date: null, description: null },
    { id: "t2", title: "Dilekçe", status: "completed", due_date: null, description: null },
  ]);
});

describe("Davayı kapat", () => {
  it("closes the case, shows the outcome badge and reloads the timeline", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    const dialog = screen.getByRole("dialog", { name: "Davayı kapat" });
    expect(within(dialog).getByText("Bu davada 1 bekleyen görev var.")).toBeInTheDocument();

    closeCase.mockResolvedValue(closedCase);
    getCase.mockResolvedValue(closedDetail);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(closeCase).toHaveBeenCalledWith("c1", { outcome: "won", decision_date: todayLocalISO() });
    const badges = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(badges).getByText("Kapalı")).toBeInTheDocument();
    expect(within(badges).getByText("Kazanıldı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İşlemler" })).toHaveFocus();

    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(await screen.findByText("Dava kapatıldı — Kazanıldı")).toBeInTheDocument();
  });

  it("uploads the decision document and refreshes the document list", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    closeCase.mockResolvedValue(closedCase);
    getCase.mockResolvedValue(closedDetail);
    uploadDocument.mockResolvedValue({ id: "d1" });
    listDocuments.mockResolvedValue([
      { id: "d1", filename: "karar.pdf", file_type: "pdf", uploaded_at: "2026-10-01T10:00:00", extracted_text: null },
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), new File(["%PDF"], "karar.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("karar.pdf")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Dava kapatıldı ancak karar belgesi yüklenemedi.")).toBeNull();
  });

  it("tells the user the case is closed when only the document failed", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    closeCase.mockResolvedValue(closedCase);
    getCase.mockResolvedValue(closedDetail);
    uploadDocument.mockRejectedValue(new Error("boom"));
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), new File(["%PDF"], "karar.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Dava kapatıldı ancak karar belgesi yüklenemedi.");
    expect(within(screen.getByRole("group", { name: "Dava durumu" })).getByText("Kapalı")).toBeInTheDocument();
  });

  it("still shows the closed case when the reload after closing fails", async () => {
    await renderCase(openCase);
    await pick("Davayı kapat");
    closeCase.mockResolvedValue(closedCase);
    getCase.mockRejectedValue(new Error("down"));
    await userEvent.click(screen.getByRole("radio", { name: "Sulh" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(screen.getByRole("group", { name: "Dava durumu" })).getByText("Kapalı")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sözleşmenin Feshi Davası" })).toBeInTheDocument();
  });
});

describe("Yeniden aç", () => {
  it("asks for confirmation, reopens and reloads the timeline", async () => {
    await renderCase(closedDetail);
    await pick("Yeniden aç");
    const dialog = screen.getByRole("dialog", { name: "Dava yeniden açılsın mı?" });
    expect(within(dialog).getByText("Sonuç ve karar bilgisi temizlenecek; kapanış kaydı zaman çizelgesinde kalır.")).toBeInTheDocument();

    const reopenEvent = { ...closeEvent, id: "e3", title: "Dava yeniden açıldı" };
    reopenCase.mockResolvedValue({ ...openCase });
    getCase.mockResolvedValue({ ...openCase, timeline: [...closedDetail.timeline, reopenEvent] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Yeniden aç" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(reopenCase).toHaveBeenCalledWith("c1");
    const badges = screen.getByRole("group", { name: "Dava durumu" });
    expect(within(badges).getByText("Devam Eden")).toBeInTheDocument();
    expect(within(badges).queryByText("Kazanıldı")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(await screen.findByText("Dava yeniden açıldı")).toBeInTheDocument();
  });

  it("does nothing when cancelled", async () => {
    await renderCase(closedDetail);
    await pick("Yeniden aç");
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reopenCase).not.toHaveBeenCalled();
  });

  it("shows the server's message when reopening fails", async () => {
    reopenCase.mockRejectedValueOnce(new ApiError("Dava zaten açık.", 409));
    await renderCase(closedDetail);
    await pick("Yeniden aç");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Yeniden aç" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava zaten açık.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Arşivle", () => {
  it("asks for confirmation, archives and swaps the menu", async () => {
    await renderCase(closedDetail);
    await pick("Arşivle");
    const dialog = screen.getByRole("dialog", { name: "Dava arşivlensin mi?" });
    expect(within(dialog).getByText("Arşivli dava salt okunur olur.")).toBeInTheDocument();

    archiveCase.mockResolvedValue({ ...closedCase, is_archived: true });
    await userEvent.click(within(dialog).getByRole("button", { name: "Arşivle" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(archiveCase).toHaveBeenCalledWith("c1");
    await userEvent.click(screen.getByRole("button", { name: "İşlemler" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Arşivden çıkar"]);
  });

  it("falls back to a Turkish message when archiving fails without a server message", async () => {
    archiveCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await renderCase(closedDetail);
    await pick("Arşivle");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Arşivle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava arşivlenemedi. Lütfen tekrar deneyin.");
  });
});
```

Create `frontend/src/lib/__tests__/closing.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CLOSING_OUTCOME_OPTIONS, buildClosePayload, hasCloseErrors, todayLocalISO, validateClose } from "@/lib/closing";

const today = "2026-10-11";
const valid = { outcome: "won" as const, decision_date: "2026-10-01", note: "" };

describe("closing rules", () => {
  it("offers the three outcomes with their Turkish labels", () => {
    expect(CLOSING_OUTCOME_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ["won", "Kazanıldı"],
      ["lost", "Kaybedildi"],
      ["settled", "Sulh"],
    ]);
  });

  it("formats today from the local calendar date, not from UTC", () => {
    expect(todayLocalISO(new Date(2026, 9, 11, 23, 30))).toBe("2026-10-11");
    expect(todayLocalISO(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });

  it("accepts a complete form, including today's date", () => {
    expect(hasCloseErrors(validateClose(valid, today))).toBe(false);
    expect(hasCloseErrors(validateClose({ ...valid, decision_date: today }, today))).toBe(false);
  });

  it("requires an outcome and a decision date", () => {
    const errors = validateClose({ outcome: "", decision_date: "", note: "" }, today);
    expect(errors).toEqual({ outcome: "Sonuç seçin.", decision_date: "Karar tarihi gerekli." });
  });

  it("rejects a future decision date and an over-long note", () => {
    expect(validateClose({ ...valid, decision_date: "2026-10-12" }, today).decision_date).toBe("Karar tarihi ileri bir tarih olamaz.");
    expect(validateClose({ ...valid, note: "x".repeat(4001) }, today).note).toBe("En fazla 4000 karakter olabilir.");
    expect(validateClose({ ...valid, note: "x".repeat(4000) }, today).note).toBeUndefined();
  });

  it("builds the close payload with a trimmed note, left out when blank", () => {
    expect(buildClosePayload({ ...valid, note: "  Karar tebliğ edildi.  " })).toEqual({
      outcome: "won",
      decision_date: "2026-10-01",
      note: "Karar tebliğ edildi.",
    });
    expect(buildClosePayload({ ...valid, note: "   " })).toEqual({ outcome: "won", decision_date: "2026-10-01" });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseCloseModal.test.tsx src/components/__tests__/CaseConfirmModal.test.tsx src/components/__tests__/CaseDetailLifecycle.test.tsx src/lib/__tests__/closing.test.ts
```

Expected: FAIL —

```text
FAIL src/lib/__tests__/closing.test.ts
FAIL src/components/__tests__/CaseCloseModal.test.tsx
FAIL src/components/__tests__/CaseConfirmModal.test.tsx
FAIL src/components/__tests__/CaseDetailLifecycle.test.tsx
Error: Failed to resolve import "@/lib/closing" from "src/lib/__tests__/closing.test.ts". Does the file exist?
Error: Failed to resolve import "@/components/CaseCloseModal" from "src/components/__tests__/CaseCloseModal.test.tsx". Does the file exist?
Test Files 4 failed (4)
Tests no tests
```

- [ ] **Step 3: Implement**

Create `frontend/src/lib/closing.ts`:

```ts
/** Form rules of the "Davayı kapat" dialog. */
import type { CaseClosePayload, ClosingOutcome } from "@/types";

export const MAX_CLOSING_NOTE = 4000;

export const CLOSING_OUTCOME_OPTIONS: { value: ClosingOutcome; label: string }[] = [
  { value: "won", label: "Kazanıldı" },
  { value: "lost", label: "Kaybedildi" },
  { value: "settled", label: "Sulh" },
];

export interface CloseFormState {
  outcome: ClosingOutcome | "";
  decision_date: string;
  note: string;
}

export interface CloseErrors {
  outcome?: string;
  decision_date?: string;
  note?: string;
}

/** The browser's calendar date as YYYY-MM-DD (local time: toISOString would give the UTC date). */
export function todayLocalISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function validateClose(form: CloseFormState, today: string): CloseErrors {
  const errors: CloseErrors = {};
  if (!form.outcome) errors.outcome = "Sonuç seçin.";
  if (!form.decision_date) errors.decision_date = "Karar tarihi gerekli.";
  else if (form.decision_date > today) errors.decision_date = "Karar tarihi ileri bir tarih olamaz.";
  if (form.note.trim().length > MAX_CLOSING_NOTE) errors.note = `En fazla ${MAX_CLOSING_NOTE} karakter olabilir.`;
  return errors;
}

export function hasCloseErrors(errors: CloseErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Only call with a form that passed validateClose. */
export function buildClosePayload(form: CloseFormState): CaseClosePayload {
  const payload: CaseClosePayload = { outcome: form.outcome as ClosingOutcome, decision_date: form.decision_date };
  const note = form.note.trim();
  if (note) payload.note = note;
  return payload;
}
```

Create `frontend/src/components/CaseCloseModal.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { closeCase, uploadDocument } from "@/lib/api";
import { checkDocumentFile } from "@/lib/caseIntake";
import {
  CLOSING_OUTCOME_OPTIONS,
  buildClosePayload,
  hasCloseErrors,
  todayLocalISO,
  validateClose,
  type CloseFormState,
} from "@/lib/closing";
import { userMessage } from "@/lib/userMessages";
import type { Case } from "@/types";
import { Field, INPUT_CLASS } from "@/components/case-form/Field";
import { ModalFrame } from "@/components/ModalFrame";

export interface CloseResult {
  updated: Case;
  /** The case is closed, but the decision document could not be added. */
  documentFailed: boolean;
}

interface Props {
  caseId: string;
  pendingTaskCount: number;
  onClose: () => void;
  onClosed: (result: CloseResult) => void;
}

/** "Davayı kapat": outcome, decision date, note and an optional decision document. */
export function CaseCloseModal({ caseId, pendingTaskCount, onClose, onClosed }: Props) {
  const today = todayLocalISO();
  const [form, setForm] = useState<CloseFormState>({ outcome: "", decision_date: today, note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateClose(form, today);

  function pickFile(picked: File | undefined) {
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    const problem = checkDocumentFile(picked);
    setFile(problem ? null : picked);
    setFileError(problem);
  }

  async function submit() {
    if (inFlight.current) return;
    if (hasCloseErrors(errors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    let updated: Case;
    try {
      updated = await closeCase(caseId, buildClosePayload(form));
    } catch (err) {
      setError(userMessage(err, "Dava kapatılamadı. Lütfen tekrar deneyin."));
      inFlight.current = false;
      setSaving(false);
      return;
    }
    let documentFailed = false;
    if (file) {
      try {
        await uploadDocument(caseId, file);
      } catch {
        documentFailed = true;
      }
    }
    inFlight.current = false;
    setSaving(false);
    onClosed({ updated, documentFailed });
  }

  return (
    <ModalFrame title="Davayı kapat" onClose={onClose} busy={saving}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <fieldset aria-describedby={showErrors && errors.outcome ? "kapanis-sonuc-hata" : undefined}>
          <legend className="mb-1 text-xs font-medium text-navy-600">Sonuç</legend>
          <div className="flex flex-wrap gap-4">
            {CLOSING_OUTCOME_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-navy-700">
                <input
                  type="radio"
                  name="kapanis-sonuc"
                  value={option.value}
                  checked={form.outcome === option.value}
                  onChange={() => setForm((prev) => ({ ...prev, outcome: option.value }))}
                />
                {option.label}
              </label>
            ))}
          </div>
          {showErrors && errors.outcome && (
            <p id="kapanis-sonuc-hata" className="mt-1 text-xs text-red-600">
              {errors.outcome}
            </p>
          )}
        </fieldset>

        <Field id="decision_date" label="Karar tarihi" error={showErrors ? errors.decision_date : undefined}>
          {(a11y) => (
            <input
              {...a11y}
              type="date"
              max={today}
              className={INPUT_CLASS}
              value={form.decision_date}
              onChange={(e) => setForm((prev) => ({ ...prev, decision_date: e.target.value }))}
            />
          )}
        </Field>

        <Field id="closing_note" label="Karar notu" error={showErrors ? errors.note : undefined}>
          {(a11y) => (
            <textarea
              {...a11y}
              rows={3}
              className={INPUT_CLASS}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            />
          )}
        </Field>

        <div>
          <label htmlFor="closing_document" className="mb-1 block text-xs font-medium text-navy-600">
            Karar belgesi ekle
          </label>
          <input
            id="closing_document"
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => pickFile(e.target.files?.[0])}
            className="block w-full text-sm text-navy-700"
          />
          {fileError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fileError}
            </p>
          )}
        </div>

        {pendingTaskCount > 0 && (
          <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {`Bu davada ${pendingTaskCount} bekleyen görev var.`}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            aria-disabled={saving}
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
          >
            Vazgeç
          </button>
          <button type="submit" aria-disabled={saving} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
            {saving ? "Kapatılıyor..." : "Davayı kapat"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
```

Create `frontend/src/components/CaseConfirmModal.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { userMessage } from "@/lib/userMessages";
import { ModalFrame } from "@/components/ModalFrame";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  /** Shown when the failure carries no server message. */
  fallbackError: string;
  /** Resolve to finish (the caller closes the dialog); reject to keep it open with the error. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Yes/no dialog for the reopen and archive actions. */
export function CaseConfirmModal({ title, message, confirmLabel, fallbackError, onConfirm, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(userMessage(err, fallbackError));
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <ModalFrame title={title} onClose={onClose} busy={running}>
      <p className="text-sm text-navy-600">{message}</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          aria-disabled={running}
          onClick={() => {
            if (!running) onClose();
          }}
          className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
        >
          Vazgeç
        </button>
        <button
          type="button"
          aria-disabled={running}
          onClick={() => void confirm()}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          {running ? "Lütfen bekleyin..." : confirmLabel}
        </button>
      </div>
    </ModalFrame>
  );
}
```

Modify `frontend/src/components/CaseDetailView.tsx`:

```diff
--- a/frontend/src/components/CaseDetailView.tsx
+++ b/frontend/src/components/CaseDetailView.tsx
@@ -4,6 +4,7 @@ import { useEffect, useRef, useState } from "react";
 
 import {
   addCaseEvent,
+  archiveCase,
   createTask,
   generateHandover,
   getCase,
@@ -12,6 +13,7 @@ import {
   listCaseTasks,
   listDocuments,
   listSimulations,
+  reopenCase,
   retrySimulation,
   startSimulation,
   unarchiveCase,
@@ -37,6 +39,8 @@ import { CaseDisputeCard } from "@/components/CaseDisputeCard";
 import { CasePartiesCard } from "@/components/CasePartiesCard";
 import { CaseHeader } from "@/components/CaseHeader";
 import { CaseEditModal } from "@/components/CaseEditModal";
+import { CaseCloseModal, type CloseResult } from "@/components/CaseCloseModal";
+import { CaseConfirmModal } from "@/components/CaseConfirmModal";
 
 const TABS = [
   { slug: "genel", label: "Genel Bakış" },
@@ -87,9 +91,10 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   const [skippedDismissed, setSkippedDismissed] = useState(false);
   // The signed-in user decides which lifecycle actions are offered; the server stays the authority (403/409).
   const [me, setMe] = useState<AppUser | null>(null);
-  const [dialog, setDialog] = useState<"edit" | null>(null);
+  const [dialog, setDialog] = useState<"edit" | "close" | "reopen" | "archive" | null>(null);
   const [actionBusy, setActionBusy] = useState(false);
   const [actionError, setActionError] = useState<string | null>(null);
+  const [actionNotice, setActionNotice] = useState<string | null>(null);
   const actionInFlight = useRef(false);
   // Set by the new-case page when some events or documents could not be added after the case was created.
   const skippedParam = params.get("eklenemeyen") ?? "";
@@ -270,8 +275,27 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
     }
   }
 
+  /** Reload the case after an action that adds a timeline event; the merged state stays if the reload fails. */
+  async function refreshCaseAndDocuments() {
+    try {
+      const [fresh, freshDocuments] = await Promise.all([getCase(caseId), listDocuments(caseId)]);
+      setCaseDetail(fresh);
+      setDocuments(freshDocuments);
+    } catch {
+      // Keep what the action already returned.
+    }
+  }
+
+  function handleClosed({ updated, documentFailed }: CloseResult) {
+    handleCaseSaved(updated);
+    setDialog(null);
+    if (documentFailed) setActionNotice("Dava kapatıldı ancak karar belgesi yüklenemedi.");
+    void refreshCaseAndDocuments();
+  }
+
   function pickAction(action: CaseAction) {
-    if (action === "edit") setDialog("edit");
+    setActionNotice(null);
+    if (action === "edit" || action === "close" || action === "reopen" || action === "archive") setDialog(action);
     else if (action === "unarchive") void runCaseAction(() => unarchiveCase(caseId), "Dava arşivden çıkarılamadı. Lütfen tekrar deneyin.");
   }
 
@@ -316,6 +340,15 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
     <div className="space-y-5">
       <CaseHeader caseDetail={caseDetail} actions={actions} busy={actionBusy} actionError={actionError} onPick={pickAction} />
 
+      {actionNotice && (
+        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
+          <p>{actionNotice}</p>
+          <button type="button" aria-label="Uyarıyı kapat" onClick={() => setActionNotice(null)} className="text-xs font-semibold hover:underline">
+            Kapat
+          </button>
+        </div>
+      )}
+
       {skippedCount > 0 && !skippedDismissed && (
         <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
           <p>{`Dava oluşturuldu ancak ${skippedCount} belge/olay eklenemedi. Dava sayfasından tekrar ekleyebilirsiniz.`}</p>
@@ -719,6 +752,36 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
           )}
         </div>
       )}
+      {dialog === "close" && (
+        <CaseCloseModal caseId={caseId} pendingTaskCount={pendingTasks} onClose={() => setDialog(null)} onClosed={handleClosed} />
+      )}
+      {dialog === "reopen" && (
+        <CaseConfirmModal
+          title="Dava yeniden açılsın mı?"
+          message="Sonuç ve karar bilgisi temizlenecek; kapanış kaydı zaman çizelgesinde kalır."
+          confirmLabel="Yeniden aç"
+          fallbackError="Dava yeniden açılamadı. Lütfen tekrar deneyin."
+          onClose={() => setDialog(null)}
+          onConfirm={async () => {
+            handleCaseSaved(await reopenCase(caseId));
+            setDialog(null);
+            void refreshCaseAndDocuments();
+          }}
+        />
+      )}
+      {dialog === "archive" && (
+        <CaseConfirmModal
+          title="Dava arşivlensin mi?"
+          message="Arşivli dava salt okunur olur."
+          confirmLabel="Arşivle"
+          fallbackError="Dava arşivlenemedi. Lütfen tekrar deneyin."
+          onClose={() => setDialog(null)}
+          onConfirm={async () => {
+            handleCaseSaved(await archiveCase(caseId));
+            setDialog(null);
+          }}
+        />
+      )}
       {dialog === "edit" && (
         <CaseEditModal
           caseDetail={caseDetail}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseCloseModal.test.tsx src/components/__tests__/CaseConfirmModal.test.tsx src/components/__tests__/CaseDetailLifecycle.test.tsx src/lib/__tests__/closing.test.ts
cd frontend && npx tsc --noEmit
```

Expected: PASS —

```text
Test Files 4 passed (4)
Tests 33 passed (33)
```

`tsc` prints nothing.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
```

Expected: PASS — no failures (562 tests in 61 files); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseCloseModal.tsx frontend/src/components/CaseConfirmModal.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/__tests__/CaseCloseModal.test.tsx frontend/src/components/__tests__/CaseConfirmModal.test.tsx frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx frontend/src/lib/__tests__/closing.test.ts frontend/src/lib/closing.ts
git commit -F - <<'EOF'
feat: close dialog with decision document, reopen and archive confirmations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 8: Decision card, archive banner and a read-only archived page (frontend)

A closed case shows its decision on the overview; an archived case shows a banner and loses every add/edit control. The Taraflar / Uyuşmazlık `Düzenle` buttons follow the same permission rule as the menu (Decision 15), and the pages that can meet a 409 show the server's text (Decision 16).

**Files:**
- Create: `frontend/src/components/CaseDecisionCard.tsx`
- Modify: `frontend/src/components/CaseDisputeCard.tsx`
- Modify: `frontend/src/components/CaseDocumentsPanel.tsx`
- Modify: `frontend/src/components/CaseHeader.tsx`
- Modify: `frontend/src/components/CasePartiesCard.tsx`
- Modify: `frontend/src/components/TasksView.tsx`
- Modify: `frontend/src/components/calendar/CalendarEventDrawer.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx`
- Test (modify): `frontend/src/components/__tests__/CalendarEventDrawer.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseDecisionCard.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseDetailArchived.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseDetailIntakeCards.test.tsx`
- Test (create): `frontend/src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx`
- Test (modify): `frontend/src/components/__tests__/TasksView.test.tsx`

**Interfaces:**
- Consumes: Tasks 5–7 (`canManageCase`, `CaseHeader`, `CaseDetailView` state), `userMessage`, `CASE_OUTCOME_LABELS`, `formatDate`.
- Produces: `CaseDecisionCard({caseDetail})`; archive banner (`role="note"`) inside `CaseHeader`; required `canEdit` prop on `CasePartiesCard` and `CaseDisputeCard`; `readOnly?` prop on `CaseDocumentsPanel` (no upload zone, no delete; copy and download stay); `TasksView` and `CalendarEventDrawer` use `userMessage`.

- [ ] **Step 1: Write the failing tests**

Modify `frontend/src/components/__tests__/CalendarEventDrawer.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CalendarEventDrawer.test.tsx
+++ b/frontend/src/components/__tests__/CalendarEventDrawer.test.tsx
@@ -15,6 +15,7 @@ vi.mock("@/lib/api", () => ({
 }));
 
 import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
+import { ApiError } from "@/lib/apiError";
 import type { CalendarEvent } from "@/types";
 
 const event: CalendarEvent = {
@@ -115,6 +116,14 @@ describe("CalendarEventDrawer", () => {
     expect(handlers.onClose).toHaveBeenCalled();
   });
 
+  it("shows the server's message, such as the archived-case refusal", async () => {
+    deleteCalendarEvent.mockRejectedValue(new ApiError("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.", 409));
+    renderDrawer(event);
+    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
+    await userEvent.click(screen.getByRole("button", { name: "Evet, sil" }));
+    expect(await screen.findByRole("alert")).toHaveTextContent("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.");
+  });
+
   it("ignores Escape and disables actions while busy", async () => {
     deleteCalendarEvent.mockReturnValue(new Promise(() => {}));
     const handlers = renderDrawer(event);
```

Create `frontend/src/components/__tests__/CaseDecisionCard.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { CaseDecisionCard } from "@/components/CaseDecisionCard";
import type { Case } from "@/types";

const closed = { status: "kapali", outcome: "lost", decision_date: "2026-10-01", closing_note: "Karar tebliğ edildi.\nİstinaf süresi 2 hafta." } as unknown as Case;

describe("CaseDecisionCard", () => {
  it("shows the outcome, the decision date and the note", () => {
    render(<CaseDecisionCard caseDetail={closed} />);
    const card = screen.getByRole("region", { name: "Karar bilgisi" });
    expect(within(card).getByText("Sonuç").nextSibling).toHaveTextContent("Kaybedildi");
    expect(within(card).getByText("Karar tarihi").nextSibling).toHaveTextContent("01.10.2026");
    expect(within(card).getByText("Karar notu").nextSibling).toHaveTextContent("Karar tebliğ edildi.");
    expect(within(card).getByText("Karar notu").nextSibling).toHaveTextContent("İstinaf süresi 2 hafta.");
  });

  it.each([
    ["won", "Kazanıldı"],
    ["settled", "Sulh"],
  ])("labels the %s outcome", (outcome, label) => {
    render(<CaseDecisionCard caseDetail={{ ...closed, outcome } as unknown as Case} />);
    expect(screen.getByText("Sonuç").nextSibling).toHaveTextContent(label);
  });

  it("shows a dash for what a case closed before decisions were recorded does not have", () => {
    render(<CaseDecisionCard caseDetail={{ status: "kapali", outcome: "ongoing", decision_date: null, closing_note: null } as unknown as Case} />);
    for (const label of ["Sonuç", "Karar tarihi", "Karar notu"]) {
      expect(screen.getByText(label).nextSibling).toHaveTextContent("—");
    }
  });
});
```

Create `frontend/src/components/__tests__/CaseDetailArchived.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const getCase = vi.fn();
const getMe = vi.fn();
const listSimulations = vi.fn();
const listDocuments = vi.fn();
const listCaseTasks = vi.fn();
const unarchiveCase = vi.fn();
const updateTaskStatus = vi.fn();
const addCaseEvent = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listSimulations: (...args: unknown[]) => listSimulations(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
  updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
  addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
  updateCase: vi.fn(),
  startSimulation: vi.fn(),
  getSimulation: vi.fn(),
  retrySimulation: vi.fn(),
  uploadDocument: vi.fn(),
  generateHandover: vi.fn(),
  createTask: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}));

import { CaseDetailView } from "@/components/CaseDetailView";
import { ApiError } from "@/lib/apiError";

const owner = { id: "u-owner", role: "lawyer", full_name: "Ayşe Avukat" };
const colleague = { id: "u-colleague", role: "lawyer", full_name: "Mehmet Avukat" };

const baseCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Sözleşmenin Feshi Davası",
  client_name: "Deniz Arslan",
  opposing_party: null,
  case_type: "sozlesme",
  court: null,
  court_file_number: null,
  assigned_lawyer_id: "u-owner",
  opening_date: "2026-01-12",
  next_hearing_date: null,
  status: "devam_eden",
  outcome: "ongoing",
  decision_date: null,
  closing_note: null,
  case_value: null,
  description: null,
  client_role: "plaintiff",
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [{ id: "p1", name: "Deniz Arslan", role: "plaintiff", is_client: true, counsel_name: null, sort_order: 0 }],
  is_archived: false,
  is_precedent: false,
  timeline: [{ id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-12" }],
};
const closedCase = { ...baseCase, status: "kapali", outcome: "won", decision_date: "2026-10-01", closing_note: "Karar tebliğ edildi." };
const archivedCase = { ...closedCase, is_archived: true };
const task = { id: "t1", title: "Vekalet", status: "pending", due_date: null, description: null };
const document = { id: "d1", filename: "karar.pdf", file_type: "pdf", uploaded_at: "2026-10-01T10:00:00", extracted_text: "Karar metni" };

async function renderCase(caseDetail: object, me: object = owner) {
  getCase.mockResolvedValue(caseDetail);
  getMe.mockResolvedValue(me);
  render(<CaseDetailView caseId="c1" />);
  await screen.findByRole("heading", { name: "Sözleşmenin Feshi Davası" });
  await waitFor(() => expect(getMe).toHaveBeenCalled());
}

beforeEach(() => {
  resetNav();
  setUrl("/davalar/c1");
  for (const mock of [getCase, getMe, listSimulations, listDocuments, listCaseTasks, unarchiveCase, updateTaskStatus, addCaseEvent]) mock.mockReset();
  listSimulations.mockResolvedValue([]);
  listDocuments.mockResolvedValue([document]);
  listCaseTasks.mockResolvedValue([task]);
});

describe("decision card", () => {
  it("is shown on the overview of a closed case", async () => {
    await renderCase(closedCase);
    const card = screen.getByRole("region", { name: "Karar bilgisi" });
    expect(card).toHaveTextContent("Kazanıldı");
    expect(card).toHaveTextContent("Karar tebliğ edildi.");
  });

  it("is not shown for an open case", async () => {
    await renderCase(baseCase);
    expect(screen.queryByRole("region", { name: "Karar bilgisi" })).toBeNull();
  });
});

describe("archived case", () => {
  it("shows the archive banner with an unarchive button for the responsible lawyer", async () => {
    unarchiveCase.mockResolvedValue({ ...archivedCase, is_archived: false });
    await renderCase(archivedCase);
    expect(screen.getByRole("note")).toHaveTextContent("Bu dava arşivlendi; salt okunur.");

    await userEvent.click(screen.getByRole("button", { name: "Arşivden çıkar" }));

    await waitFor(() => expect(unarchiveCase).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByRole("note")).toBeNull());
  });

  it("shows the banner without the button to someone who may not manage the case", async () => {
    await renderCase(archivedCase, colleague);
    expect(screen.getByRole("note")).toHaveTextContent("Bu dava arşivlendi; salt okunur.");
    expect(screen.queryByRole("button", { name: "Arşivden çıkar" })).toBeNull();
  });

  it("shows no banner on a case that is not archived", async () => {
    await renderCase(closedCase);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("hides the edit buttons of the parties and dispute cards", async () => {
    await renderCase(archivedCase);
    expect(screen.queryByRole("button", { name: "Tarafları düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeNull();
  });

  it("keeps the edit buttons on a case that may be changed", async () => {
    await renderCase(baseCase);
    expect(screen.getByRole("button", { name: "Tarafları düzenle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeInTheDocument();
  });

  it("hides the edit buttons from a lawyer who may not manage the case, open or not", async () => {
    await renderCase(baseCase, colleague);
    expect(screen.queryByRole("button", { name: "Tarafları düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeNull();
  });

  it("has no event form on the developments tab", async () => {
    await renderCase(archivedCase);
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gelişme Başlığı")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ekle" })).toBeNull();
  });

  it("has no task form and read-only task checkboxes on the tasks tab", async () => {
    await renderCase(archivedCase);
    await userEvent.click(screen.getByRole("tab", { name: "Görevler" }));
    expect(screen.getByText("Vekalet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Görev Başlığı")).toBeNull();
    expect(screen.queryByRole("button", { name: "Görev Ekle" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Vekalet tamamlandı olarak işaretle" })).toBeDisabled();
  });

  it("has no upload zone or delete button on the documents tab, but keeps download", async () => {
    await renderCase(archivedCase);
    await userEvent.click(screen.getByRole("tab", { name: "Belgeler" }));
    expect(await screen.findByRole("button", { name: "İndir" })).toBeInTheDocument();
    expect(screen.queryByText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByLabelText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("still offers upload and delete on an open case", async () => {
    await renderCase(baseCase);
    await userEvent.click(screen.getByRole("tab", { name: "Belgeler" }));
    expect(await screen.findByText(/Belge Yükle/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it("shows the server's message when a write is refused anyway (the case was archived elsewhere)", async () => {
    addCaseEvent.mockRejectedValueOnce(new ApiError("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.", 409));
    await renderCase(baseCase);
    await userEvent.click(screen.getByRole("tab", { name: "Gelişmeler" }));
    await userEvent.type(screen.getByLabelText("Tarih"), "2026-10-02");
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Not");
    await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
    expect(await screen.findByText("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.")).toBeInTheDocument();
  });
});
```

Modify `frontend/src/components/__tests__/CaseDetailIntakeCards.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseDetailIntakeCards.test.tsx
+++ b/frontend/src/components/__tests__/CaseDetailIntakeCards.test.tsx
@@ -31,7 +31,7 @@ beforeEach(() => updateCase.mockReset());
 
 describe("CasePartiesCard", () => {
   it("lists the parties with role, counsel and the client badge", () => {
-    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CasePartiesCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     expect(screen.getByRole("heading", { name: "Taraflar" })).toBeInTheDocument();
     const rows = screen.getAllByRole("listitem");
     expect(rows).toHaveLength(2);
@@ -44,7 +44,7 @@ describe("CasePartiesCard", () => {
   });
 
   it("says so when no party is recorded", () => {
-    render(<CasePartiesCard caseDetail={{ ...baseCase, parties: [] }} onSaved={vi.fn()} />);
+    render(<CasePartiesCard canEdit caseDetail={{ ...baseCase, parties: [] }} onSaved={vi.fn()} />);
     expect(screen.getByText("Kayıtlı taraf yok.")).toBeInTheDocument();
   });
 
@@ -52,7 +52,7 @@ describe("CasePartiesCard", () => {
     const updated = { ...baseCase, client_name: "Alfa Ticaret A.Ş. Yeni" } as Case;
     updateCase.mockResolvedValue(updated);
     const onSaved = vi.fn();
-    render(<CasePartiesCard caseDetail={baseCase} onSaved={onSaved} />);
+    render(<CasePartiesCard canEdit caseDetail={baseCase} onSaved={onSaved} />);
 
     await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
     const first = screen.getByRole("group", { name: "Taraf 1" });
@@ -72,7 +72,7 @@ describe("CasePartiesCard", () => {
   });
 
   it("requires a client before saving", async () => {
-    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CasePartiesCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
     await userEvent.click(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText("Müvekkilimiz"));
     await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
@@ -83,7 +83,7 @@ describe("CasePartiesCard", () => {
   it("shows the server error in an alert and stays in edit mode", async () => {
     updateCase.mockRejectedValueOnce(new ApiError("Sunucu hatası", 500));
     const onSaved = vi.fn();
-    render(<CasePartiesCard caseDetail={baseCase} onSaved={onSaved} />);
+    render(<CasePartiesCard canEdit caseDetail={baseCase} onSaved={onSaved} />);
     await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
     await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
     expect(await screen.findByRole("alert")).toHaveTextContent("Sunucu hatası");
@@ -93,14 +93,14 @@ describe("CasePartiesCard", () => {
 
   it("shows a Turkish fallback for a non-ApiError failure", async () => {
     updateCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
-    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CasePartiesCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
     await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
     expect(await screen.findByRole("alert")).toHaveTextContent("Taraflar kaydedilemedi.");
   });
 
   it("discards edits on Vazgeç", async () => {
-    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CasePartiesCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
     await userEvent.type(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText(/^Ad/), "xyz");
     await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
@@ -113,7 +113,7 @@ describe("CasePartiesCard", () => {
 
 describe("CaseDisputeCard", () => {
   it("shows the dispute fields with labels for the client's side", () => {
-    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CaseDisputeCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     expect(screen.getByRole("heading", { name: "Uyuşmazlık" })).toBeInTheDocument();
     expect(screen.getByText("2026/145 E.")).toBeInTheDocument();
     expect(screen.getByText("150.000 TL alacak")).toBeInTheDocument();
@@ -127,7 +127,7 @@ describe("CaseDisputeCard", () => {
   });
 
   it("uses neutral labels when the client's side is unknown", () => {
-    render(<CaseDisputeCard caseDetail={{ ...baseCase, client_role: null }} onSaved={vi.fn()} />);
+    render(<CaseDisputeCard canEdit caseDetail={{ ...baseCase, client_role: null }} onSaved={vi.fn()} />);
     expect(screen.getByText("Davacının iddiası")).toBeInTheDocument();
     expect(screen.getByText("Davalının savunması")).toBeInTheDocument();
   });
@@ -136,7 +136,7 @@ describe("CaseDisputeCard", () => {
     const updated = { ...baseCase, claim: "Yeni talep" } as Case;
     updateCase.mockResolvedValue(updated);
     const onSaved = vi.fn();
-    render(<CaseDisputeCard caseDetail={baseCase} onSaved={onSaved} />);
+    render(<CaseDisputeCard canEdit caseDetail={baseCase} onSaved={onSaved} />);
 
     await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
     const claim = screen.getByLabelText("Talep / dava konusu");
@@ -160,7 +160,7 @@ describe("CaseDisputeCard", () => {
 
   it("shows the server error in an alert", async () => {
     updateCase.mockRejectedValueOnce(new ApiError("Sunucu hatası", 500));
-    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CaseDisputeCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
     await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
     expect(await screen.findByRole("alert")).toHaveTextContent("Sunucu hatası");
@@ -168,14 +168,14 @@ describe("CaseDisputeCard", () => {
 
   it("shows a Turkish fallback for a non-ApiError failure", async () => {
     updateCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
-    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CaseDisputeCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
     await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
     expect(await screen.findByRole("alert")).toHaveTextContent("Uyuşmazlık bilgileri kaydedilemedi.");
   });
 
   it("discards edits on Vazgeç", async () => {
-    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
+    render(<CaseDisputeCard canEdit caseDetail={baseCase} onSaved={vi.fn()} />);
     await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
     await userEvent.type(screen.getByLabelText("Talep / dava konusu"), " ekle");
     await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
@@ -183,3 +183,17 @@ describe("CaseDisputeCard", () => {
     expect(updateCase).not.toHaveBeenCalled();
   });
 });
+
+describe("canEdit", () => {
+  it("hides the edit buttons of both cards when false", () => {
+    render(
+      <>
+        <CasePartiesCard canEdit={false} caseDetail={baseCase} onSaved={vi.fn()} />
+        <CaseDisputeCard canEdit={false} caseDetail={baseCase} onSaved={vi.fn()} />
+      </>,
+    );
+    expect(screen.getByText("Alfa Ticaret A.Ş.")).toBeInTheDocument();
+    expect(screen.queryByRole("button", { name: "Tarafları düzenle" })).toBeNull();
+    expect(screen.queryByRole("button", { name: "Uyuşmazlığı düzenle" })).toBeNull();
+  });
+});
```

Create `frontend/src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ deleteDocument: vi.fn(), downloadDocument: vi.fn() }));

import { CaseDocumentsPanel } from "@/components/CaseDocumentsPanel";
import type { DocumentItem } from "@/types";

const document = { id: "d1", filename: "karar.pdf", file_type: "pdf", uploaded_at: "2026-10-01T10:00:00", extracted_text: "Karar metni" } as DocumentItem;

function renderPanel(documents: DocumentItem[], readOnly: boolean) {
  render(<CaseDocumentsPanel documents={documents} uploading={false} uploadError={null} onUpload={vi.fn()} onDeleted={vi.fn()} readOnly={readOnly} />);
}

describe("CaseDocumentsPanel readOnly", () => {
  it("shows the upload zone and delete when it can be changed", () => {
    renderPanel([document], false);
    expect(screen.getByText(/Belge Yükle/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it("hides the upload zone and delete but keeps copy and download when read-only", () => {
    renderPanel([document], true);
    expect(screen.queryByText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
    expect(screen.getByRole("button", { name: "İndir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
  });

  it("shows only the empty state, without a prompt to upload, when read-only and empty", () => {
    renderPanel([], true);
    expect(screen.getByText("Henüz belge yok.")).toBeInTheDocument();
    expect(screen.queryByText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByText("Bu davaya PDF, DOCX veya TXT belge yükleyin.")).toBeNull();
  });
});
```

Modify `frontend/src/components/__tests__/TasksView.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/TasksView.test.tsx
+++ b/frontend/src/components/__tests__/TasksView.test.tsx
@@ -87,6 +87,19 @@ describe("TasksView", () => {
     await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith("c1", "t1", "completed"));
   });
 
+  it("shows the server's message when a task cannot be changed (archived case), else a Turkish fallback", async () => {
+    listAllTasks.mockResolvedValue([pendingTask]);
+    updateTaskStatus.mockRejectedValueOnce(new ApiError("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.", 409));
+    render(<TasksView />);
+    await userEvent.click(await screen.findByRole("checkbox"));
+    expect(await screen.findByText("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.")).toBeInTheDocument();
+
+    updateTaskStatus.mockRejectedValueOnce(new TypeError("Failed to fetch"));
+    await userEvent.click(screen.getByRole("checkbox"));
+    expect(await screen.findByText("Görev güncellenemedi. Lütfen tekrar deneyin.")).toBeInTheDocument();
+    expect(screen.queryByText("Failed to fetch")).toBeNull();
+  });
+
   it("filters by ?vade=gecikmis and lists overdue first by default", async () => {
     listAllTasks.mockResolvedValue([futureTask, overdueTask, doneTask]);
 
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/CalendarEventDrawer.test.tsx src/components/__tests__/CaseDecisionCard.test.tsx src/components/__tests__/CaseDetailArchived.test.tsx src/components/__tests__/CaseDetailIntakeCards.test.tsx src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx src/components/__tests__/TasksView.test.tsx
```

Expected: FAIL —

```text
FAIL src/components/__tests__/CaseDecisionCard.test.tsx
FAIL src/components/__tests__/CalendarEventDrawer.test.tsx
FAIL src/components/__tests__/CaseDetailArchived.test.tsx
FAIL src/components/__tests__/CaseDetailIntakeCards.test.tsx
Error: Failed to resolve import "@/components/CaseDecisionCard" from "src/components/__tests__/CaseDecisionCard.test.tsx". Does the file exist?
Error: expect(element).toHaveTextContent()
```

- [ ] **Step 3: Implement**

Create `frontend/src/components/CaseDecisionCard.tsx`:

```tsx
import { CASE_OUTCOME_LABELS, formatDate } from "@/lib/labels";
import type { Case } from "@/types";

const CLOSED_OUTCOMES = new Set(["won", "lost", "settled"]);

/** "Karar bilgisi" of a closed case; what a case closed before decisions were recorded lacks shows as "—". */
export function CaseDecisionCard({ caseDetail }: { caseDetail: Case }) {
  const rows: [string, string][] = [
    ["Sonuç", CLOSED_OUTCOMES.has(caseDetail.outcome) ? CASE_OUTCOME_LABELS[caseDetail.outcome] : "—"],
    ["Karar tarihi", caseDetail.decision_date ? formatDate(caseDetail.decision_date) : "—"],
    ["Karar notu", caseDetail.closing_note?.trim() ? caseDetail.closing_note : "—"],
  ];
  return (
    <section aria-labelledby="karar-bilgisi-baslik" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <h2 id="karar-bilgisi-baslik" className="mb-3 text-sm font-semibold text-navy-800">
        Karar bilgisi
      </h2>
      <dl className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
            <dd className="whitespace-pre-wrap text-sm text-navy-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

Modify `frontend/src/components/CaseDisputeCard.tsx`:

```diff
--- a/frontend/src/components/CaseDisputeCard.tsx
+++ b/frontend/src/components/CaseDisputeCard.tsx
@@ -12,6 +12,8 @@ import type { Case } from "@/types";
 interface Props {
   caseDetail: Case;
   onSaved: (updated: Case) => void;
+  /** False for an archived case or a user who may not change it: the edit button is not shown. */
+  canEdit: boolean;
 }
 
 const NO_AI: ReadonlySet<string> = new Set();
@@ -26,7 +28,7 @@ function ReadOnlyField({ label, value }: { label: string; value: string | null }
 }
 
 /** "Uyuşmazlık" card of the case detail: file number, claim, facts, both sides' positions and general notes. */
-export function CaseDisputeCard({ caseDetail, onSaved }: Props) {
+export function CaseDisputeCard({ caseDetail, onSaved, canEdit }: Props) {
   const [editing, setEditing] = useState(false);
   const [form, setForm] = useState<CaseFormState | null>(null);
   const [error, setError] = useState<string | null>(null);
@@ -60,7 +62,7 @@ export function CaseDisputeCard({ caseDetail, onSaved }: Props) {
     <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
       <header className="mb-3 flex items-center justify-between">
         <h2 className="text-sm font-semibold text-navy-800">Uyuşmazlık</h2>
-        {!editing && (
+        {canEdit && !editing && (
           <button
             type="button"
             aria-label="Uyuşmazlığı düzenle"
```

Modify `frontend/src/components/CaseDocumentsPanel.tsx`:

```diff
--- a/frontend/src/components/CaseDocumentsPanel.tsx
+++ b/frontend/src/components/CaseDocumentsPanel.tsx
@@ -25,9 +25,11 @@ interface Props {
   uploadError: string | null;
   onUpload: (file: File) => void;
   onDeleted: (id: string) => void;
+  /** Archived case: no upload and no delete. */
+  readOnly?: boolean;
 }
 
-export function CaseDocumentsPanel({ documents, uploading, uploadError, onUpload, onDeleted }: Props) {
+export function CaseDocumentsPanel({ documents, uploading, uploadError, onUpload, onDeleted, readOnly = false }: Props) {
   const [selectedId, setSelectedId] = useState<string | null>(documents[0]?.id ?? null);
   const [listFilter, setListFilter] = useState("");
   const [query, setQuery] = useState("");
@@ -149,7 +151,7 @@ export function CaseDocumentsPanel({ documents, uploading, uploadError, onUpload
     });
   }
 
-  const uploadZone = (
+  const uploadZone = readOnly ? null : (
     <div
       onDragOver={(e) => {
         e.preventDefault();
@@ -190,7 +192,7 @@ export function CaseDocumentsPanel({ documents, uploading, uploadError, onUpload
       <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
         {uploadZone}
         {uploadError && <ErrorState message={uploadError} />}
-        <EmptyState message="Henüz belge yok." hint="Bu davaya PDF, DOCX veya TXT belge yükleyin." />
+        <EmptyState message="Henüz belge yok." hint={readOnly ? undefined : "Bu davaya PDF, DOCX veya TXT belge yükleyin."} />
       </div>
     );
   }
@@ -271,7 +273,7 @@ export function CaseDocumentsPanel({ documents, uploading, uploadError, onUpload
                 <ToolButton onClick={handleDownload} disabled={busy === "download"}>
                   {busy === "download" ? "İndiriliyor..." : "İndir"}
                 </ToolButton>
-                {confirmDelete ? (
+                {readOnly ? null : confirmDelete ? (
                   <span className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">
                     Silinsin mi?
                     <button type="button" onClick={handleDelete} disabled={busy === "delete"} className="font-semibold hover:underline">
```

Modify `frontend/src/components/CaseHeader.tsx`:

```diff
--- a/frontend/src/components/CaseHeader.tsx
+++ b/frontend/src/components/CaseHeader.tsx
@@ -47,6 +47,23 @@ export function CaseHeader({ caseDetail, actions, busy, actionError, onPick }: P
         <CaseActionsMenu actions={actions} busy={busy} onPick={onPick} />
       </div>
       <CaseBadges item={caseDetail} />
+      {caseDetail.is_archived && (
+        <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
+          <p>Bu dava arşivlendi; salt okunur.</p>
+          {actions.includes("unarchive") && (
+            <button
+              type="button"
+              aria-disabled={busy}
+              onClick={() => {
+                if (!busy) onPick("unarchive");
+              }}
+              className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
+            >
+              Arşivden çıkar
+            </button>
+          )}
+        </div>
+      )}
       {actionError && (
         <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
           {actionError}
```

Modify `frontend/src/components/CasePartiesCard.tsx`:

```diff
--- a/frontend/src/components/CasePartiesCard.tsx
+++ b/frontend/src/components/CasePartiesCard.tsx
@@ -20,12 +20,14 @@ import type { Case } from "@/types";
 interface Props {
   caseDetail: Case;
   onSaved: (updated: Case) => void;
+  /** False for an archived case or a user who may not change it: the edit button is not shown. */
+  canEdit: boolean;
 }
 
 const NO_AI: ReadonlySet<string> = new Set();
 
 /** "Taraflar" card of the case detail: read-only list with an inline editor. */
-export function CasePartiesCard({ caseDetail, onSaved }: Props) {
+export function CasePartiesCard({ caseDetail, onSaved, canEdit }: Props) {
   const [editing, setEditing] = useState(false);
   const [rows, setRows] = useState<PartyRow[]>([]);
   const [error, setError] = useState<string | null>(null);
@@ -67,7 +69,7 @@ export function CasePartiesCard({ caseDetail, onSaved }: Props) {
     <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
       <header className="mb-3 flex items-center justify-between">
         <h2 className="text-sm font-semibold text-navy-800">Taraflar</h2>
-        {!editing && (
+        {canEdit && !editing && (
           <button
             type="button"
             aria-label="Tarafları düzenle"
```

Modify `frontend/src/components/TasksView.tsx`:

```diff
--- a/frontend/src/components/TasksView.tsx
+++ b/frontend/src/components/TasksView.tsx
@@ -18,6 +18,7 @@ import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
 import type { Case, Task, TaskWithCase } from "@/types";
 import { LoadingState } from "@/components/LoadingState";
 import { ErrorState } from "@/components/ErrorState";
+import { userMessage } from "@/lib/userMessages";
 import { EmptyState } from "@/components/EmptyState";
 import { TaskFormModal } from "@/components/tasks/TaskFormModal";
 import { FilterChips, NoFilterResults } from "@/components/FilterChips";
@@ -56,8 +57,8 @@ export function TasksView() {
     try {
       const updated = await updateTaskStatus(task.case_id, task.id, nextStatus);
       setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
-    } catch {
-      setToggleError("Görev güncellenemedi. Lütfen tekrar deneyin.");
+    } catch (err) {
+      setToggleError(userMessage(err, "Görev güncellenemedi. Lütfen tekrar deneyin."));
     }
   }
 
```

Modify `frontend/src/components/calendar/CalendarEventDrawer.tsx`:

```diff
--- a/frontend/src/components/calendar/CalendarEventDrawer.tsx
+++ b/frontend/src/components/calendar/CalendarEventDrawer.tsx
@@ -6,6 +6,7 @@ import { useEffect, useRef, useState } from "react";
 import { deleteCalendarEvent, updateCalendarEvent, updateTaskReminders, updateTaskStatus } from "@/lib/api";
 import { EVENT_TYPE_LABELS, describeReminders, formatDayLong, isTimed, timeLabel } from "@/lib/calendar";
 import { caseDetailHref } from "@/lib/filters";
+import { userMessage } from "@/lib/userMessages";
 import type { CalendarEvent } from "@/types";
 import { TYPE_DOTS } from "@/components/calendar/CalendarItemButton";
 import { ReminderPicker } from "@/components/calendar/ReminderPicker";
@@ -69,8 +70,8 @@ export function CalendarEventDrawer({
     try {
       await action();
       after();
-    } catch {
-      setError(failure);
+    } catch (err) {
+      setError(userMessage(err, failure));
     } finally {
       setBusy(false);
     }
```

Modify `frontend/src/components/CaseDetailView.tsx`:

```diff
--- a/frontend/src/components/CaseDetailView.tsx
+++ b/frontend/src/components/CaseDetailView.tsx
@@ -24,7 +24,7 @@ import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, SIMULATION_STATUS_LABELS, formatD
 import { parseCaseTab, type CaseTabSlug } from "@/lib/filters";
 import { useUrlParams } from "@/lib/urlState";
 import type { AppUser, Case, CaseDetail, DocumentItem, HandoverReport, Simulation, Task } from "@/types";
-import { caseActions, type CaseAction } from "@/lib/caseAccess";
+import { canManageCase, caseActions, type CaseAction } from "@/lib/caseAccess";
 import { userMessage } from "@/lib/userMessages";
 import { LoadingState } from "@/components/LoadingState";
 import { ErrorState } from "@/components/ErrorState";
@@ -41,6 +41,7 @@ import { CaseHeader } from "@/components/CaseHeader";
 import { CaseEditModal } from "@/components/CaseEditModal";
 import { CaseCloseModal, type CloseResult } from "@/components/CaseCloseModal";
 import { CaseConfirmModal } from "@/components/CaseConfirmModal";
+import { CaseDecisionCard } from "@/components/CaseDecisionCard";
 
 const TABS = [
   { slug: "genel", label: "Genel Bakış" },
@@ -202,8 +203,8 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
       await uploadDocument(caseId, file);
       const refreshed = await listDocuments(caseId);
       setDocuments(refreshed);
-    } catch {
-      setUploadError("Belge yüklenemedi. Lütfen tekrar deneyin.");
+    } catch (err) {
+      setUploadError(userMessage(err, "Belge yüklenemedi. Lütfen tekrar deneyin."));
     } finally {
       setUploading(false);
     }
@@ -220,8 +221,8 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
       });
       setCaseDetail((prev) => (prev ? { ...prev, timeline: [...prev.timeline, newEvent] } : prev));
       setEventForm({ event_date: "", title: "" });
-    } catch {
-      setEventError("Gelişme eklenemedi. Lütfen tekrar deneyin.");
+    } catch (err) {
+      setEventError(userMessage(err, "Gelişme eklenemedi. Lütfen tekrar deneyin."));
     } finally {
       setAddingEvent(false);
     }
@@ -237,8 +238,8 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
       const newTask = await createTask(caseId, payload);
       setTasks((prev) => [...prev, newTask]);
       setTaskForm({ title: "", due_date: "" });
-    } catch {
-      setTaskError("Görev eklenemedi. Lütfen tekrar deneyin.");
+    } catch (err) {
+      setTaskError(userMessage(err, "Görev eklenemedi. Lütfen tekrar deneyin."));
     } finally {
       setAddingTask(false);
     }
@@ -250,8 +251,8 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
     try {
       const updated = await updateTaskStatus(caseId, task.id, nextStatus);
       setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
-    } catch {
-      setTaskError("Görev güncellenemedi. Lütfen tekrar deneyin.");
+    } catch (err) {
+      setTaskError(userMessage(err, "Görev güncellenemedi. Lütfen tekrar deneyin."));
     }
   }
 
@@ -327,6 +328,8 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   if (!caseDetail) return null;
 
   const actions = caseActions(me, caseDetail);
+  const archived = caseDetail.is_archived;
+  const canEditDetails = !archived && canManageCase(me, caseDetail);
   const notes = caseDetail.timeline.filter((e) => e.event_type === "note");
   const pendingTasks = tasks.filter((task) => task.status === "pending").length;
   const latestEvents = [...caseDetail.timeline].sort((a, b) => b.event_date.localeCompare(a.event_date));
@@ -405,9 +408,11 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
             </div>
           </section>
 
+          {caseDetail.status === "kapali" && <CaseDecisionCard caseDetail={caseDetail} />}
+
           <div className="grid gap-4 xl:grid-cols-2">
-            <CasePartiesCard caseDetail={caseDetail} onSaved={handleCaseSaved} />
-            <CaseDisputeCard caseDetail={caseDetail} onSaved={handleCaseSaved} />
+            <CasePartiesCard caseDetail={caseDetail} onSaved={handleCaseSaved} canEdit={canEditDetails} />
+            <CaseDisputeCard caseDetail={caseDetail} onSaved={handleCaseSaved} canEdit={canEditDetails} />
           </div>
 
           <div className="grid grid-cols-3 gap-3">
@@ -439,7 +444,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
             <section className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
               <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
                 <div><h2 className="text-sm font-semibold text-navy-800">Gelişmeler</h2><p className="text-[11px] text-navy-500">En yeniden eskiye dosya hareketleri</p></div>
-                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gelismeler")!)} className="text-xs font-semibold text-accent-700 hover:underline">Gelişme ekle →</button>
+                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gelismeler")!)} className="text-xs font-semibold text-accent-700 hover:underline">{archived ? "Tümünü aç →" : "Gelişme ekle →"}</button>
               </header>
               {latestEvents.length === 0 ? <div className="grid flex-1 place-items-center p-5"><EmptyState message="Henüz gelişme yok." /></div> : <ol className="max-h-[390px] overflow-y-auto p-4">
                 {latestEvents.map((event, index) => <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
@@ -453,13 +458,13 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
             <section className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
               <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
                 <div><h2 className="text-sm font-semibold text-navy-800">Görevler</h2><p className="text-[11px] text-navy-500">Öncelikli işler ve son tarihler</p></div>
-                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gorevler")!)} className="text-xs font-semibold text-accent-700 hover:underline">Görev ekle →</button>
+                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gorevler")!)} className="text-xs font-semibold text-accent-700 hover:underline">{archived ? "Tümünü aç →" : "Görev ekle →"}</button>
               </header>
               {orderedTasks.length === 0 ? <div className="grid flex-1 place-items-center p-5"><EmptyState message="Henüz görev yok." hint="Görevler sekmesinden ekleyebilirsiniz." /></div> : <ul className="max-h-[390px] divide-y divide-surface-border overflow-y-auto px-4">
                 {orderedTasks.map((task) => {
                   const overdue = task.status === "pending" && Boolean(task.due_date) && task.due_date! < new Date().toISOString().slice(0, 10);
                   return <li key={task.id} className="flex gap-3 py-3">
-                    <input type="checkbox" checked={task.status === "completed"} onChange={() => handleToggleTask(task)} className="mt-0.5 h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400" aria-label={`${task.title} tamamlandı olarak işaretle`} />
+                    <input type="checkbox" checked={task.status === "completed"} onChange={() => handleToggleTask(task)} disabled={archived} className="mt-0.5 h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400" aria-label={`${task.title} tamamlandı olarak işaretle`} />
                     <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status === "completed" ? "text-navy-400 line-through" : "text-navy-800"}`}>{task.title}</p>{task.description && <p className="mt-1 text-xs leading-5 text-navy-500">{task.description}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{task.due_date && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{overdue ? "Gecikti · " : "Son tarih · "}{formatDate(task.due_date)}</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${task.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-accent-50 text-accent-700"}`}>{task.status === "completed" ? "Tamamlandı" : "Devam ediyor"}</span></div></div>
                   </li>;
                 })}
@@ -484,45 +489,48 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
           uploadError={uploadError}
           onUpload={uploadFile}
           onDeleted={(id) => setDocuments((prev) => prev.filter((d) => d.id !== id))}
+          readOnly={archived}
         />
       )}
 
       {activeTab === "Gelişmeler" && (
         <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
+          {!archived && (
           <form onSubmit={handleAddEvent} className="flex flex-wrap items-end gap-3">
-            <div>
-              <label htmlFor="event_date" className="mb-1 block text-xs font-medium text-navy-600">
-                Tarih
-              </label>
-              <input
-                id="event_date"
-                type="date"
-                required
-                value={eventForm.event_date}
-                onChange={(event) => setEventForm({ ...eventForm, event_date: event.target.value })}
-                className="rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
-              />
-            </div>
-            <div className="flex-1 min-w-[200px]">
-              <label htmlFor="event_title" className="mb-1 block text-xs font-medium text-navy-600">
-                Gelişme Başlığı
-              </label>
-              <input
-                id="event_title"
-                required
-                value={eventForm.title}
-                onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })}
-                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
-              />
-            </div>
-            <button
-              type="submit"
-              disabled={addingEvent}
-              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
-            >
-              {addingEvent ? "Ekleniyor..." : "Ekle"}
-            </button>
-          </form>
+              <div>
+                <label htmlFor="event_date" className="mb-1 block text-xs font-medium text-navy-600">
+                  Tarih
+                </label>
+                <input
+                  id="event_date"
+                  type="date"
+                  required
+                  value={eventForm.event_date}
+                  onChange={(event) => setEventForm({ ...eventForm, event_date: event.target.value })}
+                  className="rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
+                />
+              </div>
+              <div className="flex-1 min-w-[200px]">
+                <label htmlFor="event_title" className="mb-1 block text-xs font-medium text-navy-600">
+                  Gelişme Başlığı
+                </label>
+                <input
+                  id="event_title"
+                  required
+                  value={eventForm.title}
+                  onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })}
+                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
+                />
+              </div>
+              <button
+                type="submit"
+                disabled={addingEvent}
+                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
+              >
+                {addingEvent ? "Ekleniyor..." : "Ekle"}
+              </button>
+            </form>
+          )}
           {eventError && <ErrorState message={eventError} />}
 
           {caseDetail.timeline.length === 0 ? (
@@ -545,43 +553,45 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
 
       {activeTab === "Görevler" && (
         <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
+          {!archived && (
           <form onSubmit={handleAddTask} className="flex flex-wrap items-end gap-3">
-            <div className="flex-1 min-w-[200px]">
-              <label htmlFor="task_title" className="mb-1 block text-xs font-medium text-navy-600">
-                Görev Başlığı
-              </label>
-              <input
-                id="task_title"
-                required
-                value={taskForm.title}
-                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
-                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
-              />
-            </div>
-            <div>
-              <label htmlFor="task_due_date" className="mb-1 block text-xs font-medium text-navy-600">
-                Son Tarih (opsiyonel)
-              </label>
-              <input
-                id="task_due_date"
-                type="date"
-                value={taskForm.due_date}
-                onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })}
-                className="rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
-              />
-            </div>
-            <button
-              type="submit"
-              disabled={addingTask}
-              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
-            >
-              {addingTask ? "Ekleniyor..." : "Görev Ekle"}
-            </button>
-          </form>
+              <div className="flex-1 min-w-[200px]">
+                <label htmlFor="task_title" className="mb-1 block text-xs font-medium text-navy-600">
+                  Görev Başlığı
+                </label>
+                <input
+                  id="task_title"
+                  required
+                  value={taskForm.title}
+                  onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
+                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
+                />
+              </div>
+              <div>
+                <label htmlFor="task_due_date" className="mb-1 block text-xs font-medium text-navy-600">
+                  Son Tarih (opsiyonel)
+                </label>
+                <input
+                  id="task_due_date"
+                  type="date"
+                  value={taskForm.due_date}
+                  onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })}
+                  className="rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
+                />
+              </div>
+              <button
+                type="submit"
+                disabled={addingTask}
+                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
+              >
+                {addingTask ? "Ekleniyor..." : "Görev Ekle"}
+              </button>
+            </form>
+          )}
           {taskError && <ErrorState message={taskError} />}
 
           {tasks.length === 0 ? (
-            <EmptyState message="Bu dava için henüz görev yok." hint="Yukarıdaki formla yeni bir görev ekleyin." />
+            <EmptyState message="Bu dava için henüz görev yok." hint={archived ? undefined : "Yukarıdaki formla yeni bir görev ekleyin."} />
           ) : (
             <ul className="divide-y divide-surface-border text-sm">
               {tasks.map((task) => (
@@ -590,6 +600,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
                     type="checkbox"
                     checked={task.status === "completed"}
                     onChange={() => handleToggleTask(task)}
+                    disabled={archived}
                     className="h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400"
                     aria-label={`${task.title} tamamlandı olarak işaretle`}
                   />
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/CalendarEventDrawer.test.tsx src/components/__tests__/CaseDecisionCard.test.tsx src/components/__tests__/CaseDetailArchived.test.tsx src/components/__tests__/CaseDetailIntakeCards.test.tsx src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx src/components/__tests__/TasksView.test.tsx
cd frontend && npx tsc --noEmit
```

Expected: PASS —

```text
Test Files 6 passed (6)
Tests 63 passed (63)
```

`tsc` prints nothing.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
```

Expected: PASS — no failures (585 tests in 64 files); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseDecisionCard.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/CaseDisputeCard.tsx frontend/src/components/CaseDocumentsPanel.tsx frontend/src/components/CaseHeader.tsx frontend/src/components/CasePartiesCard.tsx frontend/src/components/TasksView.tsx frontend/src/components/__tests__/CalendarEventDrawer.test.tsx frontend/src/components/__tests__/CaseDecisionCard.test.tsx frontend/src/components/__tests__/CaseDetailArchived.test.tsx frontend/src/components/__tests__/CaseDetailIntakeCards.test.tsx frontend/src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx frontend/src/components/__tests__/TasksView.test.tsx frontend/src/components/calendar/CalendarEventDrawer.tsx
git commit -F - <<'EOF'
feat: decision card, archive banner and read-only archived case page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 9: Archive switch and Arşivli badge in the case list (frontend)

`CaseListView` already honours `?arsiv=dahil`; this task adds the checkbox that writes it and the badge on archived rows.

**Files:**
- Modify: `frontend/src/components/CaseListView.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseListView.test.tsx`

**Interfaces:**
- Consumes: `parseCaseListQuery` / `setParams` (`arsiv`), `Case.is_archived`.
- Produces: Checkbox `Arşivi göster`; badge `Arşivli` next to the case name of archived rows.

- [ ] **Step 1: Write the failing tests**

Modify `frontend/src/components/__tests__/CaseListView.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseListView.test.tsx
+++ b/frontend/src/components/__tests__/CaseListView.test.tsx
@@ -181,4 +181,39 @@ describe("CaseListView", () => {
     expect(screen.getByText("Case A")).toBeInTheDocument();
     expect(screen.queryByText("Case B")).not.toBeInTheDocument();
   });
+
+  it("has an Arşivi göster checkbox that follows and writes the arsiv URL parameter", async () => {
+    getCases.mockResolvedValue([icraCase]);
+    render(<CaseListView />);
+    await screen.findByText("Kat Mülkiyeti Aidat Alacağı");
+    const box = screen.getByRole("checkbox", { name: "Arşivi göster" });
+    expect(box).not.toBeChecked();
+
+    await userEvent.click(box);
+    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?arsiv=dahil", { scroll: false });
+  });
+
+  it("shows the checkbox checked for ?arsiv=dahil and clears the parameter when unchecked", async () => {
+    setUrl("/davalar?arsiv=dahil");
+    getCases.mockResolvedValue([icraCase]);
+    render(<CaseListView />);
+    await screen.findByText("Kat Mülkiyeti Aidat Alacağı");
+    const box = screen.getByRole("checkbox", { name: "Arşivi göster" });
+    expect(box).toBeChecked();
+
+    await userEvent.click(box);
+    expect(nav.replace).toHaveBeenLastCalledWith("/davalar", { scroll: false });
+  });
+
+  it("marks archived cases with an Arşivli badge and no other case", async () => {
+    getCases.mockResolvedValue([
+      { ...icraCase, id: "c2", case_name: "Eski Dava", status: "kapali", is_archived: true },
+      icraCase,
+    ]);
+    render(<CaseListView />);
+    await screen.findByText("Eski Dava");
+    expect(screen.getAllByText("Arşivli")).toHaveLength(1);
+    const row = screen.getByText("Eski Dava").closest("tr")!;
+    expect(row).toHaveTextContent("Arşivli");
+  });
 });
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseListView.test.tsx
```

Expected: FAIL —

```text
FAIL src/components/__tests__/CaseListView.test.tsx
TestingLibraryElementError: Unable to find an accessible element with the role "checkbox" and name "Arşivi göster"
TestingLibraryElementError: Unable to find an element with the text: Arşivli. This could be because the text is broken up by multiple elements. In this case, you can prov
Test Files 1 failed (1)
Tests 3 failed | 12 passed (15)
```

- [ ] **Step 3: Implement**

Modify `frontend/src/components/CaseListView.tsx`:

```diff
--- a/frontend/src/components/CaseListView.tsx
+++ b/frontend/src/components/CaseListView.tsx
@@ -152,6 +152,15 @@ export function CaseListView() {
             </option>
           ))}
         </select>
+        <label className="flex items-center gap-2 text-sm text-navy-700">
+          <input
+            type="checkbox"
+            checked={query.arsiv === "dahil"}
+            onChange={(e) => setParams({ arsiv: e.target.checked ? "dahil" : null })}
+            className="h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400"
+          />
+          Arşivi göster
+        </label>
       </div>
 
       <FilterChips chips={chips} onRemove={removeFilter} onClear={clearFilters} resultCount={loading || error ? undefined : cases.length} />
@@ -187,6 +196,9 @@ export function CaseListView() {
                     <Link href={`/davalar/${c.id}`} className="font-medium text-navy-900 hover:text-accent-600">
                       {c.case_name}
                     </Link>
+                    {c.is_archived && (
+                      <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-navy-500">Arşivli</span>
+                    )}
                   </td>
                   <td className="px-4 py-3 text-navy-700">{c.client_name}</td>
                   <td className="px-4 py-3">
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseListView.test.tsx
cd frontend && npx tsc --noEmit
```

Expected: PASS —

```text
Test Files 1 passed (1)
Tests 15 passed (15)
```

`tsc` prints nothing.

- [ ] **Step 5: Run the whole suite for regressions**

```bash
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

Expected: PASS — no failures (588 tests in 64 files); `tsc` prints nothing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseListView.tsx frontend/src/components/__tests__/CaseListView.test.tsx
git commit -F - <<'EOF'
feat: archive switch and Arşivli badge in the case list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```


### Task 10: End-to-end flow, docs and full verification

One Playwright scenario for the whole feature, the documentation notes and the full verification run. The scenario is verification only: by this task the feature exists, so its first run is expected to pass.

**Files:**
- Modify: `PROGRESS.md`
- Modify: `README.md`
- Test (create): `tests/e2e/specs/11-case-lifecycle.spec.ts`

**Interfaces:**
- Consumes: Everything above; `login`, `DEMO_LAWYER`, `BACKEND_URL` from `tests/e2e/specs/helpers.ts`.
- Produces: `tests/e2e/specs/11-case-lifecycle.spec.ts` (one lawyer login); notes in `README.md` and `PROGRESS.md`.

- [ ] **Step 1: Write the end-to-end scenario**

Create `tests/e2e/specs/11-case-lifecycle.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { BACKEND_URL, DEMO_LAWYER, login } from "./helpers";

// Flow 11: a lawyer edits their own case, closes it with a decision document (the
// dashboard's won count goes up), archives it (read-only), unarchives and reopens it.
// One lawyer login only: the token is reused for the API setup (the login endpoint
// is rate limited to 5 attempts per user per minute and the demo lawyer is used by
// several other specs).

const STAMP = Date.now();
const ORIGINAL_NAME = `E2E Yaşam Döngüsü ${STAMP}`;
const EDITED_NAME = `${ORIGINAL_NAME} (düzenlendi)`;

async function wonCases(page: Page): Promise<number> {
  await page.goto("/dashboard");
  const card = page.getByRole("link", { name: /^Kazanılan Davalar/ });
  await expect(card).toBeVisible();
  return Number((await card.locator("p").nth(1).innerText()).trim());
}

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "İşlemler" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("edit, close with a decision document, archive, unarchive and reopen a case", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, DEMO_LAWYER);

  const token = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  expect(token).toBeTruthy();
  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      case_number: `E2E-LC-${STAMP}`,
      case_name: ORIGINAL_NAME,
      client_name: "E2E Müvekkil",
      opposing_party: "E2E Karşı Taraf",
      case_type: "diger",
      opening_date: "2026-02-03",
    },
  });
  expect(created.ok()).toBeTruthy();
  const caseId = (await created.json()).id as string;

  const wonBefore = await wonCases(page);

  // --- Bilgileri düzenle ---
  await page.goto(`/davalar/${caseId}`);
  await expect(page.getByRole("heading", { name: ORIGINAL_NAME, exact: true })).toBeVisible();
  await menu(page, "Bilgileri düzenle");
  const editDialog = page.getByRole("dialog", { name: "Bilgileri düzenle" });
  await expect(editDialog.getByLabel("Dava no")).toHaveAttribute("readonly", "");
  await editDialog.getByLabel(/^Dava adı/).fill(EDITED_NAME);
  await editDialog.getByLabel("Mahkeme").fill("İstanbul 5. Asliye Hukuk Mahkemesi");
  await editDialog.getByLabel("Durum").selectOption("karar_bekleyen");
  await editDialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: EDITED_NAME, exact: true })).toBeVisible();
  const badges = page.getByRole("group", { name: "Dava durumu" });
  await expect(badges).toContainText("Karar Bekleyen");

  // --- Davayı kapat (Kazanıldı + karar belgesi) ---
  await menu(page, "Davayı kapat");
  const closeDialog = page.getByRole("dialog", { name: "Davayı kapat" });
  await closeDialog.getByLabel("Kazanıldı").check();
  await closeDialog.getByLabel("Karar notu").fill("Karar tebliğ edildi.");
  await closeDialog.getByLabel("Karar belgesi ekle").setInputFiles({
    name: "karar.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Mahkeme davanın kabulüne karar vermiştir."),
  });
  await closeDialog.getByRole("button", { name: "Davayı kapat" }).click();
  await expect(closeDialog).toBeHidden();

  await expect(badges).toContainText("Kapalı");
  await expect(badges).toContainText("Kazanıldı");
  const decision = page.getByRole("region", { name: "Karar bilgisi" });
  await expect(decision).toContainText("Karar tebliğ edildi.");
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText("Dava kapatıldı — Kazanıldı")).toBeVisible();
  await page.getByRole("tab", { name: "Belgeler" }).click();
  await expect(page.getByRole("button", { name: /karar\.txt/ })).toBeVisible();

  // --- Dashboard: one more won case ---
  expect(await wonCases(page)).toBe(wonBefore + 1);

  // --- Arşivle: read-only ---
  await page.goto(`/davalar/${caseId}`);
  await menu(page, "Arşivle");
  await page.getByRole("dialog", { name: "Dava arşivlensin mi?" }).getByRole("button", { name: "Arşivle" }).click();
  await expect(page.getByRole("note")).toContainText("Bu dava arşivlendi; salt okunur.");
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByLabel("Gelişme Başlığı")).toHaveCount(0);
  await page.getByRole("tab", { name: "Belgeler" }).click();
  await expect(page.getByText(/Belge Yükle/)).toHaveCount(0);
  const refused = await page.request.post(`${BACKEND_URL}/cases/${caseId}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { event_date: "2026-10-12", title: "Arşivde eklenmeye çalışılan" },
  });
  expect(refused.status()).toBe(409);

  // --- Arşivden çıkar, then Yeniden aç ---
  await page.getByRole("note").getByRole("button", { name: "Arşivden çıkar" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await menu(page, "Yeniden aç");
  await page.getByRole("dialog", { name: "Dava yeniden açılsın mı?" }).getByRole("button", { name: "Yeniden aç" }).click();
  await expect(badges).toContainText("Devam Eden");
  await expect(badges).not.toContainText("Kazanıldı");
  await expect(page.getByRole("region", { name: "Karar bilgisi" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText("Dava yeniden açıldı")).toBeVisible();
  await expect(page.getByText("Dava kapatıldı — Kazanıldı")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

```bash
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test specs/11-case-lifecycle.spec.ts
```

Expected: PASS — `1 passed`. (The feature exists since Task 9, so this scenario is verification, not a red-green step. It logs in as the demo lawyer once.)

- [ ] **Step 3: Document the feature**

Modify `PROGRESS.md`:

```diff
--- a/PROGRESS.md
+++ b/PROGRESS.md
@@ -223,3 +223,11 @@ Status: COMPLETE
 - The login form is empty; the demo accounts hint shows only in demo mode (`GET /auth/config`).
 - Real-data mode no longer creates a demo firm or users; `python -m app.db.create_admin` creates the first administrator and `import_cases` takes `--firm` and `--lawyer`.
 - New E2E spec `10-user-management.spec.ts` (EMAIL_BACKEND=file, reads the invite link from the newest `.eml`).
+
+## Case lifecycle (edit, close, reopen, archive)
+Status: COMPLETE
+
+- Case page "İşlemler" menu: Bilgileri düzenle, Davayı kapat (outcome, decision date, note, decision document), Yeniden aç, Arşivle, Arşivden çıkar. Only the responsible lawyer and administrators see it; the backend answers 403 to everybody else.
+- `cases.decision_date` / `closing_note` (migration `e6c1b9a4d2f8`); `POST /cases/{id}/close|reopen|archive|unarchive`; `PATCH /cases/{id}` no longer sets `status=kapali` or `outcome`.
+- An archived case is read-only: PATCH, close, reopen, events, tasks, documents and calendar events linked to it answer 409 until it is unarchived. The case list has an "Arşivi göster" switch and an "Arşivli" badge.
+- New E2E spec `11-case-lifecycle.spec.ts`.
```

Modify `README.md`:

```diff
--- a/README.md
+++ b/README.md
@@ -7,7 +7,7 @@
 ## Product
 
 CaseBridge helps a law firm:
-- Manage active/closed cases, clients, opposing parties, documents, hearings, and timelines.
+- Manage active/closed cases, clients, opposing parties, documents, hearings, and timelines. The responsible lawyer (or an administrator) edits a case, closes it with an outcome (won / lost / settled), decision date, note and optional decision document, reopens it, and archives it; an archived case is read-only until it is unarchived.
 - Run an AI case simulation across four perspectives (Judge, Plaintiff Lawyer, Defendant Lawyer, Legal Researcher) to surface arguments, risks, missing information, and suggested next steps — always labeled as an AI-generated estimate, never a guaranteed outcome.
 - Practice a six-stage fictional hearing as plaintiff or defendant counsel. A local model plays opposing counsel and judge with isolated role prompts, evidence access rules, a resumable transcript, and a final 100-point training evaluation.
 - See firm-wide analytics: win/loss ratio, performance by category, historical trends.
```

- [ ] **Step 4: Full verification**

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test
```

Expected:

- Backend: `836 passed`.
- Frontend: `Test Files  64 passed (64)`, `Tests  588 passed (588)`; `tsc` prints nothing; the build succeeds.
- Playwright: `11 passed`, `1 failed` — the failure is `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply`, which fails identically before this work (Decision 18). Everything else, including the new `11-case-lifecycle.spec.ts`, passes.
- No server is left running (Playwright starts and stops the backend on port 8010 and the frontend on port 3010 itself).

- [ ] **Step 5: Commit**

```bash
git add PROGRESS.md README.md tests/e2e/specs/11-case-lifecycle.spec.ts
git commit -F - <<'EOF'
test: case lifecycle E2E and docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```



## Self-Review

**1. Spec coverage** (each spec section → the task that implements it)

- §2 Yetki (responsible lawyer and admin only; adding events/tasks/documents stays open to the whole firm) → Task 2 (`can_manage_case`, `require_case_manager` on close / reopen / archive / unarchive), Task 3 (PATCH, including the Taraflar / Uyuşmazlık edits), Task 6 and Task 8 (menu and `Düzenle` buttons shown by the same rule); event / task / document creation is deliberately not permission-checked (Task 4 only adds the archived guard).
- §2 Kapatma, Sonuçlar → Task 1 (columns), Task 2 (`close`, timeline event, 422/409 rules), Task 7 (dialog, pending-task warning, decision document, upload-failure notice).
- §2 Arşiv (closed only, unarchive, read-only, reopen) → Task 2 (`archive`, `unarchive`, `reopen`), Task 4 (read-only), Task 7 (confirmations), Task 8 (banner).
- §2 "Uzlaşma" → "Sulh", §6.3 → Task 5 (`labels.ts`, `filters.ts`, `AnalyticsView`; the `sulh` slug is unchanged).
- §3 Kurallar: open statuses and outcome pairing → Task 2 and Task 3; PATCH rejections with the exact Turkish messages → Task 3; archived 409 list (PATCH, close, reopen, event, task create/update, document upload/delete) → Tasks 2–4 (plus calendar events, Decision 3); 403 / 404 behaviour → Task 2 and Task 3 tests (other lawyer, case without a lawyer, other firm).
- §4 Veri → Task 1.
- §5 API (close / reopen / archive / unarchive, "today" in the app time zone, event text, idempotency, decision document upload) → Task 2 and Task 7.
- §6.1 Dava sayfası: badges and `İşlemler` menu → Task 6; `Bilgileri düzenle` → Task 6; `Davayı kapat` → Task 7; `Yeniden aç` and `Arşivle` confirmations → Task 7; decision card, archive banner, hidden forms and edit buttons → Task 8; modal behaviour (`role="dialog"`, `aria-modal`, `ModalFrame` focus, Escape/Vazgeç locked, `aria-disabled` + guard, `ApiError` messages only) → Tasks 6–7 tests.
- §6.2 Dava listesi → Task 9.
- §7 Etki (dashboard / analytics / reports recompute) → Task 2 test `test_closing_cases_moves_the_analytics_counts`; Task 10 checks the dashboard count in the browser; no analytics code changes.
- §8 Test: backend list → Tasks 1–4; frontend list → Tasks 5–9; E2E → Task 10.
- Gaps: none. Two items are recorded as out of scope rather than silently dropped: `next_hearing_date` is not cleared on close, and `average_case_duration_days` still uses `updated_at` (Global Constraints, Out of scope).

**2. Placeholder scan.** The plan contains no "TBD", "TODO", "implement later", "add appropriate error handling" or "similar to Task N"; every code step is a complete new file or a complete unified diff taken from the verified implementation, and every command has an expected result.

**3. Type consistency.** Names are used identically across tasks: backend `CaseClose` (Task 2) ↔ frontend `CaseClosePayload` (Task 5) ↔ `buildClosePayload` (Task 7); `CaseLifecycleService.close/reopen/archive/unarchive` (Task 2) and `ensure_patch_allowed` (Task 3) are called only by `routes/cases.py`; `require_case_manager` / `require_case_writable` (Task 2) and `require_case_id_writable` (Task 4) all live in `app/api/case_access.py`; frontend `CaseAction` / `caseActions` / `canManageCase` (Task 5) feed `CaseActionsMenu`, `CaseHeader` and `CaseDetailView` (Tasks 6–8); `OpenCaseStatus` / `OPEN_CASE_STATUSES` (Task 5) feed `BasicInfoFields` and `CaseFormState.status` (Task 6); `CloseResult` is produced by `CaseCloseModal` and consumed by `CaseDetailView.handleClosed` (Task 7); `CaseConfirmModal.onConfirm` returns `Promise<void>` and its callers close the dialog themselves; `canEdit` / `readOnly` (Task 8) are required / optional props introduced in the same commit as their call sites.

**Verification recorded while writing the plan** (scratch worktree built task by task; every task's tests were first run against the previous commit with only that task's test files added, to see them fail, then against the task's commit): backend full suite 836 passed; frontend `npx vitest run` 588 passed (64 files); `npx tsc --noEmit` clean; `npm run build` succeeds; Playwright 11 passed and 1 failed — the failure is `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply`, which fails identically before this work (Decision 18). No server was left running.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-11-case-lifecycle.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in one session using superpowers:executing-plans, with checkpoints for review.

Which approach?
