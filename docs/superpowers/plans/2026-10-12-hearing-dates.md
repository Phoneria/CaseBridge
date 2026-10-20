# Duruşma Tarihleri (Dava ↔ Takvim) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hearing a single thing that lives in one place: a calendar event of type `hearing` linked to a case. A lawyer adds, edits, deletes and records the outcome of hearings from a "Duruşmalar" card on the case page (or from the calendar, the same events), `cases.next_hearing_date` becomes a computed cache that moves on by itself after a hearing has passed, and a note written after a hearing lands in the case timeline.

**Architecture:** Backend: a new module `app/services/hearing_dates.py` owns the cache (`recompute_next_hearing`, the nightly `recompute_open_cases`, `add_all_day_hearing`, `ensure_all_day_hearing`); `calendar_service` calls it on every hearing create / update / delete (old and new case), no longer derives `case_hearing` items and refuses new hearings on a closed case; `calendar_events` gains `result_note` and `result_case_event_id` (one Alembic revision that also turns every existing `next_hearing_date` into an all-day hearing event); `POST /cases`, the importer and the seed create the event instead of writing the column, `PATCH /cases/{id}` rejects the field; reminders come from hearing events only; the reminder worker recomputes the open cases once per local day; two new endpoints, `GET /cases/{id}/hearings` and `POST /calendar/events/{id}/result`, are served by a new `HearingService`. Frontend: types and API calls, the form rules in `lib/hearings.ts`, a `Duruşmalar` card with an add/edit modal, a result modal and a delete confirmation, wired into the case page (reloading the hearings and the case after every change, `Sonraki Duruşma` shows date and time), and a `Sonuç` row in the calendar drawer.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (`batch_alter_table` for SQLite, typed enum columns for PostgreSQL), pydantic v2, pytest; Next.js 14 (app router), React 18, Tailwind, Vitest + Testing Library + user-event; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-hearing-dates-design.md`

## Global Constraints

Every task's requirements include this section.

**Process**

- Work on branch `feature/hearing-dates` (already checked out; rebased onto `feature/case-notes-and-owner` `08abbab` plus the spec and plan commits; do not switch branches, do not push, never use `git stash`). One commit per task. Every commit message ends with a blank line and then exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY`
- **Rebased base.** This plan's diff hunks were written against `feature/case-lifecycle` `bbe1c08`. The branch now sits on `feature/case-notes-and-owner` (`08abbab`), which changed: `backend/app/api/routes/cases.py` (note PATCH/DELETE routes, `CaseEventInputError`), `backend/app/schemas/case.py` (`CaseEventCreate.title` optional, `CaseEventOut.created_by`/`created_by_name`, `CaseNoteUpdate`, `CaseOut.assigned_lawyer_name`), `backend/app/models/case.py` (`Case.assigned_lawyer`, `CaseEvent.author` view-only relationships), `backend/app/api/routes/admin.py`, `frontend/src/types/index.ts` (`Case.assigned_lawyer_name`, `CaseEvent.created_by`/`created_by_name`, `CaseEvent.event_type: CaseEventType`), `frontend/src/components/CaseDetailView.tsx` (Gelişmeler and Notlar tabs moved into `CaseTimelinePanel` / `CaseNotesPanel`; the old `eventForm` state and `handleAddEvent` are gone), `CaseHeader.tsx`, `CaseEditModal.tsx`, `CaseListView.tsx`, `CaseQuickView.tsx`. Where a hunk's context no longer matches, apply the hunk's intent to the current code and record the adaptation; typed `Case` / `CaseEvent` test fixtures need the new fields. The timeline entry type `hearing` (label `Duruşma`) is deliberately not offered in the Gelişmeler form; the hearing result entry is written by the backend.
- Always `git add` explicit paths, never `git add .` or `git add ..` (`backend/.venv`, `frontend/node_modules` and `tests/e2e/node_modules` may be symlinks and must never be committed).
- No new Python packages and no new npm packages.
- Backend commands run from `backend/` (`.venv/bin/python -m pytest ...`), frontend commands from `frontend/` (`npx vitest run ...`, `npx tsc --noEmit`, `npm run build`), E2E from `tests/e2e/` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium` when a pinned Chromium is needed. The full backend suite takes about ten minutes (bcrypt-slow logins) and `npx vitest run` about two: run them in the background (`nohup ... > log 2>&1 &`) or with a generous timeout.

**Project rules (code review checks every one)**

- **Only `ApiError` messages are shown to users.** Anything else (a thrown `Error`, a network failure) is replaced by a Turkish fallback sentence. The helper is `userMessage(error, fallback)` in `frontend/src/lib/userMessages.ts` (already in the repository); never render `error.message` of a plain `Error`.
- **A button the user just clicked uses `aria-disabled` plus a guard, never `disabled`.** The click handler returns early while a request is in flight (an `inFlight` ref), so a second click does nothing and focus is not lost. (Inputs that are not the clicked control, such as the time field of an all-day hearing, may use `disabled`.)
- **No ref reads inside React state updaters.** A functional `setState(prev => ...)` must be pure; read refs before calling it.
- **No stale state reads after an `await`.** After an await use the awaited value, a functional update or a sequence guard (`hearingsSeq`, `reloadSeq`), never a state variable captured before the await.
- **Modals use the existing `ModalFrame`** (`role="dialog"`, `aria-modal`, focus moves in on open and back to the opener on close, Escape / Vazgeç locked while saving).
- **Every query is firm-scoped.** A case, hearing event or calendar event of another firm answers 404 (never 403, never 409, never a different message), also from the archived guard and the new endpoints.
- **Case-lifecycle rules stay in force.** Use the helpers of `app/api/case_access.py` (`require_case_id_writable` and friends) instead of ad-hoc checks; archived guard first (404, then 409 `Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.`, then 422 / other state rules); case lookups that precede a write on the case's hearing cache are row-locked (`get_by_id_in_firm_for_update`); the "is the case still active" predicate is `case_is_active()` from `app/models/case.py`; the closed-case rule is 409 `Kapalı davaya duruşma eklenemez.`.
- **Tests must not depend on the current date.** Test dates derive from `local_today()` (`app.core.timeutil`, `APP_TIMEZONE`) or sit far in the future (`2099-...`) or far in the past (`2001-...`); routes' clock is pinned by `monkeypatch.setattr("<module>.local_today", ...)`, the worker's by the injected `now_local`. The E2E spec derives every day from today's date in `Europe/Istanbul`; no hard-coded calendar days. The migration test passes `today` explicitly.
- **E2E:** `LOGIN_RATE_LIMIT_PER_MINUTE=1000` is already set in `tests/e2e/playwright.config.ts`; the new spec still logs in exactly once (as the demo lawyer) and reuses that session's token (`localStorage.casebridge_token`) for its API set-up requests.
- **Turkish UI and API copy is used exactly as written in the spec** (strings the spec does not word are fixed in the code blocks below).

**Data model**

- `calendar_events.result_note` (Text, nullable) and `calendar_events.result_case_event_id` (FK `case_events.id`, nullable, `ON DELETE SET NULL`); Alembic revision `a7d2e4f6b8c1` (down revision `e6c1b9a4d2f8`, the head before this work).
- A hearing is a `calendar_events` row with `event_type='hearing'` and `case_id` set. `cases.next_hearing_date` is the date of the earliest such row whose local date is today or later, else `NULL`. Nothing else writes the column.
- "Today" is `app.core.timeutil.local_today()` (`APP_TIMEZONE`, default `Europe/Istanbul`), the clock of the calendar and the reminders.

**API (all firm-scoped)**

- `GET /cases/{id}/hearings` → every hearing of the case ordered by `starts_at`: `{id, starts_at, all_day, duration_minutes, location, notes, assignee_id, result_note, is_past, result_open}`. Other firm 404. `is_past`: the local date is before today. `result_open` (not in the spec; see Decision 4): the local date is today or earlier.
- `POST /calendar/events/{id}/result` `{result_note: str 1–4000 trimmed, next_hearing?: {starts_at, all_day, duration_minutes?, location?, notes?}}` → `{hearing, next_hearing | null}`. Order of the checks: 404 (event of another firm), 409 archived, 422 `Sonuç yalnızca davaya bağlı duruşmalara girilebilir.`, 422 `Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir.`, 409 `Kapalı davaya duruşma eklenemez.` (closed case and `next_hearing` given; the note alone is accepted).
- `POST` / `PATCH /calendar/events` for a hearing of a closed case (new, or moved there) → 409 `Kapalı davaya duruşma eklenemez.`; editing and deleting the existing hearings of a closed (not archived) case stays allowed.
- `PATCH /cases/{id}` with `next_hearing_date` → 422 `Duruşma tarihi Duruşmalar bölümünden eklenir.`.
- `GET /calendar` no longer returns `kind: "case_hearing"` items; items carry `result_note`.

**UI strings (exact)**

- Card `Duruşmalar` (anchor `#durusmalar`): lists `Yaklaşan` and `Geçmiş`; row text `<dd.mm.yyyy> · <HH:MM | Tüm gün>`, place, note; past rows `Sonuç: <not>` or `Sonuç girilmedi`; empty `Henüz duruşma yok.`; buttons `Duruşma ekle`, `Düzenle`, `Sil`, `Sonuç gir` / `Sonucu düzenle`.
- Add / edit modal `Duruşma ekle` / `Duruşmayı düzenle`: `Tarih`, `Saat`, `Tüm gün`, `Süre (dakika)`, `Salon / yer`, `Not`; `Kaydet` / `Kaydediliyor...` / `Vazgeç`; validation `Tarih zorunludur.`, `Saat zorunludur.`, `Süre 5 ile 1440 dakika arasında olmalıdır.`; fallback `Duruşma kaydedilemedi. Lütfen tekrar deneyin.`
- Result modal `Sonuç gir` / `Sonucu düzenle`: `Sonuç / ara karar notu`, checkbox `Sonraki duruşmayı ekle` (then `Tarih`, `Tüm gün`, `Saat`, `Salon / yer`); validation `Sonuç notu gerekli.`, `En fazla 4000 karakter olabilir.`; fallback `Sonuç kaydedilemedi. Lütfen tekrar deneyin.`
- Delete confirmation `Duruşma silinsin mi?` (confirm `Sil`; fallback `Duruşma silinemedi. Lütfen tekrar deneyin.`).
- Timeline entry after a result: `Duruşma yapıldı — dd.mm.yyyy`, description = the note.
- Calendar drawer: a `Sonuç` row when `result_note` exists.

**Out of scope:** legal deadline tracking, automatic tasks from an interim decision, UYAP integration, a separate hearing list page, removing the `case_hearing` value from the `remindersourcetype` enum (old delivery rows keep it), clearing a closed case's stored `next_hearing_date`.

---

## Decisions made while planning

The spec leaves these open; the plan fixes them. Each one was built and verified in a scratch worktree (backend suite, frontend suite, `tsc`, `npm run build`, Playwright) before being written down here.

1. **Nightly recompute: trigger and testing.** The existing reminder worker thread carries it, so there is no second thread and no scheduler dependency. `HearingRecomputeSchedule` (in `reminder_worker.py`) remembers the local day of the last *successful* pass; `run_reminder_tick(session_factory, now_local, hearing_schedule)` calls `run_if_new_day` before `send_due`, so the first tick of every local day (and the first after a restart) recomputes, and a failure is logged, not remembered (retried next tick) and never stops the reminders. The loop creates one schedule per process. Tests call `run_reminder_tick` with an injected `now_local` and a `sessionmaker(bind=db_session.get_bind())` (the tick closes its sessions) — no sleeping, no real clock.
2. **Recompute scope.** Writes recompute the one or two affected cases (the old and the new case of a moved event). The nightly pass (`recompute_open_cases`) covers only `case_is_active() AND NOT is_precedent` cases and commits once; closed and archived cases keep their stored value (they are not "upcoming" anyway and an archived case must not change), precedents never have hearings. Reopening a case recomputes it (`CaseLifecycleService.reopen`). The migration recomputes every non-precedent case once, with the local date of the migration. The nightly query is one `GROUP BY case_id` aggregate, not one query per case.
3. **A hearing that is today counts all day.** The rule is about dates in `APP_TIMEZONE`, not instants: `starts_at >= local midnight of today`. A 09:00 hearing is still the "next hearing" at 15:00 the same day, and rolls over at the next local midnight. The same date rule drives reminders (unchanged) and the `Sonraki Duruşma` field.
4. **`is_past` and the day a result may be entered.** `is_past` = local date before today (a hearing that is today is still "Yaklaşan"). The spec allows a result for a hearing "whose date is not after today", i.e. also today's, so the response carries a second flag, `result_open` (date ≤ today), and the card shows `Sonuç gir` on `result_open`, not on `is_past`. The server rule stays the spec's 422 for a future hearing.
5. **The derived `case_hearing` items are gone.** `CalendarItemKind` becomes `"event" | "task"`; `CalendarItemOut.kind` is `Literal["event", "task"]`; `_sync_next_hearing`, `_release_hearing_day` and the `case_hearing` items of `calendar_service` are deleted, together with the drawer's read-only hearing blocks (`Davayı aç` link and the reminder sentence). Frontend fixtures that used `kind: "case_hearing"` become ordinary hearing events (`id: "event:h1"`, `editable: true`); filtering by type (`tur=durusma`) works on `event_type`, which they keep. `ReminderSourceType.CASE_HEARING` stays in the enum because old `reminder_deliveries` rows reference it.
6. **The time of the next hearing is not a new `CaseOut` field.** The case page's `Duruşmalar` card already fetches `GET /cases/{id}/hearings`; the `Sonraki Duruşma` field of the overview is computed from that list (`nextHearing()` in `lib/hearings.ts`: the earliest hearing that is not past) and shows `dd.mm.yyyy · HH:MM` (or `Tüm gün`), linking to `#durusmalar`. If the list cannot be loaded, the field falls back to `case.next_hearing_date` (date only) and the page keeps working: the hearings load in their own effect with a sequence guard.
7. **The result endpoint and the timeline.** One transaction: `result_note` is stored on the event, a `CaseEvent` (type `hearing`, `event_date` = the hearing's date, title `Duruşma yapıldı — dd.mm.yyyy`, description = the note, `created_by` = the acting user) is created and linked through `calendar_events.result_case_event_id`. Entering a result again updates the *linked* entry's description (title, date and author stay); if the link is empty or the entry was deleted, a new entry is created and linked. Deleting the hearing event does not delete the entry (history). The case row is locked (`FOR UPDATE`) before the cache is recomputed, and the optional `next_hearing` becomes a new event of the same case with the case's lawyer as assignee and the default hearing reminders (`HEARING_REMINDER_DAYS = [3, 1]`).
8. **Migration `created_by` fallback.** `calendar_events.created_by` is `NOT NULL`: the creator of a converted event is the case's lawyer, else the firm's oldest active administrator, else the firm's oldest user (ordering `created_at, id`); a case of a firm without any user is skipped and counted in the migration output (`alembic.runtime.migration` logger). The conversion works with lightweight `sa.table()` definitions, not the ORM models (models change; migrations must not), and the enum columns are typed with `create_type=False` so PostgreSQL does not try to create the types again. Reminders already sent for the old per-case hearing (`reminder_deliveries.source_type='case_hearing'`) are copied to the new event (`source_type='event'`), otherwise every converted case would get its reminder e-mails a second time on the first tick. Precedents are not converted.
9. **Import and seed dedupe.** `ensure_all_day_hearing` (importer and seed) creates the event only if the case has no hearing event on that day at any time (`>= 00:00` and `< next 00:00`), so re-importing a file or importing over an existing calendar entry never doubles a hearing. Precedents (importer) keep the plain date because they are not cases in progress. `purge.py` deletes the calendar events before the cases they reference.
10. **`POST /cases`** creates the all-day hearing in the same transaction as the case (`create_case` flushes instead of committing early; the duplicate-number rollback is unchanged), with `created_by` = the requesting user. A past date creates the event (history) and leaves the cache `NULL`. `NewCaseView` needs no change: it sends the same `next_hearing_date`.
11. **`PATCH /cases/{id}` and the edit dialog.** `ensure_patch_allowed` answers 422 `Duruşma tarihi Duruşmalar bölümünden eklenir.` when the field is present at all (`model_fields_set`). `CaseEditModal` builds its payload from basic-info fields that never include the hearing date, so no frontend change was needed.
12. **Analytics, reports, dashboard, handover and AI context are unaffected.** Verified by grep and by the unchanged tests: analytics does not read `next_hearing_date`; the reports (`report_service`, hearings within N days), the hand-over report, the courtroom case summary, the AI context builder and the dashboard's upcoming list read the cache column, which keeps the same meaning (earliest hearing today or later); `case_repository.hearing_within_days` now uses `local_today()` instead of the server's `date.today()` so it agrees with the cache. The reminders' "case hearing" candidates are removed: the same hearings are now ordinary event candidates, except those of closed cases, which stay silent as before.
13. **Calendar writes of a closed case.** `CalendarService` creates / moves a hearing only after `require_case_open_for_hearing` (409 `Kapalı davaya duruşma eklenemez.`). `_case_in_firm` is row-locked, so two concurrent hearing writes for one case serialize on the case row before they recompute its cache. Moving a hearing to another case recomputes both cases; changing a hearing's type to something else recomputes its case; an event with no case never touches a cache.
14. **Frontend: where the data comes from.** The hearings are written with the existing `createCalendarEvent` / `updateCalendarEvent` / `deleteCalendarEvent` (title `Duruşma`, type `hearing`, `assignee_id` = the case's lawyer, reminders `DEFAULT_REMINDER_DAYS.hearing`); only the result has a new call. After any change the page reloads the hearings and the case (`handleHearingsChanged`), because the case's next date and the timeline changed. The archived case shows the card read-only (no buttons); a closed case hides `Duruşma ekle` and the `Sonraki duruşmayı ekle` checkbox but keeps edit / delete / result.
15. **E2E.** Spec 12 logs in once as the demo lawyer, creates the case and a hearing of *yesterday* (Istanbul date) through the API, adds a hearing from the case page, moves it in the week view of the calendar (filtered with `dava=<id>`), checks the new date on the case page, enters a result with a next hearing and finds the `Duruşma yapıldı — <dd.mm.yyyy>` entry in the timeline. Dates are computed from `Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Istanbul'})`.
16. **Known failing E2E test, unrelated:** `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply` fails identically before this work (it waits for the text `Standart · mock`).

## File Map

Each task below lists its own files; this map shows what each unit is responsible for. All paths are relative to the repository root.

**Backend**

| File | Task | Responsibility |
|---|---|---|
| `backend/alembic/versions/a7d2e4f6b8c1_add_hearing_results.py` | 1 | result columns; conversion of every `next_hearing_date` into an all-day hearing event; recompute |
| `backend/app/models/calendar.py` | 1 | `result_note`, `result_case_event_id` |
| `backend/app/services/hearing_dates.py` | 2, 3 | `recompute_next_hearing`, `recompute_open_cases`, `add_all_day_hearing`, `ensure_all_day_hearing` |
| `backend/app/services/calendar_service.py`, `routes/calendar.py`, `schemas/calendar.py` | 2, 6 | recompute on every hearing change, closed-case rule, no derived items, `result_note`, result route |
| `backend/app/services/case_service.py`, `routes/cases.py`, `case_lifecycle.py`, `case_repository.py` | 2, 5, 6 | `POST /cases` creates the event, PATCH rejects the date, reopen recomputes, `local_today()` |
| `backend/app/db/import_cases.py`, `seed.py`, `purge.py` | 3 | importer and seed create events; purge order |
| `backend/app/services/reminder_service.py` | 4 | hearing reminders come from events only |
| `backend/app/services/reminder_worker.py` | 5 | `HearingRecomputeSchedule`, nightly pass |
| `backend/app/services/hearing_service.py` | 6 | `list_for_case`, `record_result` |

**Frontend**

| File | Task | Responsibility |
|---|---|---|
| `frontend/src/types/index.ts`, `src/lib/api.ts` | 7 | `CaseHearing`, `HearingFields`, `HearingResultPayload/Response`, `result_note`, `getCaseHearings`, `recordHearingResult`; kinds without `case_hearing` |
| `frontend/src/lib/hearings.ts` | 7 | form rules, payload builder, `hearingWhen`, `splitHearings`, `nextHearing`, `validateResultNote` |
| `frontend/src/components/calendar/CalendarEventDrawer.tsx` | 7 | `Sonuç` row; derived-hearing blocks removed |
| `frontend/src/components/CaseHearingFormModal.tsx`, `CaseHearingResultModal.tsx`, `CaseHearingsCard.tsx` | 8 | the add / edit modal, the result modal, the card with the delete confirmation |
| `frontend/src/components/CaseDetailView.tsx` | 9 | hearings state, card, `Sonraki Duruşma` with time |

**E2E and docs**

| File | Task | Responsibility |
|---|---|---|
| `tests/e2e/specs/12-hearing-dates.spec.ts` | 10 | add on the case page → calendar → move → case page → result with next hearing → timeline |
| `PROGRESS.md` | 11 | feature note and the recorded verification |

---

## Tasks


### Task 1: Result columns, migration and conversion of existing hearing dates

Foundation: `calendar_events` can hold a result note and its timeline link, and every existing `cases.next_hearing_date` becomes a real all-day hearing event (reminders already sent are copied, so nobody gets a second e-mail), after which every case's cache is recomputed with the local date of the migration. Nothing else in the application changes yet.

**Files:**
- Create: `backend/alembic/versions/a7d2e4f6b8c1_add_hearing_results.py`
- Modify: `backend/app/models/calendar.py`
- Test (create): `backend/tests/integration/test_hearing_dates_migration.py`

**Interfaces:**
- Consumes: `CalendarEvent`, `CaseEvent`, `HEARING_REMINDER_DAYS` (`app.domain.calendar`), `local_today` / `utc_now` (`app.core.timeutil`), Alembic head `e6c1b9a4d2f8`.
- Produces: `CalendarEvent.result_note: str | None`, `CalendarEvent.result_case_event_id: str | None`; Alembic revision `a7d2e4f6b8c1`, with `convert_case_hearings(conn, today) -> {"created", "skipped", "recomputed"}` importable by tests; downgrade drops the two columns (the created events stay).

- [ ] **Step 1: Write the failing tests**

The test builds a SQLite database at the previous head, inserts cases (with and without a lawyer, a firm without users, a case that already has a hearing event that day, a past date, a precedent, a sent reminder), upgrades and checks the events, the copied reminder, the recomputed caches and the downgrade.

Create `backend/tests/integration/test_hearing_dates_migration.py`:

```python
"""The Alembic chain adds the hearing result columns and turns every case's
next_hearing_date into a real hearing event (see the migration's docstring)."""
import logging
from datetime import datetime, timedelta
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.config import settings
from app.core.timeutil import local_today

BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "e6c1b9a4d2f8"
CREATED = "2026-01-01 00:00:00"


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _firm(conn, firm_id):
    conn.execute(sa.text("INSERT INTO law_firms (id, name, created_at) VALUES (:id, :id, :created)"), {"id": firm_id, "created": CREATED})


def _user(conn, user_id, firm_id, role, created=CREATED, active=True):
    conn.execute(
        sa.text(
            "INSERT INTO users (id, law_firm_id, email, hashed_password, full_name, role, is_active, created_at) "
            "VALUES (:id, :firm, :email, 'x', :id, :role, :active, :created)"
        ),
        {"id": user_id, "firm": firm_id, "email": f"{user_id}@test", "role": role, "active": active, "created": created},
    )


def _case(conn, case_id, firm_id, lawyer=None, hearing=None, precedent=False):
    conn.execute(
        sa.text(
            "INSERT INTO cases (id, law_firm_id, case_number, case_name, client_name, case_type, opening_date, "
            "status, outcome, is_archived, is_precedent, assigned_lawyer_id, next_hearing_date, created_at, updated_at) "
            "VALUES (:id, :firm, :id, 'Dava', 'Müvekkil', 'kira', '2026-01-01', 'devam_eden', 'ongoing', 0, :precedent, "
            ":lawyer, :hearing, :created, :created)"
        ),
        {"id": case_id, "firm": firm_id, "lawyer": lawyer, "hearing": hearing, "precedent": precedent, "created": CREATED},
    )


def _event(conn, event_id, firm_id, case_id, starts_at, user_id, all_day=False):
    conn.execute(
        sa.text(
            "INSERT INTO calendar_events (id, law_firm_id, title, event_type, starts_at, all_day, duration_minutes, "
            "case_id, created_by, reminder_days, created_at, updated_at) "
            "VALUES (:id, :firm, 'Duruşma', 'hearing', :starts, :all_day, 60, :case, :user, '[3, 1]', :created, :created)"
        ),
        {"id": event_id, "firm": firm_id, "starts": starts_at, "all_day": all_day, "case": case_id, "user": user_id, "created": CREATED},
    )


def test_migration_converts_case_hearing_dates_into_events(tmp_path, monkeypatch, caplog):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()
    today = local_today()
    soon = (today + timedelta(days=10)).isoformat()
    later = (today + timedelta(days=20)).isoformat()
    past = (today - timedelta(days=5)).isoformat()

    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        _firm(conn, "f1")
        _user(conn, "lawyer", "f1", "lawyer", created="2026-02-01 00:00:00")
        _user(conn, "admin-old", "f1", "admin", created="2026-01-05 00:00:00")
        _user(conn, "admin-new", "f1", "admin", created="2026-03-01 00:00:00")
        _firm(conn, "f2")
        _user(conn, "only-user", "f2", "lawyer", active=False)
        _firm(conn, "f3")
        _case(conn, "with-lawyer", "f1", lawyer="lawyer", hearing=soon)
        _case(conn, "already-has-event", "f1", lawyer="lawyer", hearing=soon)
        _event(conn, "existing-event", "f1", "already-has-event", f"{soon} 10:30:00", "lawyer")
        _case(conn, "no-lawyer", "f1", hearing=later)
        _case(conn, "fallback-user", "f2", hearing=later)
        _case(conn, "no-users", "f3", hearing=later)
        _case(conn, "past", "f1", lawyer="lawyer", hearing=past)
        _case(conn, "precedent", "f1", hearing=later, precedent=True)
        _case(conn, "stale-null", "f1", lawyer="lawyer")
        _event(conn, "upcoming-event", "f1", "stale-null", f"{later} 09:00:00", "lawyer")
        conn.execute(
            sa.text(
                "INSERT INTO reminder_deliveries (id, law_firm_id, source_type, source_id, occurrence_date, days_before, "
                "recipient_user_id, status, attempts, sent_at, created_at, updated_at) "
                "VALUES ('d1', 'f1', 'case_hearing', 'with-lawyer', :soon, 3, 'lawyer', 'sent', 1, :created, :created, :created)"
            ),
            {"soon": soon, "created": CREATED},
        )

    with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
        command.upgrade(config, "head")

    assert "no-users" in caplog.text
    with sa.create_engine(url).connect() as conn:
        events = {
            row.case_id: row
            for row in conn.execute(sa.text("SELECT * FROM calendar_events WHERE id != 'existing-event' AND id != 'upcoming-event'")).mappings()
        }
        assert set(events) == {"with-lawyer", "no-lawyer", "fallback-user", "past"}
        created = events["with-lawyer"]
        assert (created["title"], created["event_type"], bool(created["all_day"]), created["law_firm_id"]) == ("Duruşma", "hearing", True, "f1")
        assert str(created["starts_at"]).startswith(f"{soon} 00:00:00")
        assert (created["assignee_id"], created["created_by"], created["result_note"], created["result_case_event_id"]) == ("lawyer", "lawyer", None, None)
        assert created["reminder_days"] in ("[3, 1]", [3, 1])
        assert (events["no-lawyer"]["assignee_id"], events["no-lawyer"]["created_by"]) == (None, "admin-old")
        assert (events["fallback-user"]["assignee_id"], events["fallback-user"]["created_by"]) == (None, "only-user")
        assert str(events["past"]["starts_at"]).startswith(f"{past} 00:00:00")

        dates = dict(conn.execute(sa.text("SELECT id, next_hearing_date FROM cases")).all())
        assert dates == {
            "with-lawyer": soon,
            "already-has-event": soon,
            "no-lawyer": later,
            "fallback-user": later,
            "no-users": None,  # skipped (no user could own the event); the cache follows the events
            "past": None,
            "precedent": later,  # precedent cases are not on the calendar and stay as they were
            "stale-null": later,
        }

        copied = conn.execute(
            sa.text("SELECT source_type, source_id, days_before, status, recipient_user_id FROM reminder_deliveries WHERE source_type = 'event'")
        ).all()
        assert copied == [("event", created["id"], 3, "sent", "lawyer")]
        assert conn.execute(sa.text("SELECT COUNT(*) FROM reminder_deliveries")).scalar_one() == 2

        columns = {column["name"]: column for column in sa.inspect(conn).get_columns("calendar_events")}
        assert {"result_note", "result_case_event_id"} <= set(columns)

    command.downgrade(config, PREVIOUS_HEAD)
    with sa.create_engine(url).connect() as conn:
        assert not ({"result_note", "result_case_event_id"} & {c["name"] for c in sa.inspect(conn).get_columns("calendar_events")})
        assert conn.execute(sa.text("SELECT COUNT(*) FROM calendar_events")).scalar_one() == 6


def test_a_yesterday_hearing_is_kept_as_history_and_clears_the_cache(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _alembic_config()
    yesterday = (local_today() - timedelta(days=1)).isoformat()

    command.upgrade(config, PREVIOUS_HEAD)
    with sa.create_engine(url).begin() as conn:
        _firm(conn, "f1")
        _user(conn, "lawyer", "f1", "lawyer")
        _case(conn, "c1", "f1", lawyer="lawyer", hearing=yesterday)

    command.upgrade(config, "head")

    with sa.create_engine(url).connect() as conn:
        assert conn.execute(sa.text("SELECT next_hearing_date FROM cases")).scalar_one() is None
        assert conn.execute(sa.text("SELECT COUNT(*) FROM calendar_events WHERE case_id = 'c1'")).scalar_one() == 1
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/integration/test_hearing_dates_migration.py
```

Expected: FAIL —

```text
FAILED tests/integration/test_hearing_dates_migration.py::... - 2 failed
(the revision a7d2e4f6b8c1 does not exist, so the upgrade/convert call cannot be found)
```

- [ ] **Step 3: Implement**

The model change and the migration. The model columns come first so the ORM and the migration agree.

Create `backend/alembic/versions/a7d2e4f6b8c1_add_hearing_results.py`:

```python
"""hearing results; every case hearing date becomes a calendar event

Revision ID: a7d2e4f6b8c1
Revises: e6c1b9a4d2f8
Create Date: 2026-10-12 12:00:00

calendar_events gets result_note and result_case_event_id. A hearing now lives
in one place, a calendar event of type "hearing" linked to the case, and
cases.next_hearing_date is only a cache of the earliest one that is today or
later. So every case that has a next_hearing_date but no hearing event on that
day gets an all-day "Duruşma" event, the reminders already sent for the old
date are copied to the new event (no second e-mail), and every case's cache is
recomputed with the local date of the migration.
"""
import logging
import uuid
from datetime import date, datetime, time, timedelta
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.timeutil import local_today, utc_now
from app.domain.calendar import HEARING_REMINDER_DAYS

revision: str = "a7d2e4f6b8c1"
down_revision: Union[str, Sequence[str], None] = "e6c1b9a4d2f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

_STR = sa.String(length=36)
_cases = sa.table(
    "cases",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("assigned_lawyer_id", _STR),
    sa.column("next_hearing_date", sa.Date()),
    sa.column("is_precedent", sa.Boolean()),
)
_users = sa.table(
    "users",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("role", sa.Enum("admin", "lawyer", name="userrole", create_type=False)),
    sa.column("is_active", sa.Boolean()),
    sa.column("created_at", sa.DateTime()),
)
_events = sa.table(
    "calendar_events",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("title", sa.String()),
    sa.column(
        "event_type",
        sa.Enum("hearing", "meeting", "client_meeting", "other", name="calendareventtype", create_type=False),
    ),
    sa.column("starts_at", sa.DateTime()),
    sa.column("all_day", sa.Boolean()),
    sa.column("duration_minutes", sa.Integer()),
    sa.column("case_id", _STR),
    sa.column("assignee_id", _STR),
    sa.column("created_by", _STR),
    sa.column("reminder_days", sa.JSON()),
    sa.column("created_at", sa.DateTime()),
    sa.column("updated_at", sa.DateTime()),
)
_SOURCE_TYPE = sa.Enum("event", "task", "case_hearing", name="remindersourcetype", create_type=False)
_deliveries = sa.table(
    "reminder_deliveries",
    sa.column("id", _STR),
    sa.column("law_firm_id", _STR),
    sa.column("source_type", _SOURCE_TYPE),
    sa.column("source_id", _STR),
    sa.column("occurrence_date", sa.Date()),
    sa.column("days_before", sa.Integer()),
    sa.column("recipient_user_id", _STR),
    sa.column("status", sa.Enum("sent", "failed", name="reminderdeliverystatus", create_type=False)),
    sa.column("attempts", sa.Integer()),
    sa.column("last_error", sa.String()),
    sa.column("sent_at", sa.DateTime()),
    sa.column("created_at", sa.DateTime()),
    sa.column("updated_at", sa.DateTime()),
)


def _creator_id(conn, law_firm_id: str, lawyer_id):
    """The responsible lawyer; else the firm's oldest active administrator; else its oldest user."""
    if lawyer_id:
        return lawyer_id
    oldest_admin = conn.execute(
        sa.select(_users.c.id)
        .where(_users.c.law_firm_id == law_firm_id, _users.c.role == "admin", _users.c.is_active.is_(True))
        .order_by(_users.c.created_at, _users.c.id)
        .limit(1)
    ).scalar()
    if oldest_admin:
        return oldest_admin
    return conn.execute(
        sa.select(_users.c.id).where(_users.c.law_firm_id == law_firm_id).order_by(_users.c.created_at, _users.c.id).limit(1)
    ).scalar()


def _has_hearing_on(conn, case_id: str, day: date) -> bool:
    return (
        conn.execute(
            sa.select(_events.c.id)
            .where(
                _events.c.case_id == case_id,
                _events.c.event_type == "hearing",
                _events.c.starts_at >= datetime.combine(day, time.min),
                _events.c.starts_at < datetime.combine(day + timedelta(days=1), time.min),
            )
            .limit(1)
        ).first()
        is not None
    )


def _copy_sent_reminders(conn, case_id: str, event_id: str, day: date) -> None:
    """The old per-case reminders already went out; the new event must not send them again."""
    old = conn.execute(sa.select(_deliveries).where(
        _deliveries.c.source_type == "case_hearing",
        _deliveries.c.source_id == case_id,
        _deliveries.c.occurrence_date == day,
    )).mappings().all()
    for row in old:
        conn.execute(sa.insert(_deliveries).values(
            {**dict(row), "id": str(uuid.uuid4()), "source_type": "event", "source_id": event_id}
        ))


def convert_case_hearings(conn, today: date) -> dict[str, int]:
    """Create the missing hearing events, then recompute every cache. Returns counts."""
    created = skipped = 0
    now = utc_now()
    pending = conn.execute(
        sa.select(_cases.c.id, _cases.c.law_firm_id, _cases.c.assigned_lawyer_id, _cases.c.next_hearing_date)
        .where(_cases.c.next_hearing_date.isnot(None), _cases.c.is_precedent.is_(False))
        .order_by(_cases.c.id)
    ).all()
    for case_id, firm_id, lawyer_id, day in pending:
        if _has_hearing_on(conn, case_id, day):
            continue
        creator = _creator_id(conn, firm_id, lawyer_id)
        if creator is None:
            skipped += 1
            logger.warning("Duruşma etkinliği oluşturulamadı (büroda kullanıcı yok): dava %s", case_id)
            continue
        event_id = str(uuid.uuid4())
        conn.execute(sa.insert(_events).values(
            id=event_id, law_firm_id=firm_id, title="Duruşma", event_type="hearing",
            starts_at=datetime.combine(day, time.min), all_day=True, duration_minutes=60,
            case_id=case_id, assignee_id=lawyer_id, created_by=creator,
            reminder_days=list(HEARING_REMINDER_DAYS), created_at=now, updated_at=now,
        ))
        _copy_sent_reminders(conn, case_id, event_id, day)
        created += 1

    earliest = dict(conn.execute(
        sa.select(_events.c.case_id, sa.func.min(_events.c.starts_at))
        .where(
            _events.c.event_type == "hearing",
            _events.c.case_id.isnot(None),
            _events.c.starts_at >= datetime.combine(today, time.min),
        )
        .group_by(_events.c.case_id)
    ).all())
    recomputed = 0
    for case_id, current in conn.execute(
        sa.select(_cases.c.id, _cases.c.next_hearing_date).where(_cases.c.is_precedent.is_(False))
    ).all():
        wanted = earliest[case_id].date() if case_id in earliest else None
        if wanted != current:
            conn.execute(sa.update(_cases).where(_cases.c.id == case_id).values(next_hearing_date=wanted))
            recomputed += 1
    logger.info("Duruşma tarihleri: %d etkinlik oluşturuldu, %d dava atlandı, %d tarih yeniden hesaplandı.",
                created, skipped, recomputed)
    return {"created": created, "skipped": skipped, "recomputed": recomputed}


def upgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch:
        batch.add_column(sa.Column("result_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column(
            "result_case_event_id",
            sa.String(length=36),
            sa.ForeignKey("case_events.id", name="fk_calendar_events_result_case_event_id", ondelete="SET NULL"),
            nullable=True,
        ))
    convert_case_hearings(op.get_bind(), local_today())


def downgrade() -> None:
    # The events created by upgrade() stay: they are ordinary hearings.
    with op.batch_alter_table("calendar_events") as batch:
        batch.drop_column("result_case_event_id")
        batch.drop_column("result_note")
```

Modify `backend/app/models/calendar.py`:

```diff
--- a/backend/app/models/calendar.py
+++ b/backend/app/models/calendar.py
@@ -40,6 +40,12 @@ class CalendarEvent(Base):
     assignee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
     created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
     reminder_days: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
+    #: After-the-hearing note (hearing events only); see POST /calendar/events/{id}/result.
+    result_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
+    #: The timeline entry written for the result note. Deleting that entry only unlinks it.
+    result_case_event_id: Mapped[Optional[str]] = mapped_column(
+        String(36), ForeignKey("case_events.id", ondelete="SET NULL"), nullable=True
+    )
     created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
     updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)
 
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/integration/test_hearing_dates_migration.py
```

Expected: PASS —

```text
2 passed
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/integration
```

Expected: PASS — no failures (the migration chain test of earlier features still reaches the new head).

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/a7d2e4f6b8c1_add_hearing_results.py backend/app/models/calendar.py backend/tests/integration/test_hearing_dates_migration.py
git commit -F - <<'EOF'
feat: hearing result columns and conversion of case hearing dates into events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 2: Hearings are calendar events; next_hearing_date is computed from them

The heart of the change. `hearing_dates.recompute_next_hearing` replaces the old two-way sync: the calendar service recomputes the affected cases on every hearing create / update / delete, refuses new hearings on a closed case (409), no longer derives `case_hearing` items, and returns `result_note`. `POST /cases` creates the hearing event itself, `PATCH /cases/{id}` rejects `next_hearing_date`, and the repository's "hearing within N days" uses the application clock.

**Files:**
- Modify: `backend/app/api/routes/calendar.py`
- Modify: `backend/app/api/routes/cases.py`
- Modify: `backend/app/repositories/case_repository.py`
- Modify: `backend/app/schemas/calendar.py`
- Modify: `backend/app/services/calendar_service.py`
- Modify: `backend/app/services/case_lifecycle.py`
- Modify: `backend/app/services/case_service.py`
- Create: `backend/app/services/hearing_dates.py`
- Test (modify): `backend/tests/api/test_calendar.py`
- Test (modify): `backend/tests/api/test_calendar_events.py`
- Test (modify): `backend/tests/api/test_case_handover.py`
- Test (modify): `backend/tests/api/test_case_update_rules.py`
- Test (modify): `backend/tests/api/test_cases.py`
- Test (create): `backend/tests/unit/test_hearing_dates.py`

**Interfaces:**
- Consumes: Task 1's columns, `CaseRepository.get_by_id_in_firm_for_update`, `case_is_active`, `HEARING_REMINDER_DAYS`, `local_today`.
- Produces: `app.services.hearing_dates`: `recompute_next_hearing(db, case, today)` (flushes first; does not commit), `recompute_open_cases(db, today) -> int` (commits), `add_all_day_hearing(db, case, day, created_by) -> CalendarEvent`; `ClosedCaseHearing`, `CLOSED_CASE_HEARING`, `require_case_open_for_hearing(case)` in `calendar_service`; `CaseService.create_case(law_firm_id, payload, created_by, today)`; `CalendarItemOut.kind: Literal["event", "task"]` and `result_note` on `CalendarItemOut` / `CalendarEventOut`.

- [ ] **Step 1: Write the failing tests**

Existing calendar tests that expected the derived `case_hearing` items and the two-way sync are rewritten for the new behaviour; the dates come from `local_today()` so the tests do not depend on the day they run.

Modify `backend/tests/api/test_calendar.py`:

```diff
--- a/backend/tests/api/test_calendar.py
+++ b/backend/tests/api/test_calendar.py
@@ -1,6 +1,6 @@
-"""Calendar API (Takvim): merges calendar events, task due dates and case
-hearing dates into one firm-wide chronological view."""
-from datetime import date
+"""Calendar API (Takvim): merges calendar events (hearings included) and task
+due dates into one firm-wide chronological view."""
+from datetime import date, timedelta
 
 RANGE_2026 = {"from": "2026-01-01", "to": "2026-12-31"}
 
@@ -31,18 +31,20 @@ def _create_case(client, headers, **overrides):
     return client.post("/cases", json=payload, headers=headers).json()
 
 
-def test_calendar_includes_case_hearing_date(client, two_firms_two_users):
+def test_calendar_includes_the_hearing_given_when_the_case_is_created(client, two_firms_two_users):
     headers = _auth_headers(client, two_firms_two_users)
-    case = _create_case(client, headers)
-    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-10-05"}, headers=headers)
+    today, window = _window()
+    hearing = (today + timedelta(days=5)).isoformat()
+    case = _create_case(client, headers, next_hearing_date=hearing)
 
-    response = client.get("/calendar", params=RANGE_2026, headers=headers)
-    assert response.status_code == 200
-    body = response.json()
-    hearing_events = [e for e in body if e["event_type"] == "hearing"]
-    assert len(hearing_events) == 1
-    assert hearing_events[0]["date"] == "2026-10-05"
-    assert hearing_events[0]["case_name"] == VALID_CASE_PAYLOAD["case_name"]
+    body = client.get("/calendar", params=window, headers=headers).json()
+
+    hearings = [e for e in body if e["event_type"] == "hearing"]
+    assert len(hearings) == 1
+    item = hearings[0]
+    assert (item["kind"], item["date"], item["all_day"], item["title"]) == ("event", hearing, True, "Duruşma")
+    assert (item["case_id"], item["case_name"], item["editable"]) == (case["id"], VALID_CASE_PAYLOAD["case_name"], True)
+    assert case["next_hearing_date"] == hearing
 
 
 def test_calendar_includes_task_due_date(client, two_firms_two_users):
@@ -65,41 +67,43 @@ def test_calendar_includes_task_due_date(client, two_firms_two_users):
 
 def test_calendar_sorted_chronologically(client, two_firms_two_users):
     headers = _auth_headers(client, two_firms_two_users)
-    case = _create_case(client, headers, case_number="2026/803")
-    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-12-01"}, headers=headers)
+    today, window = _window()
+    case = _create_case(client, headers, case_number="2026/803", next_hearing_date=(today + timedelta(days=20)).isoformat())
     client.post(
         f"/cases/{case['id']}/tasks",
-        json={"title": "Erken gorev", "due_date": "2026-09-01"},
+        json={"title": "Erken gorev", "due_date": (today + timedelta(days=2)).isoformat()},
         headers=headers,
     )
 
-    response = client.get("/calendar", params=RANGE_2026, headers=headers)
+    response = client.get("/calendar", params=window, headers=headers)
     dates = [e["date"] for e in response.json()]
-    assert dates == sorted(dates)
+    assert len(dates) == 2 and dates == sorted(dates)
 
 
 def test_calendar_isolated_by_law_firm(client, two_firms_two_users):
     fixtures = two_firms_two_users
     headers_a = _auth_headers(client, fixtures, "user_a")
     headers_b = _auth_headers(client, fixtures, "user_b")
-    case = _create_case(client, headers_a, case_number="2026/804")
-    client.patch(f"/cases/{case['id']}", json={"next_hearing_date": "2026-11-01"}, headers=headers_a)
+    today, window = _window()
+    _create_case(client, headers_a, case_number="2026/804", next_hearing_date=(today + timedelta(days=3)).isoformat())
 
-    response = client.get("/calendar", params=RANGE_2026, headers=headers_b)
+    assert len(client.get("/calendar", params=window, headers=headers_a).json()) == 1
+    response = client.get("/calendar", params=window, headers=headers_b)
     assert response.status_code == 200
     assert response.json() == []
 
 
 def test_calendar_task_events_carry_task_id(client, two_firms_two_users):
     headers = _auth_headers(client, two_firms_two_users)
-    case = _create_case(client, headers, case_number="2026/803", next_hearing_date="2026-10-07")
+    today, window = _window()
+    case = _create_case(client, headers, case_number="2026/803", next_hearing_date=(today + timedelta(days=4)).isoformat())
     task = client.post(
         f"/cases/{case['id']}/tasks",
-        json={"title": "Delil listesi", "due_date": "2026-10-08"},
+        json={"title": "Delil listesi", "due_date": (today + timedelta(days=5)).isoformat()},
         headers=headers,
     ).json()
 
-    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+    body = client.get("/calendar", params=window, headers=headers).json()
 
     task_event = next(e for e in body if e["event_type"] == "task")
     hearing_event = next(e for e in body if e["event_type"] == "hearing")
@@ -144,6 +148,7 @@ def test_calendar_lists_events_with_the_unified_fields(client, two_firms_two_use
             "location": "Büro",
             "notes": "Belgeleri getir",
             "reminder_days": [3],
+            "result_note": None,
             "editable": True,
         }
     ]
@@ -161,30 +166,31 @@ def test_all_day_events_have_no_start_or_end(client, two_firms_two_users):
 def test_task_and_hearing_items_carry_kind_assignee_and_default_reminders(client, two_firms_two_users):
     fixtures = two_firms_two_users
     headers = _auth_headers(client, fixtures)
+    today, window = _window()
+    hearing_day = (today + timedelta(days=6)).isoformat()
     case = _create_case(
-        client, headers, case_number="2026/811", next_hearing_date="2026-10-09",
+        client, headers, case_number="2026/811", next_hearing_date=hearing_day,
         assigned_lawyer_id=fixtures["user_a"].id,
     )
     task = client.post(
         f"/cases/{case['id']}/tasks",
-        json={"title": "Delil listesi", "due_date": "2026-10-08", "assigned_to": fixtures["user_a"].id},
+        json={"title": "Delil listesi", "due_date": (today + timedelta(days=5)).isoformat(), "assigned_to": fixtures["user_a"].id},
         headers=headers,
     ).json()
 
-    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+    body = client.get("/calendar", params=window, headers=headers).json()
     task_item = next(item for item in body if item["kind"] == "task")
-    hearing_item = next(item for item in body if item["kind"] == "case_hearing")
+    hearing_item = next(item for item in body if item["event_type"] == "hearing")
 
     assert task_item["id"] == f"task:{task['id']}"
     assert (task_item["event_type"], task_item["all_day"], task_item["editable"]) == ("task", True, False)
     assert task_item["reminder_days"] == [1]
     assert task_item["assignee_name"] == "Avukat A"
-    assert hearing_item["id"] == f"hearing:{case['id']}"
-    assert hearing_item["event_type"] == "hearing"
-    assert hearing_item["title"] == f"Duruşma - {VALID_CASE_PAYLOAD['case_name']}"
+    assert hearing_item["id"].startswith("event:")
+    assert (hearing_item["kind"], hearing_item["title"], hearing_item["date"]) == ("event", "Duruşma", hearing_day)
     assert hearing_item["reminder_days"] == [3, 1]
-    assert hearing_item["assignee_id"] == fixtures["user_a"].id
-    assert hearing_item["location"] == VALID_CASE_PAYLOAD["court"]
+    assert (hearing_item["assignee_id"], hearing_item["assignee_name"]) == (fixtures["user_a"].id, "Avukat A")
+    assert [item["kind"] for item in body].count("case_hearing") == 0
 
 
 def test_task_items_show_their_own_reminder_days(client, two_firms_two_users):
@@ -200,19 +206,19 @@ def test_task_items_show_their_own_reminder_days(client, two_firms_two_users):
     assert item["reminder_days"] == []
 
 
-def test_case_hearing_is_hidden_when_a_hearing_event_exists_that_day(client, two_firms_two_users):
+def test_hearings_on_the_same_day_are_listed_as_separate_events(client, two_firms_two_users):
     headers = _auth_headers(client, two_firms_two_users)
-    case = _create_case(client, headers, case_number="2026/813", next_hearing_date="2026-10-09")
-    other_day = _create_case(client, headers, case_number="2026/814", next_hearing_date="2026-10-10")
-    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=case["id"], starts_at="2026-10-09T10:00:00")
-    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=other_day["id"], starts_at="2026-10-11T10:00:00")
+    today, window = _window()
+    day = (today + timedelta(days=3)).isoformat()
+    case = _create_case(client, headers, case_number="2026/813", next_hearing_date=day)
+    # The same day again, timed: a second hearing, not a duplicate of a derived row.
+    _create_event(client, headers, title="Duruşma", event_type="hearing", case_id=case["id"], starts_at=f"{day}T10:00:00")
 
-    body = client.get("/calendar", params=RANGE_2026, headers=headers).json()
+    body = client.get("/calendar", params=window, headers=headers).json()
 
-    assert [(item["kind"], item["case_id"], item["date"]) for item in body] == [
-        ("event", case["id"], "2026-10-09"),
-        ("case_hearing", other_day["id"], "2026-10-10"),
-        ("event", other_day["id"], "2026-10-11"),
+    assert [(item["kind"], item["case_id"], item["date"], item["all_day"]) for item in body] == [
+        ("event", case["id"], day, True),
+        ("event", case["id"], day, False),
     ]
 
 
@@ -277,15 +283,11 @@ def _window():
     return today, {"from": (today - timedelta(days=10)).isoformat(), "to": (today + timedelta(days=30)).isoformat()}
 
 
-def test_closed_and_archived_cases_produce_no_hearing_items(client, two_firms_two_users, close_case):
-    from datetime import timedelta
-
+def test_closed_and_archived_cases_keep_their_hearing_events_and_cached_date(client, two_firms_two_users, close_case):
     headers = _auth_headers(client, two_firms_two_users)
     today, window = _window()
     opened = (today - timedelta(days=30)).isoformat()
     hearing = (today + timedelta(days=5)).isoformat()
-    open_case = _create_case(client, headers, case_number="2026/861", case_name="Açık Dava",
-                             opening_date=opened, next_hearing_date=hearing)
     closed = _create_case(client, headers, case_number="2026/862", case_name="Kapalı Dava",
                           opening_date=opened, next_hearing_date=hearing)
     archived = _create_case(client, headers, case_number="2026/863", case_name="Arşivli Dava",
@@ -296,8 +298,11 @@ def test_closed_and_archived_cases_produce_no_hearing_items(client, two_firms_tw
 
     body = client.get("/calendar", params=window, headers=headers).json()
 
-    hearings = [item["case_id"] for item in body if item["kind"] == "case_hearing"]
-    assert hearings == [open_case["id"]]
+    # Hearings are real events now: they stay on the calendar as history (the archived one read-only).
+    assert {item["case_id"]: item["editable"] for item in body if item["event_type"] == "hearing"} == {
+        closed["id"]: True,
+        archived["id"]: False,
+    }
     # The data is kept: closing does not clear the hearing date.
     assert client.get(f"/cases/{closed['id']}", headers=headers).json()["next_hearing_date"] == hearing
 
```

Modify `backend/tests/api/test_calendar_events.py`:

```diff
--- a/backend/tests/api/test_calendar_events.py
+++ b/backend/tests/api/test_calendar_events.py
@@ -183,16 +183,16 @@ def test_hearing_event_sets_an_empty_next_hearing_date(client, two_firms_two_use
     assert _next_hearing(client, headers, case["id"]) == "2099-05-10"
 
 
-def test_hearing_event_moves_a_later_next_hearing_date_earlier_only(client, two_firms_two_users):
+def test_the_earliest_upcoming_hearing_is_the_next_hearing(client, two_firms_two_users):
     headers = _auth_headers(client, two_firms_two_users)
-    later = _create_case(client, headers, case_number="2026/902", next_hearing_date="2099-06-01")
-    earlier = _create_case(client, headers, case_number="2026/903", next_hearing_date="2099-05-01")
-
-    _hearing(client, headers, later["id"], "2099-05-10T10:00:00")
-    _hearing(client, headers, earlier["id"], "2099-05-10T10:00:00")
+    case = _create_case(client, headers)
 
-    assert _next_hearing(client, headers, later["id"]) == "2099-05-10"
-    assert _next_hearing(client, headers, earlier["id"]) == "2099-05-01"
+    _hearing(client, headers, case["id"], "2099-06-01T10:00:00")
+    assert _next_hearing(client, headers, case["id"]) == "2099-06-01"
+    _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
+    assert _next_hearing(client, headers, case["id"]) == "2099-05-10"
+    _hearing(client, headers, case["id"], "2099-07-01T10:00:00")
+    assert _next_hearing(client, headers, case["id"]) == "2099-05-10"
 
 
 def test_past_hearings_and_other_event_types_do_not_touch_the_case(client, two_firms_two_users):
@@ -280,16 +280,51 @@ def test_moving_a_hearing_event_to_another_case_recomputes_old_and_sets_new(clie
     assert _next_hearing(client, headers, new_case["id"]) == "2099-05-10"
 
 
-def test_a_case_date_that_differs_from_the_events_old_day_is_left_alone(client, two_firms_two_users):
+def test_a_hearing_today_counts_a_past_one_does_not_and_the_local_date_decides(client, two_firms_two_users):
+    from datetime import timedelta
+
+    from app.core.timeutil import local_today
+
     headers = _auth_headers(client, two_firms_two_users)
-    case = _create_case(client, headers, next_hearing_date="2099-04-01")
-    event = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
-    assert _next_hearing(client, headers, case["id"]) == "2099-04-01"
+    today = local_today()
+    case = _create_case(client, headers)
+
+    _hearing(client, headers, case["id"], f"{today - timedelta(days=1)}T23:30:00")
+    assert _next_hearing(client, headers, case["id"]) is None
+    # Today counts all day, even when the hearing's time has passed.
+    _hearing(client, headers, case["id"], f"{today}T00:05:00")
+    assert _next_hearing(client, headers, case["id"]) == today.isoformat()
+
+    other = _create_case(client, headers, case_number="2026/906")
+    # 22:30 UTC is already after midnight in Istanbul: the hearing belongs to the next local day.
+    _hearing(client, headers, other["id"], "2099-03-10T22:30:00Z")
+    assert _next_hearing(client, headers, other["id"]) == "2099-03-11"
 
-    client.patch(f"/calendar/events/{event['id']}", json={"starts_at": "2099-06-20T09:00:00"}, headers=headers)
-    assert _next_hearing(client, headers, case["id"]) == "2099-04-01"
-    client.delete(f"/calendar/events/{event['id']}", headers=headers)
-    assert _next_hearing(client, headers, case["id"]) == "2099-04-01"
+
+def test_a_closed_case_takes_no_new_hearing_but_keeps_editing_its_old_ones(client, two_firms_two_users, close_case):
+    headers = _auth_headers(client, two_firms_two_users)
+    case = _create_case(client, headers)
+    other = _create_case(client, headers, case_number="2026/907")
+    existing = _hearing(client, headers, case["id"], "2099-05-10T10:00:00")
+    meeting = _create_event(client, headers, case_id=case["id"], starts_at="2099-05-11T10:00:00").json()
+    loose = _hearing(client, headers, other["id"], "2099-06-10T10:00:00")
+    close_case(headers, case["id"])
+    refused = "Kapalı davaya duruşma eklenemez."
+
+    new_hearing = _create_event(client, headers, event_type="hearing", case_id=case["id"], starts_at="2099-05-12T10:00:00")
+    moved_in = client.patch(f"/calendar/events/{loose['id']}", json={"case_id": case["id"]}, headers=headers)
+    retyped = client.patch(f"/calendar/events/{meeting['id']}", json={"event_type": "hearing"}, headers=headers)
+
+    assert [(r.status_code, r.json()["detail"]) for r in (new_hearing, moved_in, retyped)] == [(409, refused)] * 3
+    assert _next_hearing(client, headers, other["id"]) == "2099-06-10"
+    assert client.get(f"/calendar/events/{meeting['id']}", headers=headers).json()["event_type"] == "meeting"
+    # A meeting may be added, the existing hearing edited and deleted.
+    assert _create_event(client, headers, case_id=case["id"], starts_at="2099-05-13T10:00:00").status_code == 201
+    edited = client.patch(f"/calendar/events/{existing['id']}", json={"starts_at": "2099-08-01T09:00:00"}, headers=headers)
+    assert edited.status_code == 200
+    assert _next_hearing(client, headers, case["id"]) == "2099-08-01"
+    assert client.delete(f"/calendar/events/{existing['id']}", headers=headers).status_code == 204
+    assert _next_hearing(client, headers, case["id"]) is None
 
 
 def test_patch_with_an_assignee_from_another_firm_is_404_and_changes_nothing(client, two_firms_two_users):
```

Modify `backend/tests/api/test_case_handover.py`:

```diff
--- a/backend/tests/api/test_case_handover.py
+++ b/backend/tests/api/test_case_handover.py
@@ -1,5 +1,11 @@
 """Case Handover (section 18, 22 - Case Handover)."""
 import json
+from datetime import timedelta
+
+from app.core.timeutil import local_today
+
+# The hearing date is only kept while it is today or later (it is a cache of the calendar).
+HEARING_DAY = (local_today() + timedelta(days=20)).isoformat()
 
 VALID_JUDGE_JSON = json.dumps(
     {
@@ -36,7 +42,7 @@ def _create_case(client, headers):
         "case_type": "sozlesme",
         "court": "Istanbul 1. Asliye Hukuk Mahkemesi",
         "status": "devam_eden",
-        "next_hearing_date": "2026-09-15",
+        "next_hearing_date": HEARING_DAY,
     }
     return client.post("/cases", json=payload, headers=headers).json()
 
@@ -128,7 +134,7 @@ def test_handover_includes_upcoming_dates(client, two_firms_two_users):
     case = _create_case(client, headers)
 
     response = client.post(f"/cases/{case['id']}/handover", headers=headers)
-    assert response.json()["upcoming_dates"] == ["2026-09-15"]
+    assert response.json()["upcoming_dates"] == [HEARING_DAY]
 
 
 def test_handover_uses_latest_simulation_for_arguments_and_risks(client, two_firms_two_users, db_session):
```

Modify `backend/tests/api/test_case_update_rules.py`:

```diff
--- a/backend/tests/api/test_case_update_rules.py
+++ b/backend/tests/api/test_case_update_rules.py
@@ -32,6 +32,16 @@ def _patch(client, headers, case_id, **body):
     return client.patch(f"/cases/{case_id}", json=body, headers=headers)
 
 
+# --- the hearing date is not edited here ---
+
+def test_patch_rejects_next_hearing_date(client, lawyer, case):
+    for body in ({"next_hearing_date": "2099-01-05"}, {"next_hearing_date": None}, {"next_hearing_date": "2099-01-05", "case_name": "X"}):
+        response = client.patch(f"/cases/{case['id']}", json=body, headers=lawyer)
+        assert (response.status_code, response.json()["detail"]) == (422, "Duruşma tarihi Duruşmalar bölümünden eklenir."), body
+    detail = client.get(f"/cases/{case['id']}", headers=lawyer).json()
+    assert (detail["next_hearing_date"], detail["case_name"]) == (None, "Alacak Davası")
+
+
 # --- status and outcome ------------------------------------------------------------------
 
 def test_patch_cannot_close_a_case(client, lawyer, case):
```

Modify `backend/tests/api/test_cases.py`:

```diff
--- a/backend/tests/api/test_cases.py
+++ b/backend/tests/api/test_cases.py
@@ -231,8 +231,10 @@ def test_filter_cases_active_true_and_false(client, two_firms_two_users):
 
 
 def test_filter_cases_by_hearing_window_is_inclusive(client, two_firms_two_users):
+    from app.core.timeutil import local_today
+
     headers = _auth_headers(client, two_firms_two_users)
-    today = date.today()
+    today = local_today()
     today_case = _create(client, headers, case_number="2026/720", next_hearing_date=today.isoformat())
     soon = _create(client, headers, case_number="2026/721", next_hearing_date=(today + timedelta(days=3)).isoformat())
     edge = _create(client, headers, case_number="2026/722", next_hearing_date=(today + timedelta(days=30)).isoformat())
@@ -250,3 +252,56 @@ def test_hearing_window_rejects_out_of_range_values(client, two_firms_two_users)
     headers = _auth_headers(client, two_firms_two_users)
     assert client.get("/cases?hearing_within_days=0", headers=headers).status_code == 422
     assert client.get("/cases?hearing_within_days=366", headers=headers).status_code == 422
+
+
+def _hearing_events(client, headers, window):
+    return [item for item in client.get("/calendar", params=window, headers=headers).json() if item["event_type"] == "hearing"]
+
+
+def test_create_case_turns_next_hearing_date_into_an_all_day_hearing_event(client, two_firms_two_users):
+    from app.core.timeutil import local_today
+
+    fixtures = two_firms_two_users
+    headers = _auth_headers(client, fixtures)
+    today = local_today()
+    day = (today + timedelta(days=9)).isoformat()
+
+    case = _create(client, headers, next_hearing_date=day)
+
+    assert case["next_hearing_date"] == day
+    [item] = _hearing_events(client, headers, {"from": today.isoformat(), "to": (today + timedelta(days=30)).isoformat()})
+    event = client.get(f"/calendar/events/{item['event_id']}", headers=headers).json()
+    assert (event["title"], event["event_type"], event["all_day"]) == ("Duruşma", "hearing", True)
+    assert event["starts_at"] == f"{day}T00:00:00"
+    assert (event["case_id"], event["created_by"], event["reminder_days"]) == (case["id"], fixtures["user_a"].id, [3, 1])
+    assert event["assignee_id"] == case["assigned_lawyer_id"] == fixtures["user_a"].id
+
+
+def test_create_case_with_a_past_hearing_date_keeps_the_event_as_history(client, two_firms_two_users):
+    from app.core.timeutil import local_today
+
+    headers = _auth_headers(client, two_firms_two_users)
+    today = local_today()
+    yesterday = (today - timedelta(days=1)).isoformat()
+
+    case = _create(client, headers, next_hearing_date=yesterday)
+
+    assert case["next_hearing_date"] is None
+    assert [item["date"] for item in _hearing_events(client, headers, {"from": yesterday, "to": today.isoformat()})] == [yesterday]
+
+
+def test_create_case_without_a_hearing_date_creates_no_event(client, two_firms_two_users):
+    from app.core.timeutil import local_today
+
+    headers = _auth_headers(client, two_firms_two_users)
+    today = local_today()
+    _create(client, headers)
+    assert _hearing_events(client, headers, {"from": (today - timedelta(days=30)).isoformat(), "to": (today + timedelta(days=300)).isoformat()}) == []
+
+
+def test_a_duplicate_case_number_creates_no_hearing_event(client, two_firms_two_users):
+    headers = _auth_headers(client, two_firms_two_users)
+    _create(client, headers)
+    duplicate = client.post("/cases", json={**VALID_CASE_PAYLOAD, "next_hearing_date": "2099-01-05"}, headers=headers)
+    assert duplicate.status_code == 409
+    assert _hearing_events(client, headers, {"from": "2099-01-01", "to": "2099-12-31"}) == []
```

Create `backend/tests/unit/test_hearing_dates.py`:

```python
"""next_hearing_date is a cache of the earliest hearing event that is today or later."""
from datetime import datetime, timedelta

import pytest

from app.core.timeutil import local_today
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseStatus, CaseType
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.services.hearing_dates import add_all_day_hearing, recompute_next_hearing, recompute_open_cases

TODAY = local_today()


@pytest.fixture()
def world(db_session):
    firm = LawFirm(name="Büro")
    other_firm = LawFirm(name="Başka Büro")
    db_session.add_all([firm, other_firm])
    db_session.flush()
    lawyer = User(law_firm_id=firm.id, email="a@test", hashed_password="x", full_name="Avukat", role=UserRole.LAWYER, is_active=True)
    db_session.add(lawyer)
    db_session.flush()

    def case(number, firm_id=firm.id, **fields):
        item = Case(law_firm_id=firm_id, case_number=number, case_name=number, client_name="M", case_type=CaseType.KIRA,
                    assigned_lawyer_id=lawyer.id, **fields)
        db_session.add(item)
        db_session.flush()
        return item

    def hearing(item, starts_at, event_type=CalendarEventType.HEARING):
        event = CalendarEvent(law_firm_id=item.law_firm_id, title="Duruşma", event_type=event_type, starts_at=starts_at,
                              all_day=False, duration_minutes=60, case_id=item.id, created_by=lawyer.id, reminder_days=[3, 1])
        db_session.add(event)
        db_session.flush()
        return event

    return {"db": db_session, "firm": firm, "other_firm": other_firm, "lawyer": lawyer, "case": case, "hearing": hearing}


def at(days, hour=10):
    return datetime.combine(TODAY + timedelta(days=days), datetime.min.time()).replace(hour=hour)


def test_the_earliest_hearing_from_today_on_wins(world):
    case = world["case"]("2026/1")
    world["hearing"](case, at(-3))
    world["hearing"](case, at(9))
    world["hearing"](case, at(4))
    world["hearing"](case, at(2), event_type=CalendarEventType.MEETING)

    recompute_next_hearing(world["db"], case, TODAY)

    assert case.next_hearing_date == TODAY + timedelta(days=4)


def test_a_hearing_today_counts_even_after_its_time_and_none_left_clears_the_date(world):
    case = world["case"]("2026/1", next_hearing_date=TODAY - timedelta(days=20))
    hearing = world["hearing"](case, at(0, hour=0))

    recompute_next_hearing(world["db"], case, TODAY)
    assert case.next_hearing_date == TODAY

    recompute_next_hearing(world["db"], case, TODAY + timedelta(days=1))  # the next local day
    assert case.next_hearing_date is None
    world["db"].delete(hearing)
    recompute_next_hearing(world["db"], case, TODAY)
    assert case.next_hearing_date is None


def test_other_cases_and_other_firms_do_not_leak_in(world):
    mine = world["case"]("2026/1")
    other = world["case"]("2026/2")
    foreign = world["case"]("2026/3", firm_id=world["other_firm"].id)
    world["hearing"](other, at(1))
    world["hearing"](foreign, at(2))

    recompute_next_hearing(world["db"], mine, TODAY)

    assert mine.next_hearing_date is None


def test_recompute_open_cases_only_touches_open_cases(world):
    stale = world["case"]("2026/1", next_hearing_date=TODAY - timedelta(days=1))
    fresh = world["case"]("2026/2")
    closed = world["case"]("2026/3", status=CaseStatus.KAPALI, next_hearing_date=TODAY - timedelta(days=1))
    archived = world["case"]("2026/4", is_archived=True, next_hearing_date=TODAY - timedelta(days=1))
    precedent = world["case"]("2026/5", is_precedent=True, next_hearing_date=TODAY - timedelta(days=1))
    unchanged = world["case"]("2026/6", next_hearing_date=TODAY + timedelta(days=2))
    world["hearing"](stale, at(6))
    world["hearing"](fresh, at(3))
    world["hearing"](unchanged, at(2))
    world["hearing"](closed, at(3))
    world["db"].commit()

    changed = recompute_open_cases(world["db"], TODAY)

    assert changed == 2
    world["db"].expire_all()
    assert stale.next_hearing_date == TODAY + timedelta(days=6)
    assert fresh.next_hearing_date == TODAY + timedelta(days=3)
    assert unchanged.next_hearing_date == TODAY + timedelta(days=2)
    # Closed, archived and precedent cases keep what they have.
    assert closed.next_hearing_date == archived.next_hearing_date == precedent.next_hearing_date == TODAY - timedelta(days=1)


def test_recompute_open_cases_moves_a_date_that_has_passed_to_the_next_hearing(world):
    case = world["case"]("2026/1", next_hearing_date=TODAY)
    world["hearing"](case, at(0))
    world["hearing"](case, at(14))
    world["db"].commit()

    assert recompute_open_cases(world["db"], TODAY + timedelta(days=1)) == 1

    world["db"].refresh(case)
    assert case.next_hearing_date == TODAY + timedelta(days=14)


def test_add_all_day_hearing_defaults(world):
    case = world["case"]("2026/1")
    day = TODAY + timedelta(days=7)

    event = add_all_day_hearing(world["db"], case, day, world["lawyer"].id)
    world["db"].flush()

    assert (event.title, event.event_type, event.all_day, event.starts_at) == ("Duruşma", CalendarEventType.HEARING, True, datetime.combine(day, datetime.min.time()))
    assert (event.case_id, event.assignee_id, event.created_by, event.reminder_days) == (case.id, world["lawyer"].id, world["lawyer"].id, [3, 1])
    assert event.law_firm_id == world["firm"].id
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/api/test_calendar.py tests/api/test_calendar_events.py tests/api/test_case_handover.py tests/api/test_case_update_rules.py tests/api/test_cases.py tests/unit/test_hearing_dates.py
```

Expected: FAIL —

```text
ERROR tests/unit/test_hearing_dates.py
E   ModuleNotFoundError: No module named 'app.services.hearing_dates'
Interrupted: 1 error during collection

(run the five tests/api files without the unit file to see the behaviour failing: 9 failed — hearings are still derived from next_hearing_date, PATCH accepts the field, a hearing event does not move the cache, a closed case takes a hearing)
```

- [ ] **Step 3: Implement**

`hearing_dates.py` is new; `calendar_service.py` loses `_sync_next_hearing`, `_release_hearing_day` and the derived items. `normalize_start` is private in this task (`_normalize_start`) and made public when Task 6 needs it.

Modify `backend/app/api/routes/calendar.py`:

```diff
--- a/backend/app/api/routes/calendar.py
+++ b/backend/app/api/routes/calendar.py
@@ -18,7 +18,7 @@ from app.db.session import get_db
 from app.models.user import User
 from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, CalendarItemOut
 from app.services.assignees import AssigneeNotAssignable
-from app.services.calendar_service import CalendarReferenceNotFound, CalendarService
+from app.services.calendar_service import CalendarReferenceNotFound, CalendarService, ClosedCaseHearing
 
 router = APIRouter(prefix="/calendar", tags=["calendar"])
 
@@ -71,6 +71,8 @@ def create_calendar_event(
         )
     except CalendarReferenceNotFound as exc:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
+    except ClosedCaseHearing as exc:
+        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail)
     except AssigneeNotAssignable as exc:
         raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)
 
@@ -100,6 +102,8 @@ def update_calendar_event(
         return service.update_event(event, payload, today=local_today())
     except CalendarReferenceNotFound as exc:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)
+    except ClosedCaseHearing as exc:
+        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.detail)
     except AssigneeNotAssignable as exc:
         raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail)
 
```

Modify `backend/app/api/routes/cases.py`:

```diff
--- a/backend/app/api/routes/cases.py
+++ b/backend/app/api/routes/cases.py
@@ -62,7 +62,7 @@ def create_case(
         raise HTTPException(status_code=422, detail="Choose a responsible lawyer")
     payload = payload.model_copy(update={"assigned_lawyer_id": lawyer_id})
     try:
-        return CaseService(db).create_case(current_user.law_firm_id, payload)
+        return CaseService(db).create_case(current_user.law_firm_id, payload, current_user.id, local_today())
     except DuplicateCaseNumberError as exc:
         raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
     except InvalidPartiesError as exc:
```

Modify `backend/app/repositories/case_repository.py`:

```diff
--- a/backend/app/repositories/case_repository.py
+++ b/backend/app/repositories/case_repository.py
@@ -4,12 +4,13 @@ Every method takes law_firm_id as a mandatory filter, mirroring
 UserRepository. This is the pattern all future tenant-scoped
 repositories (Document, Simulation, ...) must follow.
 """
-from datetime import date, timedelta
+from datetime import timedelta
 from typing import Optional
 
 from sqlalchemy import or_
 from sqlalchemy.orm import Session
 
+from app.core.timeutil import local_today
 from app.models.case import Case, CaseOutcome, CaseStatus, CaseType, case_is_active
 
 
@@ -87,7 +88,7 @@ class CaseRepository:
             query = query.filter(Case.status == CaseStatus.KAPALI)
 
         if hearing_within_days is not None:
-            today = date.today()
+            today = local_today()
             # Closed and archived cases keep the date but have no upcoming hearing.
             query = query.filter(
                 case_is_active(),
```

Modify `backend/app/schemas/calendar.py`:

```diff
--- a/backend/app/schemas/calendar.py
+++ b/backend/app/schemas/calendar.py
@@ -16,12 +16,12 @@ NotesText = Annotated[str, StringConstraints(max_length=5000)]
 
 
 class CalendarItemOut(BaseModel):
-    """One row of GET /calendar: a calendar event, a pending task's due date
-    or a case's next hearing. The legacy fields (date, title, case_id,
-    case_name, task_id, event_type "hearing"/"task") keep their meaning."""
+    """One row of GET /calendar: a calendar event (a hearing is one) or a pending
+    task's due date. The legacy fields (date, title, case_id, case_name, task_id,
+    event_type "hearing"/"task") keep their meaning."""
 
-    id: str  # "event:<id>", "task:<id>" or "hearing:<case_id>"
-    kind: Literal["event", "task", "case_hearing"]
+    id: str  # "event:<id>" or "task:<id>"
+    kind: Literal["event", "task"]
     event_type: Literal["hearing", "meeting", "client_meeting", "other", "task"]
     title: str
     date: date
@@ -37,6 +37,7 @@ class CalendarItemOut(BaseModel):
     location: Optional[str] = None
     notes: Optional[str] = None
     reminder_days: list[int]
+    result_note: Optional[str] = None  # hearings only
     editable: bool
 
 
@@ -92,5 +93,6 @@ class CalendarEventOut(BaseModel):
     assignee_id: Optional[str] = None
     created_by: str
     reminder_days: list[int]
+    result_note: Optional[str] = None
     created_at: datetime
     updated_at: datetime
```

Modify `backend/app/services/calendar_service.py`:

```diff
--- a/backend/app/services/calendar_service.py
+++ b/backend/app/services/calendar_service.py
@@ -9,12 +9,14 @@ from typing import Optional
 from sqlalchemy.orm import Session
 
 from app.core.timeutil import to_local_naive
-from app.domain.calendar import HEARING_REMINDER_DAYS, default_event_reminder_days, task_reminder_days
+from app.domain.calendar import default_event_reminder_days, task_reminder_days
 from app.models.calendar import CalendarEvent, CalendarEventType
-from app.models.case import Case, case_is_active
+from app.models.case import Case, CaseStatus
 from app.models.task import Task, TaskStatus
 from app.models.user import User
+from app.repositories.case_repository import CaseRepository
 from app.services.assignees import find_assignable_in_firm
+from app.services.hearing_dates import recompute_next_hearing
 from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, CalendarItemOut
 
 
@@ -26,6 +28,15 @@ class CalendarReferenceNotFound(Exception):
         self.detail = detail
 
 
+CLOSED_CASE_HEARING = "Kapalı davaya duruşma eklenemez."
+
+
+class ClosedCaseHearing(Exception):
+    """A hearing may not be added to (or moved onto) a closed case."""
+
+    detail = CLOSED_CASE_HEARING
+
+
 class CalendarService:
     def __init__(self, db: Session):
         self.db = db
@@ -36,6 +47,8 @@ class CalendarService:
         self, law_firm_id: str, created_by: str, payload: CalendarEventCreate, today: date
     ) -> CalendarEvent:
         case = self._check_references(law_firm_id, payload.case_id, payload.assignee_id)
+        if case is not None and payload.event_type == CalendarEventType.HEARING:
+            require_case_open_for_hearing(case)
         reminder_days = (
             payload.reminder_days
             if payload.reminder_days is not None
@@ -56,7 +69,8 @@ class CalendarService:
             reminder_days=reminder_days,
         )
         self.db.add(event)
-        _sync_next_hearing(event, case, today)
+        if case is not None and event.event_type == CalendarEventType.HEARING:
+            recompute_next_hearing(self.db, case, today)
         self.db.commit()
         self.db.refresh(event)
         return event
@@ -74,31 +88,41 @@ class CalendarService:
         # deactivated since can still be edited.
         new_assignee = updates.get("assignee_id") if updates.get("assignee_id") != event.assignee_id else None
         self._check_references(event.law_firm_id, updates.get("case_id"), new_assignee)
-        old_hearing = _hearing_anchor(event)
+        new_type = updates.get("event_type", event.event_type)
+        new_case_id = updates["case_id"] if "case_id" in updates else event.case_id
+        held_hearing_of = event.case_id if event.event_type == CalendarEventType.HEARING else None
+        becomes_hearing_of = new_case_id if new_type == CalendarEventType.HEARING else None
+        if becomes_hearing_of is not None and becomes_hearing_of != held_hearing_of:
+            # A new hearing for this case (new link or new type): the case must still be open.
+            target = self._case_in_firm(becomes_hearing_of, event.law_firm_id)
+            if target is not None:
+                require_case_open_for_hearing(target)
         for field, value in updates.items():
             setattr(event, field, value)
         event.starts_at = _normalize_start(event.starts_at, event.all_day)
-        if old_hearing is not None:
-            self._release_hearing_day(event, *old_hearing, today)
-        case = self._case_in_firm(event.case_id, event.law_firm_id) if event.case_id else None
-        _sync_next_hearing(event, case, today)
+        # Both the case the hearing leaves and the one it now belongs to need a new cache value.
+        affected = {held_hearing_of, becomes_hearing_of} - {None}
+        for case_id in sorted(affected):
+            case = self._case_in_firm(case_id, event.law_firm_id)
+            if case is not None:
+                recompute_next_hearing(self.db, case, today)
         self.db.commit()
         self.db.refresh(event)
         return event
 
     def delete_event(self, event: CalendarEvent, today: date) -> None:
-        old_hearing = _hearing_anchor(event)
-        if old_hearing is not None:
-            self._release_hearing_day(event, *old_hearing, today)
+        held_hearing_of = event.case_id if event.event_type == CalendarEventType.HEARING else None
         self.db.delete(event)
+        if held_hearing_of is not None:
+            case = self._case_in_firm(held_hearing_of, event.law_firm_id)
+            if case is not None:
+                recompute_next_hearing(self.db, case, today)
         self.db.commit()
 
     # ----- calendar list -----
 
     def list_items(self, law_firm_id: str, start: date, end: date) -> list[CalendarItemOut]:
-        """Events, pending task due dates and case hearings with a date in
-        [start, end]. A case hearing is hidden when a hearing event of the
-        same case exists on the same day."""
+        """Events (hearings included) and pending task due dates with a date in [start, end]."""
         events = (
             self.db.query(CalendarEvent, Case.case_name, Case.is_archived)
             .outerjoin(Case, CalendarEvent.case_id == Case.id)
@@ -121,39 +145,16 @@ class CalendarService:
             )
             .all()
         )
-        cases = (
-            self.db.query(Case)
-            .filter(
-                Case.law_firm_id == law_firm_id,
-                Case.is_precedent.is_(False),
-                case_is_active(),
-                Case.next_hearing_date >= start,
-                Case.next_hearing_date <= end,
-            )
-            .all()
-        )
-
-        hearing_event_days = {
-            (event.case_id, event.starts_at.date())
-            for event, _, _ in events
-            if event.event_type == CalendarEventType.HEARING and event.case_id
-        }
         names = self._user_names(
             law_firm_id,
             {event.assignee_id for event, _, _ in events}
-            | {task.assigned_to for task, _ in tasks}
-            | {case.assigned_lawyer_id for case in cases},
+            | {task.assigned_to for task, _ in tasks},
         )
 
         # An event of an archived case is read-only (its writes answer 409);
         # task items are never editable here.
         items = [_event_item(event, case_name, names, not archived) for event, case_name, archived in events]
         items += [_task_item(task, case_name, names) for task, case_name in tasks]
-        items += [
-            _hearing_item(case, names)
-            for case in cases
-            if (case.id, case.next_hearing_date) not in hearing_event_days
-        ]
         items.sort(key=lambda item: (item.date, item.start is not None, item.start or datetime.min, item.title))
         return items
 
@@ -166,33 +167,10 @@ class CalendarService:
 
     # ----- helpers -----
 
-    def _release_hearing_day(self, event: CalendarEvent, case_id: str, day: date, today: date) -> None:
-        """The event no longer holds `day` for `case_id` (moved, retyped,
-        re-linked or deleted). If the case's next_hearing_date was that day,
-        recompute it from the case's other upcoming hearing events."""
-        case = self._case_in_firm(case_id, event.law_firm_id)
-        if case is None or case.next_hearing_date != day:
-            return
-        earliest = (
-            self.db.query(CalendarEvent.starts_at)
-            .filter(
-                CalendarEvent.law_firm_id == event.law_firm_id,
-                CalendarEvent.case_id == case_id,
-                CalendarEvent.event_type == CalendarEventType.HEARING,
-                CalendarEvent.id != event.id,
-                CalendarEvent.starts_at >= datetime.combine(today, time.min),
-            )
-            .order_by(CalendarEvent.starts_at)
-            .first()
-        )
-        case.next_hearing_date = earliest[0].date() if earliest else None
-
     def _case_in_firm(self, case_id: str, law_firm_id: str) -> Optional[Case]:
-        return (
-            self.db.query(Case)
-            .filter(Case.id == case_id, Case.law_firm_id == law_firm_id, Case.is_precedent.is_(False))
-            .first()
-        )
+        """Row-locked (a no-op on SQLite): the closed check and the cache recompute that follow
+        must not interleave with closing the case or another hearing change."""
+        return CaseRepository(self.db).get_by_id_in_firm_for_update(case_id, law_firm_id)
 
     def _check_references(
         self, law_firm_id: str, case_id: Optional[str], assignee_id: Optional[str]
@@ -229,6 +207,7 @@ def _event_item(
         location=event.location,
         notes=event.notes,
         reminder_days=list(event.reminder_days or []),
+        result_note=event.result_note,
         editable=editable,
     )
 
@@ -252,24 +231,6 @@ def _task_item(task: Task, case_name: str, names: dict[str, str]) -> CalendarIte
     )
 
 
-def _hearing_item(case: Case, names: dict[str, str]) -> CalendarItemOut:
-    return CalendarItemOut(
-        id=f"hearing:{case.id}",
-        kind="case_hearing",
-        event_type="hearing",
-        title=f"Duruşma - {case.case_name}",
-        date=case.next_hearing_date,
-        all_day=True,
-        case_id=case.id,
-        case_name=case.case_name,
-        assignee_id=case.assigned_lawyer_id,
-        assignee_name=names.get(case.assigned_lawyer_id) if case.assigned_lawyer_id else None,
-        location=case.court,
-        reminder_days=list(HEARING_REMINDER_DAYS),
-        editable=False,
-    )
-
-
 def _normalize_start(starts_at: datetime, all_day: bool) -> datetime:
     local = to_local_naive(starts_at).replace(second=0, microsecond=0)
     if all_day:
@@ -277,20 +238,6 @@ def _normalize_start(starts_at: datetime, all_day: bool) -> datetime:
     return local
 
 
-def _sync_next_hearing(event: CalendarEvent, case: Optional[Case], today: date) -> None:
-    """A hearing event on or after today pulls the case's next_hearing_date
-    earlier (or sets it when empty); it never pushes it later."""
-    if case is None or event.event_type != CalendarEventType.HEARING:
-        return
-    day = event.starts_at.date()
-    if day < today:
-        return
-    if case.next_hearing_date is None or case.next_hearing_date > day:
-        case.next_hearing_date = day
-
-
-def _hearing_anchor(event: CalendarEvent) -> Optional[tuple[str, date]]:
-    """(case_id, day) the event currently pins as a case hearing, if any."""
-    if event.event_type != CalendarEventType.HEARING or not event.case_id:
-        return None
-    return event.case_id, event.starts_at.date()
+def require_case_open_for_hearing(case: Case) -> None:
+    if case.status == CaseStatus.KAPALI:
+        raise ClosedCaseHearing()
```

Modify `backend/app/services/case_lifecycle.py`:

```diff
--- a/backend/app/services/case_lifecycle.py
+++ b/backend/app/services/case_lifecycle.py
@@ -43,7 +43,10 @@ class CaseLifecycleService:
 
     @staticmethod
     def ensure_patch_allowed(case: Case, payload: CaseUpdate) -> None:
-        """PATCH edits the case; it neither closes nor reopens it and never sets the outcome."""
+        """PATCH edits the case; it neither closes nor reopens it, never sets the outcome
+        and never writes the hearing date (hearings are calendar events)."""
+        if "next_hearing_date" in payload.model_fields_set:
+            raise CaseStateError(422, "Duruşma tarihi Duruşmalar bölümünden eklenir.")
         if payload.status == CaseStatus.KAPALI:
             raise CaseStateError(422, "Davayı kapatmak için 'Davayı kapat' işlemini kullanın.")
         if "outcome" in payload.model_fields_set:
```

Modify `backend/app/services/case_service.py`:

```diff
--- a/backend/app/services/case_service.py
+++ b/backend/app/services/case_service.py
@@ -1,3 +1,4 @@
+from datetime import date
 from typing import Optional
 
 from sqlalchemy.exc import IntegrityError
@@ -16,6 +17,7 @@ from app.services.case_parties import (
     party_models,
     require_client,
 )
+from app.services.hearing_dates import add_all_day_hearing, recompute_next_hearing
 
 
 class DuplicateCaseNumberError(Exception):
@@ -40,11 +42,16 @@ class CaseService:
         require_client(data)
         return data
 
-    def create_case(self, law_firm_id: str, payload: CaseCreate) -> Case:
+    def create_case(self, law_firm_id: str, payload: CaseCreate, created_by: str, today: date) -> Case:
         """With `parties` the legacy client_name / opposing_party / client_role
         are derived from them; without (old clients) the parties are built from
-        client_name / opposing_party."""
+        client_name / opposing_party.
+
+        A next_hearing_date becomes an all-day hearing event of the new case in the
+        same transaction (a past date too: it is history); next_hearing_date itself
+        is then computed from the events like everywhere else."""
         fields = payload.model_dump(exclude_unset=True, exclude={"parties", "client_role"})
+        hearing_day = fields.pop("next_hearing_date", None)
         client_role = payload.client_role.value if payload.client_role else None
         if payload.parties is not None:
             parties = self._party_data(payload.parties)
@@ -56,12 +63,19 @@ class CaseService:
         case = Case(law_firm_id=law_firm_id, client_role=client_role, **fields)
         case.parties = party_models(parties, law_firm_id)
         try:
-            return self.cases.create(case)
+            self.db.add(case)
+            self.db.flush()
         except IntegrityError as exc:
             self.db.rollback()
             raise DuplicateCaseNumberError(
                 f"Case number '{payload.case_number}' already exists for this firm."
             ) from exc
+        if hearing_day is not None:
+            add_all_day_hearing(self.db, case, hearing_day, created_by)
+            recompute_next_hearing(self.db, case, today)
+        self.db.commit()
+        self.db.refresh(case)
+        return case
 
     def get_case(self, case_id: str, law_firm_id: str) -> Optional[Case]:
         return self.cases.get_by_id_in_firm(case_id, law_firm_id)
```

Create `backend/app/services/hearing_dates.py`:

```python
"""Hearing dates: one source of truth.

A hearing is a calendar event of type "hearing" linked to a case.
cases.next_hearing_date is only a cache of the date of the earliest such event
that is today or later (a hearing that is today still counts all day, whatever
its time: the rule is about dates, in APP_TIMEZONE, like the rest of the
calendar). Nothing writes the column except the functions of this module and
the nightly job that calls recompute_open_cases.

None of these functions commits; the caller owns the transaction.
"""
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.domain.calendar import HEARING_REMINDER_DAYS
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, case_is_active


def _hearing_filter(today: date):
    return (
        CalendarEvent.event_type == CalendarEventType.HEARING,
        CalendarEvent.case_id.isnot(None),
        CalendarEvent.starts_at >= datetime.combine(today, time.min),
    )


def recompute_next_hearing(db: Session, case: Case, today: date) -> None:
    """Set case.next_hearing_date from the case's hearing events (call after the event change)."""
    db.flush()  # sessions here do not autoflush, and the query must see the pending event
    earliest = (
        db.query(func.min(CalendarEvent.starts_at))
        .filter(
            CalendarEvent.law_firm_id == case.law_firm_id,
            CalendarEvent.case_id == case.id,
            *_hearing_filter(today),
        )
        .scalar()
    )
    case.next_hearing_date = _as_date(earliest)


def recompute_open_cases(db: Session, today: date) -> int:
    """The nightly pass: recompute every case that is neither closed, archived nor a
    precedent (a closed or archived case keeps its stored value, see case_is_active).
    Commits; returns how many cases changed."""
    earliest = {
        case_id: _as_date(first)
        for case_id, first in db.query(CalendarEvent.case_id, func.min(CalendarEvent.starts_at))
        .filter(*_hearing_filter(today))
        .group_by(CalendarEvent.case_id)
        .all()
    }
    changed = 0
    for case in db.query(Case).filter(case_is_active(), Case.is_precedent.is_(False)).all():
        wanted = earliest.get(case.id)
        if case.next_hearing_date != wanted:
            case.next_hearing_date = wanted
            changed += 1
    db.commit()
    return changed


def add_all_day_hearing(db: Session, case: Case, day: date, created_by: str) -> CalendarEvent:
    """An all-day "Duruşma" for the case, assigned to its responsible lawyer, with the default hearing reminders."""
    event = CalendarEvent(
        law_firm_id=case.law_firm_id,
        title="Duruşma",
        event_type=CalendarEventType.HEARING,
        starts_at=datetime.combine(day, time.min),
        all_day=True,
        duration_minutes=60,
        case_id=case.id,
        assignee_id=case.assigned_lawyer_id,
        created_by=created_by,
        reminder_days=list(HEARING_REMINDER_DAYS),
    )
    db.add(event)
    return event


def _as_date(value: Optional[datetime]) -> Optional[date]:
    if value is None:
        return None
    # SQLite returns the min() of a DateTime column as text.
    return value.date() if isinstance(value, datetime) else datetime.fromisoformat(str(value)).date()
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/api/test_calendar.py tests/api/test_calendar_events.py tests/api/test_case_handover.py tests/api/test_case_update_rules.py tests/api/test_cases.py tests/unit/test_hearing_dates.py
```

Expected: PASS —

```text
112 passed
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/api tests/unit
```

Expected: PASS — no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/calendar.py backend/app/api/routes/cases.py backend/app/repositories/case_repository.py backend/app/schemas/calendar.py backend/app/services/calendar_service.py backend/app/services/case_lifecycle.py backend/app/services/case_service.py backend/app/services/hearing_dates.py backend/tests/api/test_calendar.py backend/tests/api/test_calendar_events.py backend/tests/api/test_case_handover.py backend/tests/api/test_case_update_rules.py backend/tests/api/test_cases.py backend/tests/unit/test_hearing_dates.py
git commit -F - <<'EOF'
feat: hearings are calendar events; next_hearing_date is computed from them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 3: Importer and seed turn hearing dates into events

`import_cases` and the demo seed no longer write `next_hearing_date` directly: they create the all-day hearing event (once per case and day) and recompute the cache. Precedents keep the plain date. `purge` deletes the calendar events first.

**Files:**
- Modify: `backend/app/db/import_cases.py`
- Modify: `backend/app/db/purge.py`
- Modify: `backend/app/db/seed.py`
- Modify: `backend/app/services/hearing_dates.py`
- Test (modify): `backend/tests/integration/test_seed.py`
- Test (modify): `backend/tests/integration/test_seed_real_data_mode.py`
- Test (modify): `backend/tests/unit/test_import_cases.py`

**Interfaces:**
- Consumes: Task 2's `add_all_day_hearing`, `recompute_next_hearing`.
- Produces: `hearing_dates.ensure_all_day_hearing(db, case, day, created_by) -> CalendarEvent | None` (None when the case already has a hearing event that day, at any time).

- [ ] **Step 1: Write the failing tests**

The importer test imports the same file twice and over an existing hearing event, and checks that precedents keep the plain date.

Modify `backend/tests/integration/test_seed.py`:

```diff
--- a/backend/tests/integration/test_seed.py
+++ b/backend/tests/integration/test_seed.py
@@ -14,6 +14,7 @@ from app.db.seed import (
     seed,
 )
 from app.db.demo_case_detail_seed import CASE_EVIDENCE
+from app.models.calendar import CalendarEvent
 from app.models.case import Case, CaseEvent, CaseParty
 from app.models.courtroom import CourtroomActor, CourtroomSession
 from app.models.document import Document
@@ -82,6 +83,28 @@ def test_seed_is_idempotent(db_session, monkeypatch, tmp_path):
     assert db_session.query(Document).count() == len(DEMO_DOCUMENTS) + len(TICARI_KIRA_DOCUMENTS) + 2 * len(CASE_EVIDENCE)
     assert db_session.query(CaseEvent).count() == len(DEMO_EVENTS) + len(TICARI_KIRA_EVENTS) + 3 * len(CASE_EVIDENCE)
     assert db_session.query(CourtroomSession).filter_by(prompt_version="showcase-v1").count() == 24
+    assert db_session.query(CalendarEvent).count() == db_session.query(Case).filter(Case.next_hearing_date.isnot(None)).count()
+
+
+def test_seed_turns_every_demo_hearing_date_into_a_calendar_hearing(db_session, monkeypatch, tmp_path):
+    from datetime import datetime
+
+    import app.db.seed as seed_module
+    from app.models.calendar import CalendarEvent, CalendarEventType
+
+    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
+    monkeypatch.setattr(seed_module, "upgrade_to_head", lambda engine: None)
+    monkeypatch.setattr(seed_module.settings, "storage_dir", str(tmp_path))
+
+    seed()
+
+    dated = db_session.query(Case).filter(Case.next_hearing_date.isnot(None)).all()
+    assert len(dated) == 12
+    for case in dated:
+        [event] = db_session.query(CalendarEvent).filter_by(case_id=case.id).all()
+        assert event.event_type == CalendarEventType.HEARING
+        assert (event.all_day, event.starts_at) == (True, datetime.combine(case.next_hearing_date, datetime.min.time()))
+        assert event.assignee_id == case.assigned_lawyer_id == event.created_by
 
 
 def test_seed_gives_every_demo_case_its_client_and_opposing_party(db_session, monkeypatch, tmp_path):
```

Modify `backend/tests/integration/test_seed_real_data_mode.py`:

```diff
--- a/backend/tests/integration/test_seed_real_data_mode.py
+++ b/backend/tests/integration/test_seed_real_data_mode.py
@@ -5,6 +5,7 @@ import pytest
 from app.core.config import settings
 from app.core.security import hash_password
 from app.db import seed as seed_module
+from app.models.calendar import CalendarEvent
 from app.models.case import Case, CaseType
 from app.models.courtroom import CourtroomSession
 from app.models.law_firm import LawFirm
@@ -45,6 +46,7 @@ def test_real_data_mode_removes_an_earlier_demo_completely(run_seed, db_session)
     assert db_session.query(LawFirm).count() == 0
     assert db_session.query(User).count() == 0
     assert db_session.query(Case).count() == 0
+    assert db_session.query(CalendarEvent).count() == 0  # the demo hearings go with their cases
     assert db_session.query(CourtroomSession).count() == 0
     run_seed(False)  # idempotent
 
```

Modify `backend/tests/unit/test_import_cases.py`:

```diff
--- a/backend/tests/unit/test_import_cases.py
+++ b/backend/tests/unit/test_import_cases.py
@@ -233,3 +233,83 @@ def test_reimport_after_only_a_client_role_patch_keeps_the_opposing_party(db_ses
     db_session.refresh(case)
     assert case.client_name == "Davacı (anonim)"
     assert case.opposing_party == "Davalı Şirket"
+
+
+# --- next_hearing_date is a hearing event ---------------------------------------------------
+
+def _hearings(db):
+    from app.models.calendar import CalendarEvent, CalendarEventType
+
+    return db.query(CalendarEvent).filter(CalendarEvent.event_type == CalendarEventType.HEARING).order_by(CalendarEvent.starts_at).all()
+
+
+def test_next_hearing_date_becomes_an_all_day_hearing_event(db_session, seeded, tmp_path):
+    from datetime import datetime, timedelta
+
+    from app.core.timeutil import local_today
+
+    day = local_today() + timedelta(days=12)
+    _write(tmp_path, [{**CASE, "status": "devam_eden", "outcome": "ongoing", "next_hearing_date": day.isoformat(), "documents": []}])
+
+    import_folder(str(tmp_path), db=db_session)
+
+    case = db_session.query(Case).one()
+    [event] = _hearings(db_session)
+    assert case.next_hearing_date == day
+    assert (event.case_id, event.title, event.all_day, event.starts_at) == (case.id, "Duruşma", True, datetime.combine(day, datetime.min.time()))
+    assert (event.assignee_id, event.created_by, event.law_firm_id) == (case.assigned_lawyer_id, case.assigned_lawyer_id, case.law_firm_id)
+    assert event.reminder_days == [3, 1]
+
+
+def test_reimport_never_adds_a_second_hearing_on_the_same_day(db_session, seeded, tmp_path):
+    from datetime import datetime, timedelta
+
+    from app.core.timeutil import local_today
+    from app.models.calendar import CalendarEvent, CalendarEventType
+
+    day = local_today() + timedelta(days=12)
+    item = {**CASE, "status": "devam_eden", "outcome": "ongoing", "next_hearing_date": day.isoformat(), "documents": []}
+    _write(tmp_path, [item])
+    import_folder(str(tmp_path), db=db_session)
+    import_folder(str(tmp_path), db=db_session)
+    assert len(_hearings(db_session)) == 1
+
+    # A timed hearing the lawyer set up in the calendar counts as the hearing of that day.
+    case = db_session.query(Case).one()
+    other_day = day + timedelta(days=3)
+    db_session.add(CalendarEvent(law_firm_id=case.law_firm_id, title="Duruşma", event_type=CalendarEventType.HEARING,
+                                 starts_at=datetime.combine(other_day, datetime.min.time()).replace(hour=14), all_day=False,
+                                 duration_minutes=60, case_id=case.id, created_by=case.assigned_lawyer_id, reminder_days=[]))
+    db_session.commit()
+    _write(tmp_path, [{**item, "next_hearing_date": other_day.isoformat()}])
+    import_folder(str(tmp_path), db=db_session)
+
+    assert len(_hearings(db_session)) == 2
+    db_session.refresh(case)
+    assert case.next_hearing_date == day  # the earliest upcoming one, not the last imported
+
+
+def test_a_past_hearing_date_stays_as_history_and_a_reimport_without_one_keeps_the_events(db_session, seeded, tmp_path):
+    from datetime import timedelta
+
+    from app.core.timeutil import local_today
+
+    past = local_today() - timedelta(days=3)
+    item = {**CASE, "next_hearing_date": past.isoformat(), "documents": []}
+    _write(tmp_path, [item])
+    import_folder(str(tmp_path), db=db_session)
+    case = db_session.query(Case).one()
+    assert case.next_hearing_date is None and len(_hearings(db_session)) == 1
+
+    _write(tmp_path, [{key: value for key, value in item.items() if key != "next_hearing_date"}])
+    import_folder(str(tmp_path), db=db_session)
+
+    assert len(_hearings(db_session)) == 1
+
+
+def test_precedent_hearing_dates_are_not_turned_into_events(db_session, seeded, tmp_path):
+    _write(tmp_path, [{**CASE, "next_hearing_date": "2099-01-05", "documents": []}], record_kind="precedent")
+
+    import_folder(str(tmp_path), db=db_session)
+
+    assert _hearings(db_session) == []
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/integration/test_seed.py tests/integration/test_seed_real_data_mode.py tests/unit/test_import_cases.py
```

Expected: FAIL —

```text
FAILED tests/integration/test_seed.py::test_seed_is_idempotent - assert 0 == 12
FAILED tests/integration/test_seed.py::test_seed_turns_every_demo_hearing_date_into_a_calendar_hearing
FAILED tests/unit/test_import_cases.py::test_next_hearing_date_becomes_an_all_day_hearing_event
FAILED tests/unit/test_import_cases.py::test_reimport_never_adds_a_second_hearing_on_the_same_day
FAILED tests/unit/test_import_cases.py::test_a_past_hearing_date_stays_as_history_and_a_reimport_without_one_keeps_the_events
5 failed, 24 passed
```

- [ ] **Step 3: Implement**


Modify `backend/app/db/import_cases.py`:

```diff
--- a/backend/app/db/import_cases.py
+++ b/backend/app/db/import_cases.py
@@ -8,7 +8,8 @@ Folder layout:
     documents/            files referenced by cases[].documents[].file
 
 Each case: case_number, case_name, client_name, case_type are required;
-opposing_party, court, opening_date, next_hearing_date (YYYY-MM-DD),
+opposing_party, court, opening_date, next_hearing_date (YYYY-MM-DD; becomes
+an all-day hearing event of the case unless it already has one that day),
 status, outcome, case_value, description, events[], tasks[], documents[]
 are optional. A document is {"file": "x.pdf"} (pdf/docx/txt in
 documents/) or {"filename": "x.txt", "text": "..."}.
@@ -28,6 +29,7 @@ from typing import Optional
 from sqlalchemy import func
 
 from app.core.config import settings
+from app.core.timeutil import local_today
 from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
 from app.db.session import SessionLocal
 import app.models  # noqa: F401
@@ -44,6 +46,7 @@ from app.services.case_parties import (
     legacy_parties,
     party_models,
 )
+from app.services.hearing_dates import ensure_all_day_hearing, recompute_next_hearing
 from app.services.text_extraction import extract_text
 
 _EXT = {".pdf": DocumentType.PDF, ".docx": DocumentType.DOCX, ".txt": DocumentType.TXT}
@@ -128,7 +131,16 @@ def _import_case(db, firm: LawFirm, lawyer: User, item: dict, docs_dir: str, is_
     case.outcome = _enum(CaseOutcome, item.get("outcome"), CaseOutcome.ONGOING)
     if item.get("opening_date"):
         case.opening_date = _date(item["opening_date"])
-    case.next_hearing_date = _date(item.get("next_hearing_date"))
+    hearing_day = _date(item.get("next_hearing_date"))
+    if is_precedent:
+        # Precedents are not on the calendar: the date stays a plain value.
+        case.next_hearing_date = hearing_day
+    else:
+        # A hearing is a calendar event; a re-import never adds a second one on the same day.
+        db.flush()
+        if hearing_day is not None:
+            ensure_all_day_hearing(db, case, hearing_day, lawyer.id)
+        recompute_next_hearing(db, case, local_today())
     db.flush()
 
     for ev in item.get("events", []):
```

Modify `backend/app/db/purge.py`:

```diff
--- a/backend/app/db/purge.py
+++ b/backend/app/db/purge.py
@@ -1,6 +1,7 @@
 """Delete cases together with everything that references them."""
 import os
 
+from app.models.calendar import CalendarEvent
 from app.models.case import Case, CaseEvent, CaseParty
 from app.models.document import Document
 from app.models.simulation import AIAnalysis, Simulation
@@ -18,7 +19,8 @@ def delete_cases(db, cases: list[Case]) -> int:
                 os.remove(path)
             except OSError:
                 pass
-    for model in (AIAnalysis, Simulation, Task, Document, CaseEvent, CaseParty):
+    # Calendar events (hearings) point at the case and, through result_case_event_id, at its timeline.
+    for model in (CalendarEvent, AIAnalysis, Simulation, Task, Document, CaseEvent, CaseParty):
         db.query(model).filter(model.case_id.in_(ids)).delete(synchronize_session=False)
     db.query(Case).filter(Case.id.in_(ids)).delete(synchronize_session=False)
     db.flush()
```

Modify `backend/app/db/seed.py`:

```diff
--- a/backend/app/db/seed.py
+++ b/backend/app/db/seed.py
@@ -20,12 +20,14 @@ from app.models.law_firm import LawFirm
 from app.models.task import Task, TaskStatus
 from app.models.user import User, UserRole
 from app.core.config import settings
+from app.core.timeutil import local_today
 from app.db.courtroom_seed import seed_courtroom_scenarios
 from app.db.courtroom_showcase_seed import seed_courtroom_showcases
 from app.db.demo_cleanup import remove_demo_data
 from app.db.demo_case_detail_seed import CASE_EVIDENCE
 from app.db.purge import delete_cases
 from app.services.case_parties import legacy_parties, party_models
+from app.services.hearing_dates import ensure_all_day_hearing, recompute_next_hearing
 
 DEMO_FIRM_NAME = "Demo Hukuk Bürosu"
 ADMIN_EMAIL = "admin@demo.casebridge.dev"
@@ -84,6 +86,10 @@ def _get_or_create_case(db, firm: LawFirm, lawyer: User, **kwargs) -> Case:
     demo_case.parties = party_models(legacy_parties(kwargs["client_name"], kwargs.get("opposing_party")), firm.id)
     db.add(demo_case)
     db.flush()
+    if kwargs.get("next_hearing_date") is not None:
+        # The hearing date lives in the calendar: an all-day hearing event for the demo lawyer.
+        ensure_all_day_hearing(db, demo_case, kwargs["next_hearing_date"], lawyer.id)
+        recompute_next_hearing(db, demo_case, local_today())
     return demo_case
 
 
```

Modify `backend/app/services/hearing_dates.py`:

```diff
--- a/backend/app/services/hearing_dates.py
+++ b/backend/app/services/hearing_dates.py
@@ -9,7 +9,7 @@ the nightly job that calls recompute_open_cases.
 
 None of these functions commits; the caller owns the transaction.
 """
-from datetime import date, datetime, time
+from datetime import date, datetime, time, timedelta
 from typing import Optional
 
 from sqlalchemy import func
@@ -82,6 +82,26 @@ def add_all_day_hearing(db: Session, case: Case, day: date, created_by: str) ->
     return event
 
 
+def ensure_all_day_hearing(db: Session, case: Case, day: date, created_by: str) -> Optional[CalendarEvent]:
+    """add_all_day_hearing unless the case already has a hearing event on `day` (any time);
+    returns the new event, or None when there was one. For the importer and the seed."""
+    db.flush()
+    taken = (
+        db.query(CalendarEvent.id)
+        .filter(
+            CalendarEvent.law_firm_id == case.law_firm_id,
+            CalendarEvent.case_id == case.id,
+            CalendarEvent.event_type == CalendarEventType.HEARING,
+            CalendarEvent.starts_at >= datetime.combine(day, time.min),
+            CalendarEvent.starts_at < datetime.combine(day + timedelta(days=1), time.min),
+        )
+        .first()
+    )
+    if taken is not None:
+        return None
+    return add_all_day_hearing(db, case, day, created_by)
+
+
 def _as_date(value: Optional[datetime]) -> Optional[date]:
     if value is None:
         return None
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/integration/test_seed.py tests/integration/test_seed_real_data_mode.py tests/unit/test_import_cases.py
```

Expected: PASS —

```text
29 passed
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/integration tests/unit
```

Expected: PASS — no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/import_cases.py backend/app/db/purge.py backend/app/db/seed.py backend/app/services/hearing_dates.py backend/tests/integration/test_seed.py backend/tests/integration/test_seed_real_data_mode.py backend/tests/unit/test_import_cases.py
git commit -F - <<'EOF'
feat: importer and seed turn hearing dates into calendar events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 4: Hearing reminders come from hearing events only

The per-case "case hearing" reminder candidates are removed (the same hearings are ordinary event candidates now, with the same default `[3, 1]` days). Hearing events of closed cases stay silent, as the old rule was. `ReminderSourceType.CASE_HEARING` stays in the enum for old ledger rows.

**Files:**
- Modify: `backend/app/services/reminder_service.py`
- Test (modify): `backend/tests/unit/test_reminder_service.py`

**Interfaces:**
- Consumes: Task 2 (hearing events are real), Task 1's copied delivery rows.
- Produces: nothing new; `ReminderService` has no `_hearing_candidates`.

- [ ] **Step 1: Write the failing tests**


Modify `backend/tests/unit/test_reminder_service.py`:

```diff
--- a/backend/tests/unit/test_reminder_service.py
+++ b/backend/tests/unit/test_reminder_service.py
@@ -168,31 +168,37 @@ def test_unassigned_task_reminds_its_creator(world):
     assert due.recipient_id == world["creator"].id
 
 
-def test_case_hearing_reminds_the_assigned_lawyer_three_days_before(world):
-    world["case"].next_hearing_date = date(2026, 10, 5)
-    world["db"].commit()
+def test_a_hearing_event_reminds_the_assigned_lawyer_three_days_before(world):
+    from app.models.calendar import CalendarEventType
+
+    event = add_event(world, datetime(2026, 10, 5, 0, 0), [3, 1], event_type=CalendarEventType.HEARING, title="Duruşma",
+                      all_day=True, case_id=world["case"].id, assignee_id=world["lawyer"].id)
 
     [due] = ReminderService(world["db"]).collect_due(NOW)
 
-    assert (due.source_type.value, due.source_id, due.days_before) == ("case_hearing", world["case"].id, (3,))
-    assert (due.type_label, due.title, due.location) == ("Duruşma", "Ticari Kira Uyarlama Davası", "İstanbul 3. Asliye Ticaret")
+    assert (due.source_type.value, due.source_id, due.days_before) == ("event", event.id, (3,))
+    assert (due.type_label, due.title, due.case_name) == ("Duruşma", "Duruşma", "Ticari Kira Uyarlama Davası")
     assert due.recipient_id == world["lawyer"].id
 
 
-def test_case_hearing_without_lawyer_or_archived_is_skipped(world):
+def test_a_next_hearing_date_without_a_hearing_event_sends_nothing(world):
+    """The date is only a cache of the events; the old per-case reminder is gone."""
     world["case"].next_hearing_date = date(2026, 10, 5)
-    world["case"].assigned_lawyer_id = None
     world["db"].commit()
     assert ReminderService(world["db"]).collect_due(NOW) == []
 
-    world["case"].assigned_lawyer_id = world["lawyer"].id
+
+def test_a_hearing_of_an_archived_case_is_skipped(world):
+    from app.models.calendar import CalendarEventType
+
+    add_event(world, datetime(2026, 10, 5, 0, 0), [3, 1], event_type=CalendarEventType.HEARING, all_day=True,
+              case_id=world["case"].id, assignee_id=world["lawyer"].id)
     world["case"].is_archived = True
     world["db"].commit()
     assert ReminderService(world["db"]).collect_due(NOW) == []
 
 
-def test_precedent_case_hearings_and_tasks_are_skipped(world):
-    world["case"].next_hearing_date = date(2026, 10, 5)
+def test_precedent_case_tasks_are_skipped(world):
     world["case"].is_precedent = True
     world["db"].commit()
     add_task(world, date(2026, 10, 3))
@@ -200,17 +206,15 @@ def test_precedent_case_hearings_and_tasks_are_skipped(world):
     assert ReminderService(world["db"]).collect_due(NOW) == []
 
 
-def test_case_hearing_is_skipped_when_a_hearing_event_exists_that_day(world):
+def test_two_hearings_of_one_case_on_one_day_each_get_a_reminder(world):
     from app.models.calendar import CalendarEventType
 
-    world["case"].next_hearing_date = date(2026, 10, 5)
-    world["db"].commit()
-    event = add_event(world, datetime(2026, 10, 5, 10, 0), [3, 1], event_type=CalendarEventType.HEARING,
-                      title="Duruşma", case_id=world["case"].id, assignee_id=world["lawyer"].id)
-
-    [due] = ReminderService(world["db"]).collect_due(NOW)
+    add_event(world, datetime(2026, 10, 5, 0, 0), [3], event_type=CalendarEventType.HEARING, all_day=True,
+              case_id=world["case"].id, assignee_id=world["lawyer"].id)
+    add_event(world, datetime(2026, 10, 5, 14, 0), [3], event_type=CalendarEventType.HEARING,
+              case_id=world["case"].id, assignee_id=world["lawyer"].id)
 
-    assert (due.source_type.value, due.source_id, due.type_label) == ("event", event.id, "Duruşma")
+    assert len(ReminderService(world["db"]).collect_due(NOW)) == 2
 
 
 def test_sources_of_every_firm_are_collected_but_recipients_must_match_the_firm(world):
@@ -423,14 +427,19 @@ def test_moving_a_hearing_event_later_sends_no_reminder_for_the_old_day(world):
 # ----- closed and archived cases (final review) -----
 
 
-def test_a_closed_case_sends_no_hearing_reminder(world):
+def test_a_closed_case_sends_no_hearing_reminder_but_its_other_events_still_do(world):
+    from app.models.calendar import CalendarEventType
     from app.models.case import CaseStatus
 
-    world["case"].next_hearing_date = date(2026, 10, 5)
+    add_event(world, datetime(2026, 10, 5, 0, 0), [3], event_type=CalendarEventType.HEARING, all_day=True,
+              case_id=world["case"].id, assignee_id=world["lawyer"].id)
+    meeting = add_event(world, datetime(2026, 10, 3, 10, 0), [1], case_id=world["case"].id, assignee_id=world["lawyer"].id)
     world["case"].status = CaseStatus.KAPALI
     world["db"].commit()
 
-    assert ReminderService(world["db"]).collect_due(NOW) == []
+    [due] = ReminderService(world["db"]).collect_due(NOW)
+
+    assert (due.source_type.value, due.source_id) == ("event", meeting.id)
 
 
 def test_tasks_and_events_of_an_archived_case_send_no_reminder(world):
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/unit/test_reminder_service.py
```

Expected: FAIL —

```text
FAILED tests/unit/test_reminder_service.py::test_a_next_hearing_date_without_a_hearing_event_sends_nothing
FAILED tests/unit/test_reminder_service.py::test_a_closed_case_sends_no_hearing_reminder_but_its_other_events_still_do
2 failed, 33 passed
```

- [ ] **Step 3: Implement**


Modify `backend/app/services/reminder_service.py`:

```diff
--- a/backend/app/services/reminder_service.py
+++ b/backend/app/services/reminder_service.py
@@ -1,4 +1,4 @@
-"""E-mail reminders for calendar events, pending tasks and case hearings.
+"""E-mail reminders for calendar events (hearings included) and pending tasks.
 
 collect_due(now_local) decides what is due; send_due(now_local) sends it
 and records one ReminderDelivery per offset. `now_local` is a naive
@@ -20,10 +20,13 @@ Rules (occurrence day D, offset d in reminder_days, today = now_local.date()):
   - an offset already `sent` is skipped; a `failed` one is retried while
     attempts < REMINDER_MAX_ATTEMPTS;
   - recipient: event assignee, else its creator; task assignee, else its
-    creator; case hearing: the case's assigned lawyer. Inactive users and
-    users without an e-mail address are skipped;
+    creator. Inactive users and users without an e-mail address are skipped;
   - a closed or archived case sends no hearing reminder, and tasks and events
     of an archived case send none either.
+
+A hearing is a calendar event; the old per-case "case_hearing" reminder (built
+from cases.next_hearing_date) is gone, and ReminderSourceType.CASE_HEARING stays
+only so that ledger rows written by earlier versions remain readable.
 """
 import logging
 from dataclasses import dataclass
@@ -35,7 +38,7 @@ from sqlalchemy.exc import IntegrityError, SQLAlchemyError
 from sqlalchemy.orm import Session
 
 from app.core.config import settings
-from app.domain.calendar import HEARING_REMINDER_DAYS, MAX_REMINDER_DAYS, TYPE_LABELS, task_reminder_days
+from app.domain.calendar import MAX_REMINDER_DAYS, TYPE_LABELS, task_reminder_days
 from app.models.calendar import (
     CalendarEvent,
     CalendarEventType,
@@ -43,7 +46,7 @@ from app.models.calendar import (
     ReminderDeliveryStatus,
     ReminderSourceType,
 )
-from app.models.case import Case, case_is_active
+from app.models.case import Case, CaseStatus
 from app.models.task import Task, TaskStatus
 from app.models.user import User
 from app.services.email import EmailMessage, EmailSendError, send_email
@@ -116,7 +119,6 @@ class ReminderService:
         candidates = (
             self._event_candidates(today, last_day)
             + self._task_candidates(today, last_day)
-            + self._hearing_candidates(today, last_day)
         )
         users = self._users({c.recipient_id for c in candidates if c.recipient_id})
 
@@ -181,7 +183,14 @@ class ReminderService:
             self.db.query(CalendarEvent, Case.case_name)
             .outerjoin(Case, and_(CalendarEvent.case_id == Case.id, Case.law_firm_id == CalendarEvent.law_firm_id))
             .filter(
-                or_(Case.id.is_(None), Case.is_archived.is_(False)),  # no reminder for an archived case
+                or_(
+                    Case.id.is_(None),
+                    and_(
+                        Case.is_archived.is_(False),  # no reminder for an archived case
+                        # a closed case has no upcoming hearing: its hearing events send nothing
+                        or_(CalendarEvent.event_type != CalendarEventType.HEARING, Case.status != CaseStatus.KAPALI),
+                    ),
+                ),
                 CalendarEvent.starts_at >= datetime.combine(today, time.min),
                 CalendarEvent.starts_at < datetime.combine(last_day + timedelta(days=1), time.min),
             )
@@ -236,49 +245,6 @@ class ReminderService:
             for task, case_name in rows
         ]
 
-    def _hearing_candidates(self, today: date, last_day: date) -> list[_Candidate]:
-        hearing_event_days = {
-            (law_firm_id, case_id, starts_at.date())
-            for law_firm_id, case_id, starts_at in self.db.query(
-                CalendarEvent.law_firm_id, CalendarEvent.case_id, CalendarEvent.starts_at
-            )
-            .filter(
-                CalendarEvent.event_type == CalendarEventType.HEARING,
-                CalendarEvent.case_id.isnot(None),
-                CalendarEvent.starts_at >= datetime.combine(today, time.min),
-                CalendarEvent.starts_at < datetime.combine(last_day + timedelta(days=1), time.min),
-            )
-            .all()
-        }
-        cases = (
-            self.db.query(Case)
-            .filter(
-                case_is_active(),
-                Case.is_precedent.is_(False),
-                Case.next_hearing_date >= today,
-                Case.next_hearing_date <= last_day,
-            )
-            .all()
-        )
-        return [
-            _Candidate(
-                source_type=ReminderSourceType.CASE_HEARING,
-                source_id=case.id,
-                law_firm_id=case.law_firm_id,
-                occurrence_date=case.next_hearing_date,
-                reminder_days=list(HEARING_REMINDER_DAYS),
-                recipient_id=case.assigned_lawyer_id,
-                type_label=TYPE_LABELS["hearing"],
-                title=case.case_name,
-                starts_at=None,
-                location=case.court,
-                case_id=case.id,
-                case_name=case.case_name,
-            )
-            for case in cases
-            if (case.law_firm_id, case.id, case.next_hearing_date) not in hearing_event_days
-        ]
-
     # ----- deliveries -----
 
     def _users(self, user_ids: set[str]) -> dict[str, User]:
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/unit/test_reminder_service.py
```

Expected: PASS —

```text
35 passed
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/unit tests/integration
```

Expected: PASS — no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/reminder_service.py backend/tests/unit/test_reminder_service.py
git commit -F - <<'EOF'
feat: hearing reminders come from hearing events only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 5: Nightly recompute in the reminder worker; reopening recomputes

After a hearing has passed the case's date must move on without anybody editing anything: the first reminder tick of every local day recomputes all open cases. Reopening a closed case recomputes it too (its stored date may be stale).

**Files:**
- Modify: `backend/app/services/case_lifecycle.py`
- Modify: `backend/app/services/reminder_worker.py`
- Test (modify): `backend/tests/api/test_case_lifecycle.py`
- Test (modify): `backend/tests/unit/test_reminder_worker.py`

**Interfaces:**
- Consumes: Task 2's `recompute_open_cases`, `recompute_next_hearing`.
- Produces: `HearingRecomputeSchedule` with `last_day` and `run_if_new_day(session_factory, today) -> int | None`; `run_reminder_tick(session_factory, now_local, hearing_schedule)`.

- [ ] **Step 1: Write the failing tests**

Worker tests inject `now_local` and a `sessionmaker(bind=db_session.get_bind())`: the tick closes its sessions, so the test's own session cannot be reused.

Modify `backend/tests/api/test_case_lifecycle.py`:

```diff
--- a/backend/tests/api/test_case_lifecycle.py
+++ b/backend/tests/api/test_case_lifecycle.py
@@ -186,6 +186,20 @@ def test_reopening_an_open_case_is_a_409(client, lawyer):
     assert _timeline(client, lawyer, case["id"]) == []
 
 
+def test_reopening_recomputes_the_hearing_date_a_closed_case_left_stale(client, lawyer, close_case, db_session):
+    hearing = (TODAY + timedelta(days=4)).isoformat()
+    case = _new_case(client, lawyer, next_hearing_date=hearing)
+    close_case(lawyer, case["id"])
+    # A closed case is not recomputed overnight, so its date can be left behind.
+    row = db_session.get(Case, case["id"])
+    row.next_hearing_date = TODAY - timedelta(days=2)
+    db_session.commit()
+
+    reopened = client.post(f"/cases/{case['id']}/reopen", headers=lawyer).json()
+
+    assert reopened["next_hearing_date"] == hearing
+
+
 def test_a_reopened_case_can_be_closed_again(client, lawyer, close_case):
     case = _new_case(client, lawyer)
     close_case(lawyer, case["id"])
```

Modify `backend/tests/unit/test_reminder_worker.py`:

```diff
--- a/backend/tests/unit/test_reminder_worker.py
+++ b/backend/tests/unit/test_reminder_worker.py
@@ -4,7 +4,12 @@ from datetime import datetime
 
 from app.core.config import settings
 from app.services import reminder_worker
-from app.services.reminder_worker import run_reminder_tick, run_reminder_worker_loop, should_start_reminder_worker
+from app.services.reminder_worker import (
+    HearingRecomputeSchedule,
+    run_reminder_tick,
+    run_reminder_worker_loop,
+    should_start_reminder_worker,
+)
 
 
 def test_worker_never_starts_in_tests():
@@ -64,7 +69,7 @@ def test_loop_survives_a_failing_tick_and_stops_on_the_event(monkeypatch):
     stop = threading.Event()
     calls = []
 
-    def tick(session_factory):
+    def tick(session_factory, **kwargs):
         calls.append(1)
         if len(calls) == 1:
             raise RuntimeError("database hiccup")
@@ -75,3 +80,98 @@ def test_loop_survives_a_failing_tick_and_stops_on_the_event(monkeypatch):
     run_reminder_worker_loop(0.001, stop_event=stop)
 
     assert len(calls) == 2
+
+
+# ----- the nightly next_hearing_date pass -----
+
+
+def _own_sessions(db_session):
+    """A tick closes the session it is given; hand it fresh ones on the test's connection."""
+    from sqlalchemy.orm import sessionmaker
+
+    return sessionmaker(bind=db_session.get_bind())
+
+
+def _case_with_two_hearings(db_session):
+    from app.models.calendar import CalendarEvent, CalendarEventType
+    from app.models.case import Case, CaseType
+    from app.models.law_firm import LawFirm
+    from app.models.user import User, UserRole
+
+    firm = LawFirm(name="Büro")
+    db_session.add(firm)
+    db_session.flush()
+    user = User(law_firm_id=firm.id, email="avukat@a.test", hashed_password="x", full_name="Avukat",
+                role=UserRole.LAWYER, is_active=True)
+    db_session.add(user)
+    db_session.flush()
+    case = Case(law_firm_id=firm.id, case_number="2026/1", case_name="Dava", client_name="M", case_type=CaseType.KIRA,
+                assigned_lawyer_id=user.id, next_hearing_date=datetime(2026, 10, 2).date())
+    db_session.add(case)
+    db_session.flush()
+    for starts_at in (datetime(2026, 10, 2, 10, 0), datetime(2026, 10, 20, 10, 0)):
+        db_session.add(CalendarEvent(law_firm_id=firm.id, title="Duruşma", event_type=CalendarEventType.HEARING,
+                                     starts_at=starts_at, all_day=False, duration_minutes=60, case_id=case.id,
+                                     created_by=user.id, reminder_days=[]))
+    db_session.commit()
+    return case
+
+
+def test_the_first_tick_of_each_local_day_moves_next_hearing_dates_on(db_session, monkeypatch):
+    case = _case_with_two_hearings(db_session)
+    passes = []
+    real = reminder_worker.recompute_open_cases
+    monkeypatch.setattr(reminder_worker, "recompute_open_cases", lambda db, today: passes.append(today) or real(db, today))
+    factory = _own_sessions(db_session)
+    schedule = HearingRecomputeSchedule()
+
+    # Midnight is before the send hour: the recompute does not wait for it.
+    run_reminder_tick(factory, now_local=datetime(2026, 10, 2, 0, 10), hearing_schedule=schedule)
+    run_reminder_tick(factory, now_local=datetime(2026, 10, 2, 9, 15), hearing_schedule=schedule)
+    db_session.refresh(case)
+    assert (passes, case.next_hearing_date) == ([datetime(2026, 10, 2).date()], datetime(2026, 10, 2).date())
+
+    run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 0, 10), hearing_schedule=schedule)
+    run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 9, 15), hearing_schedule=schedule)
+    db_session.refresh(case)
+    assert passes == [datetime(2026, 10, 2).date(), datetime(2026, 10, 3).date()]
+    assert case.next_hearing_date == datetime(2026, 10, 20).date()
+
+
+def test_a_failed_pass_is_retried_and_never_stops_the_reminders(db_session, monkeypatch):
+    case = _case_with_two_hearings(db_session)
+    real = reminder_worker.recompute_open_cases
+    attempts = []
+
+    def flaky(db, today):
+        attempts.append(today)
+        if len(attempts) == 1:
+            raise RuntimeError("database hiccup")
+        return real(db, today)
+
+    monkeypatch.setattr(reminder_worker, "recompute_open_cases", flaky)
+    factory = _own_sessions(db_session)
+    schedule = HearingRecomputeSchedule()
+
+    first = run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 9, 0), hearing_schedule=schedule)
+    assert first.sent == 0 and schedule.last_day is None
+    run_reminder_tick(factory, now_local=datetime(2026, 10, 3, 9, 15), hearing_schedule=schedule)
+
+    db_session.refresh(case)
+    assert (len(attempts), schedule.last_day, case.next_hearing_date) == (2, datetime(2026, 10, 3).date(), datetime(2026, 10, 20).date())
+
+
+def test_the_loop_passes_one_schedule_to_every_tick(monkeypatch):
+    stop = threading.Event()
+    schedules = []
+
+    def tick(session_factory, hearing_schedule=None):
+        schedules.append(hearing_schedule)
+        if len(schedules) == 2:
+            stop.set()
+
+    monkeypatch.setattr(reminder_worker, "run_reminder_tick", tick)
+
+    run_reminder_worker_loop(0.001, stop_event=stop)
+
+    assert isinstance(schedules[0], HearingRecomputeSchedule) and schedules[0] is schedules[1]
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/unit/test_reminder_worker.py tests/api/test_case_lifecycle.py
```

Expected: FAIL —

```text
ERROR tests/unit/test_reminder_worker.py
E   ImportError: cannot import name 'HearingRecomputeSchedule' from 'app.services.reminder_worker'
Interrupted: 1 error during collection
```

- [ ] **Step 3: Implement**


Modify `backend/app/services/case_lifecycle.py`:

```diff
--- a/backend/app/services/case_lifecycle.py
+++ b/backend/app/services/case_lifecycle.py
@@ -11,6 +11,7 @@ from sqlalchemy.orm import Session
 
 from app.models.case import Case, CaseEvent, CaseEventType, CaseOutcome, CaseStatus
 from app.schemas.case import CaseClose, CaseUpdate
+from app.services.hearing_dates import recompute_next_hearing
 
 OUTCOME_LABELS = {
     CaseOutcome.WON: "Kazanıldı",
@@ -84,6 +85,8 @@ class CaseLifecycleService:
         case.outcome = CaseOutcome.ONGOING
         case.decision_date = None
         case.closing_note = None
+        # A closed case keeps a stale next_hearing_date; the reopened case is open again.
+        recompute_next_hearing(self.db, case, today)
         event = CaseEvent(
             case_id=case.id,
             law_firm_id=case.law_firm_id,
```

Modify `backend/app/services/reminder_worker.py`:

```diff
--- a/backend/app/services/reminder_worker.py
+++ b/backend/app/services/reminder_worker.py
@@ -3,6 +3,9 @@
 Like the simulation and courtroom workers: one daemon thread in the API
 process that runs ReminderService.send_due every REMINDER_POLL_SECONDS
 with its own DB session per tick. "Now" is computed in APP_TIMEZONE.
+The first tick of every local day (and the first one after a start-up) also
+recomputes cases.next_hearing_date of the open cases (HearingRecomputeSchedule),
+so a date that has passed moves on to the case's next hearing.
 Not started during automated tests (settings.env == "test") or when
 REMINDERS_ENABLED=false. Single-instance only: two API processes would
 each run a worker, and the unique constraint on reminder_deliveries is
@@ -10,7 +13,7 @@ then the only guard against a duplicate e-mail.
 """
 import logging
 import threading
-from datetime import datetime
+from datetime import date, datetime
 from typing import Callable, Optional
 
 from sqlalchemy.orm import Session
@@ -18,6 +21,7 @@ from sqlalchemy.orm import Session
 from app.core.config import settings
 from app.core.timeutil import local_now
 from app.db.session import SessionLocal
+from app.services.hearing_dates import recompute_open_cases
 from app.services.reminder_service import ReminderRunResult, ReminderService
 
 logger = logging.getLogger("casebridge")
@@ -27,13 +31,43 @@ def should_start_reminder_worker() -> bool:
     return settings.env != "test" and settings.reminders_enabled
 
 
+class HearingRecomputeSchedule:
+    """Remembers the local day of the last successful recompute, so the pass runs
+    once per day however often the worker ticks. A failed pass is not remembered
+    and is tried again on the next tick."""
+
+    def __init__(self) -> None:
+        self.last_day: Optional[date] = None
+
+    def run_if_new_day(self, session_factory: Callable[[], Session], today: date) -> Optional[int]:
+        """Returns how many cases changed, or None when today's pass already ran."""
+        if self.last_day == today:
+            return None
+        db = session_factory()
+        try:
+            changed = recompute_open_cases(db, today)
+        finally:
+            db.close()
+        self.last_day = today
+        if changed:
+            logger.info("Sonraki duruşma tarihi %d davada yeniden hesaplandı.", changed)
+        return changed
+
+
 def run_reminder_tick(
     session_factory: Callable[[], Session] = SessionLocal,
     now_local: Optional[datetime] = None,
+    hearing_schedule: Optional[HearingRecomputeSchedule] = None,
 ) -> ReminderRunResult:
+    now = now_local or local_now()
+    if hearing_schedule is not None:
+        try:
+            hearing_schedule.run_if_new_day(session_factory, now.date())
+        except Exception:  # the reminders below must still go out
+            logger.exception("Next hearing recompute failed")
     db = session_factory()
     try:
-        result = ReminderService(db).send_due(now_local or local_now())
+        result = ReminderService(db).send_due(now)
     finally:
         db.close()
     if result.sent or result.failed:
@@ -47,9 +81,10 @@ def run_reminder_worker_loop(
     session_factory: Callable[[], Session] = SessionLocal,
 ) -> None:
     stop_event = stop_event or threading.Event()
+    hearing_schedule = HearingRecomputeSchedule()
     while not stop_event.is_set():
         try:
-            run_reminder_tick(session_factory)
+            run_reminder_tick(session_factory, hearing_schedule=hearing_schedule)
         except Exception:
             logger.exception("Reminder worker tick failed")
         stop_event.wait(poll_interval_seconds)
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/unit/test_reminder_worker.py tests/api/test_case_lifecycle.py
```

Expected: PASS —

```text
40 passed
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/unit tests/api/test_case_lifecycle.py
```

Expected: PASS — no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/case_lifecycle.py backend/app/services/reminder_worker.py backend/tests/api/test_case_lifecycle.py backend/tests/unit/test_reminder_worker.py
git commit -F - <<'EOF'
feat: nightly next_hearing_date recompute in the reminder worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 6: Case hearing list and hearing result endpoints

`GET /cases/{id}/hearings` and `POST /calendar/events/{id}/result`, served by a new `HearingService`. The result stores the note, writes or updates the timeline entry, optionally adds the next hearing and recomputes the cache, all in one transaction.

**Files:**
- Modify: `backend/app/api/routes/calendar.py`
- Modify: `backend/app/api/routes/cases.py`
- Modify: `backend/app/schemas/calendar.py`
- Modify: `backend/app/services/calendar_service.py`
- Create: `backend/app/services/hearing_service.py`
- Test (create): `backend/tests/api/test_case_hearings.py`

**Interfaces:**
- Consumes: Task 2's `recompute_next_hearing`, `ClosedCaseHearing` message, `require_case_id_writable` (case-lifecycle), `HEARING_REMINDER_DAYS`.
- Produces: `CaseHearingOut`, `NextHearingIn`, `HearingResultIn`, `HearingResultOut` (`app.schemas.calendar`); `HearingService.list_for_case(case, today)`, `HearingService.record_result(event, payload, user_id, today)`; `HearingRuleError(status_code, detail)`; `calendar_service.normalize_start` (public).

- [ ] **Step 1: Write the failing tests**

Tests cover the list (order, flags, other firm 404), every result rule in the order 404 → archived 409 → 422 → closed 409, the timeline entry created once and updated on a second result, the optional next hearing, and the cache.

Create `backend/tests/api/test_case_hearings.py`:

```python
"""GET /cases/{id}/hearings and POST /calendar/events/{id}/result: the hearing list of a
case and the note written after a hearing (timeline entry, next hearing, closed and
archived cases, firm isolation)."""
from datetime import timedelta

import pytest

from app.core.timeutil import local_today
from app.models.case import CaseEvent

TODAY = local_today()
ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
CLOSED = "Kapalı davaya duruşma eklenemez."
NOT_A_CASE_HEARING = "Sonuç yalnızca davaya bağlı duruşmalara girilebilir."
NOT_YET = "Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir."
OPENED = (TODAY - timedelta(days=60)).isoformat()


def day(offset):
    return (TODAY + timedelta(days=offset)).isoformat()


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch):
    for route in ("calendar", "cases"):
        monkeypatch.setattr(f"app.api.routes.{route}.local_today", lambda: TODAY)


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


@pytest.fixture()
def case(client, lawyer):
    return _new_case(client, lawyer)


def _new_case(client, headers, number="2026/1", **overrides):
    payload = {
        "case_number": number, "case_name": "Alacak Davası", "client_name": "Müvekkil", "case_type": "kira",
        "opening_date": OPENED, **overrides,
    }
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _hearing(client, headers, case_id, starts_at, **extra):
    payload = {"title": "Duruşma", "event_type": "hearing", "starts_at": starts_at, "case_id": case_id, **extra}
    response = client.post("/calendar/events", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _result(client, headers, event_id, note="Bilirkişi raporu beklenecek.", **extra):
    return client.post(f"/calendar/events/{event_id}/result", json={"result_note": note, **extra}, headers=headers)


def _timeline(client, headers, case_id):
    return client.get(f"/cases/{case_id}", headers=headers).json()["timeline"]


# --- GET /cases/{id}/hearings -----------------------------------------------------------------

def test_the_hearings_of_a_case_are_listed_earliest_first_with_their_flags(client, lawyer, case):
    later = _hearing(client, lawyer, case["id"], f"{day(9)}T14:30:00", location="3. Asliye Hukuk", notes="Tanık dinlenecek")
    past = _hearing(client, lawyer, case["id"], f"{day(-4)}T10:00:00", duration_minutes=90)
    today = _hearing(client, lawyer, case["id"], f"{day(0)}T00:00:00", all_day=True)
    client.post("/calendar/events", json={"title": "Toplantı", "event_type": "meeting", "starts_at": f"{day(1)}T09:00:00", "case_id": case["id"]}, headers=lawyer)
    other = _new_case(client, lawyer, number="2026/2")
    _hearing(client, lawyer, other["id"], f"{day(3)}T10:00:00")

    response = client.get(f"/cases/{case['id']}/hearings", headers=lawyer)

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [past["id"], today["id"], later["id"]]
    assert body[0] == {
        "id": past["id"], "starts_at": f"{day(-4)}T10:00:00", "all_day": False, "duration_minutes": 90,
        "location": None, "notes": None, "assignee_id": None, "result_note": None,
        "is_past": True, "result_open": True,
    }
    assert (body[1]["is_past"], body[1]["result_open"], body[1]["all_day"]) == (False, True, True)
    assert (body[2]["is_past"], body[2]["result_open"]) == (False, False)
    assert (body[2]["location"], body[2]["notes"]) == ("3. Asliye Hukuk", "Tanık dinlenecek")


def test_a_case_without_hearings_has_an_empty_list(client, lawyer, case):
    assert client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json() == []


def test_the_hearing_list_of_another_firm_is_a_404_and_needs_a_login(client, case, office, auth_headers):
    outsider = auth_headers(office.lawyer_b)
    response = client.get(f"/cases/{case['id']}/hearings", headers=outsider)
    assert response.status_code == 404
    assert client.get(f"/cases/{case['id']}/hearings").status_code == 401


def test_any_lawyer_of_the_firm_may_read_the_hearings(client, case, office, auth_headers, lawyer):
    _hearing(client, lawyer, case["id"], f"{day(3)}T10:00:00")
    colleague = auth_headers(office.lawyer_a2)
    assert len(client.get(f"/cases/{case['id']}/hearings", headers=colleague).json()) == 1


# --- POST /calendar/events/{id}/result --------------------------------------------------------

def test_a_result_is_stored_with_a_timeline_entry_dated_on_the_hearing(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-3)}T10:00:00")

    response = _result(client, lawyer, hearing["id"], note="  Bilirkişi raporu beklenecek.  ")

    assert response.status_code == 200
    body = response.json()
    assert body["next_hearing"] is None
    assert (body["hearing"]["id"], body["hearing"]["result_note"], body["hearing"]["is_past"]) == (
        hearing["id"], "Bilirkişi raporu beklenecek.", True,
    )
    [entry] = _timeline(client, lawyer, case["id"])
    assert (entry["event_date"], entry["event_type"], entry["description"]) == (
        day(-3), "hearing", "Bilirkişi raporu beklenecek.",
    )
    shown = (TODAY - timedelta(days=3)).strftime("%d.%m.%Y")
    assert entry["title"] == f"Duruşma yapıldı — {shown}"
    stored = client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()
    assert stored["result_note"] == "Bilirkişi raporu beklenecek."
    item = next(i for i in client.get("/calendar", params={"from": day(-5), "to": day(-1)}, headers=lawyer).json() if i["event_id"] == hearing["id"])
    assert item["result_note"] == "Bilirkişi raporu beklenecek."


def test_entering_the_result_again_updates_the_same_timeline_entry(client, lawyer, case, db_session):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-3)}T10:00:00")
    _result(client, lawyer, hearing["id"], note="İlk not")

    second = _result(client, lawyer, hearing["id"], note="Düzeltilmiş not")

    assert second.status_code == 200
    [entry] = _timeline(client, lawyer, case["id"])
    assert entry["description"] == "Düzeltilmiş not"
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] == "Düzeltilmiş not"


def test_a_deleted_timeline_entry_is_written_again(client, lawyer, case, db_session):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-3)}T10:00:00")
    _result(client, lawyer, hearing["id"], note="İlk not")
    for row in db_session.query(CaseEvent).all():
        db_session.delete(row)
    db_session.commit()

    assert _result(client, lawyer, hearing["id"], note="Yeni not").status_code == 200

    [entry] = _timeline(client, lawyer, case["id"])
    assert entry["description"] == "Yeni not"


def test_a_hearing_that_is_today_takes_a_result(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(0)}T23:30:00")
    assert _result(client, lawyer, hearing["id"]).status_code == 200


def test_the_result_can_add_the_next_hearing_in_the_same_request(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")

    response = _result(
        client, lawyer, hearing["id"],
        next_hearing={"starts_at": f"{day(20)}T11:15:00", "duration_minutes": 45, "location": "5. Asliye Hukuk", "notes": "Karar"},
    )

    assert response.status_code == 200
    following = response.json()["next_hearing"]
    assert (following["starts_at"], following["duration_minutes"], following["location"], following["notes"]) == (
        f"{day(20)}T11:15:00", 45, "5. Asliye Hukuk", "Karar",
    )
    assert (following["is_past"], following["result_note"], following["assignee_id"]) == (False, None, case["assigned_lawyer_id"])
    stored = client.get(f"/calendar/events/{following['id']}", headers=lawyer).json()
    assert (stored["title"], stored["event_type"], stored["case_id"], stored["reminder_days"]) == ("Duruşma", "hearing", case["id"], [3, 1])
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["next_hearing_date"] == day(20)
    assert [h["id"] for h in client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json()] == [hearing["id"], following["id"]]


def test_an_all_day_next_hearing_is_stored_at_midnight(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    following = _result(client, lawyer, hearing["id"], next_hearing={"starts_at": f"{day(7)}T15:00:00", "all_day": True}).json()["next_hearing"]
    assert (following["starts_at"], following["all_day"]) == (f"{day(7)}T00:00:00", True)


@pytest.mark.parametrize("note", ["", "   ", "x" * 4001])
def test_a_blank_or_too_long_note_is_rejected(client, lawyer, case, note):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    assert _result(client, lawyer, hearing["id"], note=note).status_code == 422
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] is None


def test_the_longest_note_is_accepted(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    assert _result(client, lawyer, hearing["id"], note="x" * 4000).status_code == 200


def test_only_hearings_linked_to_a_case_take_a_result(client, lawyer, case):
    meeting = client.post("/calendar/events", json={"title": "Toplantı", "event_type": "meeting", "starts_at": f"{day(-1)}T09:00:00", "case_id": case["id"]}, headers=lawyer).json()
    unlinked = client.post("/calendar/events", json={"title": "Duruşma", "event_type": "hearing", "starts_at": f"{day(-1)}T09:00:00"}, headers=lawyer).json()
    for event in (meeting, unlinked):
        response = _result(client, lawyer, event["id"])
        assert (response.status_code, response.json()["detail"]) == (422, NOT_A_CASE_HEARING)


def test_a_hearing_that_has_not_happened_yet_takes_no_result(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(1)}T00:30:00")
    response = _result(client, lawyer, hearing["id"], next_hearing={"starts_at": f"{day(30)}T10:00:00"})
    assert (response.status_code, response.json()["detail"]) == (422, NOT_YET)
    assert len(client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json()) == 1
    assert _timeline(client, lawyer, case["id"]) == []


def test_an_archived_case_refuses_the_result(client, lawyer, case, close_case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-2)}T10:00:00")
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200

    response = _result(client, lawyer, hearing["id"])

    assert (response.status_code, response.json()["detail"]) == (409, ARCHIVED)
    assert _timeline(client, lawyer, case["id"])[0]["title"].startswith("Dava kapatıldı")
    assert len(_timeline(client, lawyer, case["id"])) == 1


def test_a_closed_case_takes_the_note_but_not_a_next_hearing(client, lawyer, case, close_case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-2)}T10:00:00")
    close_case(lawyer, case["id"])

    refused = _result(client, lawyer, hearing["id"], next_hearing={"starts_at": f"{day(10)}T10:00:00"})
    assert (refused.status_code, refused.json()["detail"]) == (409, CLOSED)
    # Nothing was written: not even the note.
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] is None
    assert len(client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json()) == 1

    accepted = _result(client, lawyer, hearing["id"], note="Karar tebliği bekleniyor")
    assert accepted.status_code == 200
    assert client.get(f"/calendar/events/{hearing['id']}", headers=lawyer).json()["result_note"] == "Karar tebliği bekleniyor"


def test_a_result_of_another_firm_is_a_404(client, lawyer, case, office, auth_headers):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-1)}T10:00:00")
    response = _result(client, auth_headers(office.lawyer_b), hearing["id"])
    assert (response.status_code, response.json()["detail"]) == (404, "Etkinlik bulunamadı")
    assert client.post("/calendar/events/x/result", json={"result_note": "a"}).status_code == 401


def test_deleting_the_hearing_keeps_its_timeline_entry(client, lawyer, case):
    hearing = _hearing(client, lawyer, case["id"], f"{day(-2)}T10:00:00")
    _result(client, lawyer, hearing["id"])

    assert client.delete(f"/calendar/events/{hearing['id']}", headers=lawyer).status_code == 204

    assert len(_timeline(client, lawyer, case["id"])) == 1
    assert client.get(f"/cases/{case['id']}/hearings", headers=lawyer).json() == []


def test_the_result_does_not_move_a_cached_date_to_the_past(client, lawyer, case):
    _hearing(client, lawyer, case["id"], f"{day(5)}T10:00:00")
    past = _hearing(client, lawyer, case["id"], f"{day(-5)}T10:00:00")
    _result(client, lawyer, past["id"])
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["next_hearing_date"] == day(5)
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/api/test_case_hearings.py
```

Expected: FAIL —

```text
FAILED tests/api/test_case_hearings.py::test_the_hearings_of_a_case_are_listed_earliest_first_with_their_flags
FAILED tests/api/test_case_hearings.py::test_a_result_is_stored_with_a_timeline_entry_dated_on_the_hearing
... (the endpoints do not exist: 404 / 405 instead of 200)
19 failed, 2 passed
```

- [ ] **Step 3: Implement**


Modify `backend/app/api/routes/calendar.py`:

```diff
--- a/backend/app/api/routes/calendar.py
+++ b/backend/app/api/routes/calendar.py
@@ -16,9 +16,17 @@ from app.api.deps import get_current_law_firm_id, get_current_user
 from app.core.timeutil import local_today
 from app.db.session import get_db
 from app.models.user import User
-from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, CalendarItemOut
+from app.schemas.calendar import (
+    CalendarEventCreate,
+    CalendarEventOut,
+    CalendarEventUpdate,
+    CalendarItemOut,
+    HearingResultIn,
+    HearingResultOut,
+)
 from app.services.assignees import AssigneeNotAssignable
 from app.services.calendar_service import CalendarReferenceNotFound, CalendarService, ClosedCaseHearing
+from app.services.hearing_service import HearingRuleError, HearingService
 
 router = APIRouter(prefix="/calendar", tags=["calendar"])
 
@@ -119,3 +127,20 @@ def delete_calendar_event(
     require_case_id_writable(db, event.case_id, law_firm_id)
     service.delete_event(event, today=local_today())
     return Response(status_code=status.HTTP_204_NO_CONTENT)
+
+
+@router.post("/events/{event_id}/result", response_model=HearingResultOut)
+def record_hearing_result(
+    event_id: str,
+    payload: HearingResultIn,
+    current_user: User = Depends(get_current_user),
+    db: Session = Depends(get_db),
+):
+    """The note after a hearing, with an optional next hearing. 404 for another firm's
+    event, 409 for an archived case, then the hearing rules (422, 409 for a closed case)."""
+    event = _owned_event_or_404(CalendarService(db), event_id, current_user.law_firm_id)
+    require_case_id_writable(db, event.case_id, current_user.law_firm_id)
+    try:
+        return HearingService(db).record_result(event, payload, current_user.id, today=local_today())
+    except HearingRuleError as exc:
+        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
```

Modify `backend/app/api/routes/cases.py`:

```diff
--- a/backend/app/api/routes/cases.py
+++ b/backend/app/api/routes/cases.py
@@ -9,10 +9,12 @@ from app.core.timeutil import local_today
 from app.db.session import get_db
 from app.models.case import CaseOutcome, CaseStatus, CaseType
 from app.models.user import User, UserRole
+from app.schemas.calendar import CaseHearingOut
 from app.schemas.case import CaseClose, CaseCreate, CaseDetailOut, CaseEventCreate, CaseEventOut, CaseOut, CaseUpdate
 from app.services.case_lifecycle import CaseLifecycleService, CaseStateError
 from app.services.case_parties import InvalidPartiesError
 from app.services.case_service import CaseService, DuplicateCaseNumberError
+from app.services.hearing_service import HearingService
 
 router = APIRouter(prefix="/cases", tags=["cases"])
 
@@ -113,6 +115,17 @@ def get_case(
     )
 
 
+@router.get("/{case_id}/hearings", response_model=list[CaseHearingOut])
+def list_case_hearings(
+    case_id: str,
+    law_firm_id: str = Depends(get_current_law_firm_id),
+    db: Session = Depends(get_db),
+):
+    """Every hearing of the case, earliest first (the calendar events of type hearing)."""
+    case = _get_owned_case_or_404(CaseService(db), case_id, law_firm_id)
+    return HearingService(db).list_for_case(case, local_today())
+
+
 @router.patch("/{case_id}", response_model=CaseOut)
 def update_case(
     case_id: str,
```

Modify `backend/app/schemas/calendar.py`:

```diff
--- a/backend/app/schemas/calendar.py
+++ b/backend/app/schemas/calendar.py
@@ -96,3 +96,45 @@ class CalendarEventOut(BaseModel):
     result_note: Optional[str] = None
     created_at: datetime
     updated_at: datetime
+
+
+#: The note a lawyer writes after a hearing: trimmed, 1-4000 characters.
+ResultNote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
+
+
+class CaseHearingOut(BaseModel):
+    """One hearing of a case (GET /cases/{id}/hearings). `is_past`: the hearing's
+    local date is before today. `result_open`: it is today or earlier, so a result
+    may be entered (a hearing that is today is not past yet but may already be
+    recorded)."""
+
+    model_config = ConfigDict(from_attributes=True)
+
+    id: str
+    starts_at: datetime
+    all_day: bool
+    duration_minutes: int
+    location: Optional[str] = None
+    notes: Optional[str] = None
+    assignee_id: Optional[str] = None
+    result_note: Optional[str] = None
+    is_past: bool
+    result_open: bool
+
+
+class NextHearingIn(BaseModel):
+    starts_at: datetime
+    all_day: bool = False
+    duration_minutes: DurationMinutes = 60
+    location: Optional[ShortText] = None
+    notes: Optional[NotesText] = None
+
+
+class HearingResultIn(BaseModel):
+    result_note: ResultNote
+    next_hearing: Optional[NextHearingIn] = None
+
+
+class HearingResultOut(BaseModel):
+    hearing: CaseHearingOut
+    next_hearing: Optional[CaseHearingOut] = None
```

Modify `backend/app/services/calendar_service.py`:

```diff
--- a/backend/app/services/calendar_service.py
+++ b/backend/app/services/calendar_service.py
@@ -58,7 +58,7 @@ class CalendarService:
             law_firm_id=law_firm_id,
             title=payload.title,
             event_type=payload.event_type,
-            starts_at=_normalize_start(payload.starts_at, payload.all_day),
+            starts_at=normalize_start(payload.starts_at, payload.all_day),
             all_day=payload.all_day,
             duration_minutes=payload.duration_minutes,
             location=payload.location,
@@ -99,7 +99,7 @@ class CalendarService:
                 require_case_open_for_hearing(target)
         for field, value in updates.items():
             setattr(event, field, value)
-        event.starts_at = _normalize_start(event.starts_at, event.all_day)
+        event.starts_at = normalize_start(event.starts_at, event.all_day)
         # Both the case the hearing leaves and the one it now belongs to need a new cache value.
         affected = {held_hearing_of, becomes_hearing_of} - {None}
         for case_id in sorted(affected):
@@ -231,7 +231,7 @@ def _task_item(task: Task, case_name: str, names: dict[str, str]) -> CalendarIte
     )
 
 
-def _normalize_start(starts_at: datetime, all_day: bool) -> datetime:
+def normalize_start(starts_at: datetime, all_day: bool) -> datetime:
     local = to_local_naive(starts_at).replace(second=0, microsecond=0)
     if all_day:
         local = local.replace(hour=0, minute=0)
```

Create `backend/app/services/hearing_service.py`:

```python
"""A case's hearings and the note written after one.

Hearings are calendar events of type "hearing" (see hearing_dates.py). Rules
that fail raise HearingRuleError; the route turns it into the response.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.domain.calendar import HEARING_REMINDER_DAYS
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseEvent, CaseEventType, CaseStatus
from app.repositories.case_repository import CaseRepository
from app.schemas.calendar import CaseHearingOut, HearingResultIn, HearingResultOut
from app.services.calendar_service import CLOSED_CASE_HEARING, normalize_start
from app.services.hearing_dates import recompute_next_hearing

NOT_A_CASE_HEARING = "Sonuç yalnızca davaya bağlı duruşmalara girilebilir."
NOT_YET_HELD = "Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir."


class HearingRuleError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def hearing_out(event: CalendarEvent, today: date) -> CaseHearingOut:
    day = event.starts_at.date()
    return CaseHearingOut(
        id=event.id,
        starts_at=event.starts_at,
        all_day=event.all_day,
        duration_minutes=event.duration_minutes,
        location=event.location,
        notes=event.notes,
        assignee_id=event.assignee_id,
        result_note=event.result_note,
        is_past=day < today,
        result_open=day <= today,
    )


class HearingService:
    def __init__(self, db: Session):
        self.db = db

    def list_for_case(self, case: Case, today: date) -> list[CaseHearingOut]:
        events = (
            self.db.query(CalendarEvent)
            .filter(
                CalendarEvent.law_firm_id == case.law_firm_id,
                CalendarEvent.case_id == case.id,
                CalendarEvent.event_type == CalendarEventType.HEARING,
            )
            .order_by(CalendarEvent.starts_at, CalendarEvent.created_at)
            .all()
        )
        return [hearing_out(event, today) for event in events]

    def record_result(
        self, event: CalendarEvent, payload: HearingResultIn, user_id: str, today: date
    ) -> HearingResultOut:
        """Store the note, write (or update) its timeline entry and, when asked, add the
        next hearing, all in one transaction. The caller has already answered 404 for an
        unknown event and 409 for an archived case."""
        if event.event_type != CalendarEventType.HEARING or event.case_id is None:
            raise HearingRuleError(422, NOT_A_CASE_HEARING)
        day = event.starts_at.date()
        if day > today:
            raise HearingRuleError(422, NOT_YET_HELD)
        case = CaseRepository(self.db).get_by_id_in_firm_for_update(event.case_id, event.law_firm_id)
        if case is None:
            raise HearingRuleError(422, NOT_A_CASE_HEARING)
        if payload.next_hearing is not None and case.status == CaseStatus.KAPALI:
            raise HearingRuleError(409, CLOSED_CASE_HEARING)

        event.result_note = payload.result_note
        entry = self._timeline_entry(event)
        if entry is None:
            entry = CaseEvent(
                case_id=case.id,
                law_firm_id=case.law_firm_id,
                event_date=day,
                title=f"Duruşma yapıldı — {day:%d.%m.%Y}",
                event_type=CaseEventType.HEARING,
                created_by=user_id,
            )
            self.db.add(entry)
        entry.description = payload.result_note
        self.db.flush()
        event.result_case_event_id = entry.id

        following: Optional[CalendarEvent] = None
        if payload.next_hearing is not None:
            following = CalendarEvent(
                law_firm_id=case.law_firm_id,
                title="Duruşma",
                event_type=CalendarEventType.HEARING,
                starts_at=normalize_start(payload.next_hearing.starts_at, payload.next_hearing.all_day),
                all_day=payload.next_hearing.all_day,
                duration_minutes=payload.next_hearing.duration_minutes,
                location=payload.next_hearing.location,
                notes=payload.next_hearing.notes,
                case_id=case.id,
                assignee_id=case.assigned_lawyer_id,
                created_by=user_id,
                reminder_days=list(HEARING_REMINDER_DAYS),
            )
            self.db.add(following)
        recompute_next_hearing(self.db, case, today)
        self.db.commit()
        self.db.refresh(event)
        if following is not None:
            self.db.refresh(following)
        return HearingResultOut(
            hearing=hearing_out(event, today),
            next_hearing=hearing_out(following, today) if following is not None else None,
        )

    def _timeline_entry(self, event: CalendarEvent) -> Optional[CaseEvent]:
        """The entry written for an earlier result; None when there is none or it was deleted."""
        if event.result_case_event_id is None:
            return None
        return (
            self.db.query(CaseEvent)
            .filter(CaseEvent.id == event.result_case_event_id, CaseEvent.case_id == event.case_id)
            .first()
        )
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/api/test_case_hearings.py
```

Expected: PASS —

```text
21 passed
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider tests/api
```

Expected: PASS — no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/calendar.py backend/app/api/routes/cases.py backend/app/schemas/calendar.py backend/app/services/calendar_service.py backend/app/services/hearing_service.py backend/tests/api/test_case_hearings.py
git commit -F - <<'EOF'
feat: case hearing list and hearing result endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 7: Frontend foundation: types, API calls, hearing form rules, drawer result row

Types and API for hearings, the pure form/display rules (`lib/hearings.ts`), the `Sonuç` row in the calendar drawer, and the removal of `case_hearing` from the item kinds. Fixtures that built `case_hearing` items or lacked `result_note` are updated so `tsc` stays clean.

**Files:**
- Modify: `frontend/src/components/UpcomingNotifications.tsx`
- Test (modify): `frontend/src/components/__tests__/CalendarEventDrawer.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CalendarEventForm.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CalendarView.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CalendarViews.test.tsx`
- Modify: `frontend/src/components/calendar/CalendarEventDrawer.tsx`
- Test (modify): `frontend/src/lib/__tests__/api.test.ts`
- Test (modify): `frontend/src/lib/__tests__/calendar.test.ts`
- Test (create): `frontend/src/lib/__tests__/hearings.test.ts`
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/hearings.ts`
- Modify: `frontend/src/types/index.ts`

**Interfaces:**
- Consumes: the Task 2 and Task 6 API shapes.
- Produces: `CaseHearing`, `HearingFields`, `HearingResultPayload`, `HearingResultResponse`; `getCaseHearings(caseId)`, `recordHearingResult(eventId, payload)`; in `lib/hearings.ts`: `HEARING_TITLE`, `ALL_DAY_LABEL`, `MAX_RESULT_NOTE`, `HearingFormState`, `EMPTY_HEARING_FORM`, `hearingDay`, `hearingTime`, `hearingWhen`, `hearingFormFromHearing`, `validateHearingForm`, `hasHearingErrors`, `buildHearingFields`, `validateResultNote`, `splitHearings`, `nextHearing`.

- [ ] **Step 1: Write the failing tests**

Fixtures are updated first (`result_note: null`, hearings as ordinary events); the new tests cover the rules, the API calls and the drawer row.

Modify `frontend/src/components/__tests__/CalendarEventDrawer.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CalendarEventDrawer.test.tsx
+++ b/frontend/src/components/__tests__/CalendarEventDrawer.test.tsx
@@ -22,15 +22,15 @@ const event: CalendarEvent = {
   id: "event:e1", kind: "event", event_type: "meeting", title: "Müvekkil toplantısı", date: "2026-10-07",
   start: "2026-10-07T14:30:00", end: "2026-10-07T16:00:00", all_day: false, case_id: "c1",
   case_name: "Ticari Kira Uyarlama Davası", task_id: null, event_id: "e1", assignee_id: "u1",
-  assignee_name: "Avukat A", location: "Büro", notes: "Belgeleri getir", reminder_days: [3, 1], editable: true,
+  assignee_name: "Avukat A", location: "Büro", notes: "Belgeleri getir", result_note: null, reminder_days: [3, 1], editable: true,
 };
 const task: CalendarEvent = {
   ...event, id: "task:t1", kind: "task", event_type: "task", title: "Dilekçe hazırla", start: null, end: null,
   all_day: true, task_id: "t1", event_id: null, location: null, notes: null, reminder_days: [1], editable: false,
 };
 const hearing: CalendarEvent = {
-  ...event, id: "hearing:c1", kind: "case_hearing", event_type: "hearing", title: "Duruşma - Ticari Kira Uyarlama Davası",
-  start: null, end: null, all_day: true, event_id: null, notes: null, reminder_days: [3, 1], editable: false,
+  ...event, id: "event:h1", event_type: "hearing", title: "Duruşma", event_id: "h1", notes: null,
+  result_note: "Bilirkişi raporu beklenecek.", reminder_days: [3, 1],
 };
 
 function renderDrawer(item: CalendarEvent) {
@@ -98,11 +98,12 @@ describe("CalendarEventDrawer", () => {
     expect(handlers.onClose).toHaveBeenCalled();
   });
 
-  it("shows case hearings read-only with a link to the case", () => {
-    renderDrawer(hearing);
-    expect(screen.getByRole("link", { name: "Davayı aç" })).toHaveAttribute("href", "/davalar/c1");
-    expect(screen.getByText(/varsayılan hatırlatma: 3 gün ve 1 gün önce/)).toBeInTheDocument();
-    expect(screen.queryByRole("button", { name: "Hatırlatmayı değiştir" })).not.toBeInTheDocument();
+  it("shows the hearing result row only when a result note exists", () => {
+    const { unmount } = render(<CalendarEventDrawer item={hearing} onClose={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} />);
+    expect(screen.getByRole("dialog", { name: "Duruşma" })).toHaveTextContent("SonuçBilirkişi raporu beklenecek.");
+    unmount();
+    renderDrawer(event);
+    expect(screen.getByRole("dialog")).not.toHaveTextContent("Sonuç");
   });
 
   it("shows an error when an action fails and closes on Escape", async () => {
```

Modify `frontend/src/components/__tests__/CalendarEventForm.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CalendarEventForm.test.tsx
+++ b/frontend/src/components/__tests__/CalendarEventForm.test.tsx
@@ -110,7 +110,7 @@ describe("CalendarEventForm", () => {
       id: "event:e1", kind: "event", event_type: "client_meeting", title: "Müvekkil görüşmesi", date: "2026-10-07",
       start: "2026-10-07T10:30:00", end: "2026-10-07T11:15:00", all_day: false, case_id: null, case_name: null,
       task_id: null, event_id: "e1", assignee_id: "u1", assignee_name: "Avukat A", location: null, notes: "Not",
-      reminder_days: [7], editable: true,
+      result_note: null, reminder_days: [7], editable: true,
     };
     render(<CalendarEventForm initial={eventFormInitialFromItem(item)} cases={cases} users={users} onClose={vi.fn()} onSaved={vi.fn()} />);
 
```

Modify `frontend/src/components/__tests__/CalendarView.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CalendarView.test.tsx
+++ b/frontend/src/components/__tests__/CalendarView.test.tsx
@@ -35,14 +35,14 @@ function item(overrides: Partial<CalendarEvent>): CalendarEvent {
     id: "event:e1", kind: "event", event_type: "meeting", title: "Müvekkil toplantısı", date: "2026-10-07",
     start: "2026-10-07T14:30:00", end: "2026-10-07T16:00:00", all_day: false, case_id: null, case_name: null,
     task_id: null, event_id: "e1", assignee_id: "u1", assignee_name: "Avukat A", location: null, notes: null,
-    reminder_days: [1], editable: true, ...overrides,
+    result_note: null, reminder_days: [1], editable: true, ...overrides,
   };
 }
 
 const hearing = item({
-  id: "hearing:c1", kind: "case_hearing", event_type: "hearing", title: "Duruşma - Sözleşmenin Feshi Davası",
+  id: "event:h1", event_type: "hearing", title: "Duruşma - Sözleşmenin Feshi Davası",
   date: "2026-10-05", start: null, end: null, all_day: true, case_id: "c1", case_name: "Sözleşmenin Feshi Davası",
-  event_id: null, assignee_id: "u2", assignee_name: "Avukat B", reminder_days: [3, 1], editable: false,
+  event_id: "h1", assignee_id: "u2", assignee_name: "Avukat B", reminder_days: [3, 1],
 });
 const task = item({
   id: "task:t9", kind: "task", event_type: "task", title: "Dilekçe hazırla", date: "2026-09-20", start: null, end: null,
```

Modify `frontend/src/components/__tests__/CalendarViews.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CalendarViews.test.tsx
+++ b/frontend/src/components/__tests__/CalendarViews.test.tsx
@@ -26,6 +26,7 @@ function item(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
     assignee_name: null,
     location: "Büro",
     notes: null,
+    result_note: null,
     reminder_days: [1],
     editable: true,
     ...overrides,
```

Modify `frontend/src/lib/__tests__/api.test.ts`:

```diff
--- a/frontend/src/lib/__tests__/api.test.ts
+++ b/frontend/src/lib/__tests__/api.test.ts
@@ -139,6 +139,23 @@ describe("chat API", () => {
     ]);
   });
 
+  it("loads a case's hearings and records a hearing result", async () => {
+    window.localStorage.setItem("casebridge_token", "valid-token");
+    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
+    global.fetch = fetchMock as unknown as typeof fetch;
+    const { getCaseHearings, recordHearingResult } = await import("@/lib/api");
+    const payload = { result_note: "Bilirkişi atandı.", next_hearing: { starts_at: "2099-01-05T10:00:00", all_day: false } };
+
+    await getCaseHearings("c1");
+    await recordHearingResult("h1", payload);
+
+    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", init?.body ?? null]);
+    expect(calls).toEqual([
+      ["http://localhost:8000/cases/c1/hearings", "GET", null],
+      ["http://localhost:8000/calendar/events/h1/result", "POST", JSON.stringify(payload)],
+    ]);
+  });
+
   it("deleteCalendarEvent accepts a 204 response", async () => {
     const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error("no body"); } });
     global.fetch = fetchMock as unknown as typeof fetch;
```

Modify `frontend/src/lib/__tests__/calendar.test.ts`:

```diff
--- a/frontend/src/lib/__tests__/calendar.test.ts
+++ b/frontend/src/lib/__tests__/calendar.test.ts
@@ -36,6 +36,7 @@ function item(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
     assignee_name: null,
     location: null,
     notes: null,
+    result_note: null,
     reminder_days: [1],
     editable: true,
     ...overrides,
@@ -84,7 +85,7 @@ describe("calendar items", () => {
   });
 
   it("filters by type, assignee, case and 'only mine'", () => {
-    const hearing = item({ id: "h", kind: "case_hearing", event_type: "hearing", case_id: "c1", assignee_id: "u1" });
+    const hearing = item({ id: "h", event_type: "hearing", case_id: "c1", assignee_id: "u1" });
     const task = item({ id: "t", kind: "task", event_type: "task", case_id: "c2", assignee_id: "u2" });
     const meeting = item({ id: "m", assignee_id: null });
     const all = [hearing, task, meeting];
```

Create `frontend/src/lib/__tests__/hearings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  EMPTY_HEARING_FORM,
  buildHearingFields,
  hasHearingErrors,
  hearingFormFromHearing,
  hearingWhen,
  nextHearing,
  splitHearings,
  validateHearingForm,
  validateResultNote,
} from "@/lib/hearings";
import type { CaseHearing } from "@/types";

function hearing(overrides: Partial<CaseHearing> = {}): CaseHearing {
  return {
    id: "h1", starts_at: "2099-01-05T10:30:00", all_day: false, duration_minutes: 45, location: "3. Asliye Hukuk",
    notes: "Tanık dinlenecek", assignee_id: null, result_note: null, is_past: false, result_open: false, ...overrides,
  };
}

describe("hearing form rules", () => {
  it("requires a date, and a time and valid duration unless the hearing is all day", () => {
    expect(validateHearingForm(EMPTY_HEARING_FORM)).toEqual({ date: "Tarih zorunludur." });
    expect(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05", time: "" })).toEqual({ time: "Saat zorunludur." });
    expect(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05", duration: "4" })).toEqual({
      duration: "Süre 5 ile 1440 dakika arasında olmalıdır.",
    });
    expect(hasHearingErrors(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05" }))).toBe(false);
    expect(validateHearingForm({ ...EMPTY_HEARING_FORM, date: "2099-01-05", all_day: true, time: "", duration: "" })).toEqual({});
  });

  it("builds naive local datetimes and trims optional text", () => {
    expect(buildHearingFields({ date: "2099-01-05", time: "14:30", all_day: false, duration: "90", location: " Salon 2 ", notes: " " })).toEqual({
      starts_at: "2099-01-05T14:30:00", all_day: false, duration_minutes: 90, location: "Salon 2", notes: null,
    });
    expect(buildHearingFields({ ...EMPTY_HEARING_FORM, date: "2099-01-05", all_day: true }).starts_at).toBe("2099-01-05T00:00:00");
  });

  it("fills the edit form from a hearing", () => {
    expect(hearingFormFromHearing(hearing())).toEqual({
      date: "2099-01-05", time: "10:30", all_day: false, duration: "45", location: "3. Asliye Hukuk", notes: "Tanık dinlenecek",
    });
    expect(hearingFormFromHearing(hearing({ all_day: true, starts_at: "2099-01-05T00:00:00" })).time).toBe("09:00");
  });
});

describe("hearing display and result rules", () => {
  it("shows date and time, or 'Tüm gün'", () => {
    expect(hearingWhen(hearing())).toBe("05.01.2099 · 10:30");
    expect(hearingWhen(hearing({ all_day: true, starts_at: "2099-01-05T00:00:00" }))).toBe("05.01.2099 · Tüm gün");
  });

  it("requires a trimmed result note of at most 4000 characters", () => {
    expect(validateResultNote("   ")).toBe("Sonuç notu gerekli.");
    expect(validateResultNote("a".repeat(4001))).toBe("En fazla 4000 karakter olabilir.");
    expect(validateResultNote(" Ara karar verildi. ")).toBeUndefined();
  });

  it("splits upcoming (earliest first) from past (latest first) and picks the next hearing", () => {
    const a = hearing({ id: "a", starts_at: "2099-03-01T10:00:00" });
    const b = hearing({ id: "b", starts_at: "2099-02-01T10:00:00" });
    const c = hearing({ id: "c", starts_at: "2001-01-01T10:00:00", is_past: true });
    const d = hearing({ id: "d", starts_at: "2002-01-01T10:00:00", is_past: true });
    const { upcoming, past } = splitHearings([a, c, b, d]);
    expect(upcoming.map((h) => h.id)).toEqual(["b", "a"]);
    expect(past.map((h) => h.id)).toEqual(["d", "c"]);
    expect(nextHearing([a, c, b])?.id).toBe("b");
    expect(nextHearing([c])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/lib/__tests__/hearings.test.ts src/lib/__tests__/api.test.ts src/components/__tests__/CalendarEventDrawer.test.tsx
```

Expected: FAIL —

```text
FAIL  src/lib/__tests__/hearings.test.ts
Error: Failed to resolve import "@/lib/hearings" from "src/lib/__tests__/hearings.test.ts". Does the file exist?
FAIL  src/lib/__tests__/api.test.ts > chat API > loads a case's hearings and records a hearing result
TypeError: getCaseHearings is not a function
FAIL  src/components/__tests__/CalendarEventDrawer.test.tsx > CalendarEventDrawer > shows the hearing result row only when a result note exists
Error: expect(element).toHaveTextContent()
 Test Files  3 failed (3)
      Tests  2 failed | 18 passed (20)
```

- [ ] **Step 3: Implement**


Modify `frontend/src/components/UpcomingNotifications.tsx`:

```diff
--- a/frontend/src/components/UpcomingNotifications.tsx
+++ b/frontend/src/components/UpcomingNotifications.tsx
@@ -26,7 +26,7 @@ export function taskToCalendarItem(task: TaskWithCase & { due_date: string }): C
     id: `task:${task.id}`, kind: "task", event_type: "task", title: task.title, date: task.due_date,
     start: null, end: null, all_day: true, case_id: task.case_id, case_name: task.case_name,
     task_id: task.id, event_id: null, assignee_id: task.assigned_to ?? null, assignee_name: null,
-    location: null, notes: null, reminder_days: task.reminder_days ?? [1], editable: false,
+    location: null, notes: null, result_note: null, reminder_days: task.reminder_days ?? [1], editable: false,
   };
 }
 
```

Modify `frontend/src/components/calendar/CalendarEventDrawer.tsx`:

```diff
--- a/frontend/src/components/calendar/CalendarEventDrawer.tsx
+++ b/frontend/src/components/calendar/CalendarEventDrawer.tsx
@@ -163,16 +163,16 @@ export function CalendarEventDrawer({
                 <dd className="whitespace-pre-wrap text-navy-800">{item.notes}</dd>
               </>
             )}
+            {item.result_note && (
+              <>
+                <dt className="text-navy-500">Sonuç</dt>
+                <dd className="whitespace-pre-wrap text-navy-800">{item.result_note}</dd>
+              </>
+            )}
             <dt className="text-navy-500">Hatırlatmalar</dt>
             <dd className="text-navy-800">{describeReminders(item.reminder_days)}</dd>
           </dl>
 
-          {item.kind === "case_hearing" && (
-            <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-navy-600">
-              Dava duruşmalarında varsayılan hatırlatma: 3 gün ve 1 gün önce, davanın sorumlu avukatına e-posta.
-            </p>
-          )}
-
           {editingReminders && (
             <div className="space-y-3 rounded-xl border border-surface-border p-3">
               <ReminderPicker value={reminders} onChange={setReminders} legend="Hatırlatmaları değiştir" />
@@ -242,11 +242,6 @@ export function CalendarEventDrawer({
               )}
             </>
           )}
-          {item.kind === "case_hearing" && item.case_id && (
-            <Link href={caseDetailHref(item.case_id)} className={PRIMARY_BUTTON}>
-              Davayı aç
-            </Link>
-          )}
         </div>
       </div>
     </div>
```

Modify `frontend/src/lib/api.ts`:

```diff
--- a/frontend/src/lib/api.ts
+++ b/frontend/src/lib/api.ts
@@ -25,6 +25,9 @@ import type {
   CalendarEvent,
   CalendarEventPayload,
   CalendarEventRecord,
+  CaseHearing,
+  HearingResultPayload,
+  HearingResultResponse,
   NotificationStatus,
   TestEmailResult,
   AIStatus,
@@ -480,6 +483,19 @@ export async function deleteCalendarEvent(id: string): Promise<void> {
   return request(`/calendar/events/${id}`, { method: "DELETE" });
 }
 
+/** Every hearing of the case, earliest first. */
+export async function getCaseHearings(caseId: string): Promise<CaseHearing[]> {
+  return request(`/cases/${caseId}/hearings`);
+}
+
+/** The note after a hearing, with an optional next hearing (one request, one transaction). */
+export async function recordHearingResult(
+  eventId: string,
+  payload: HearingResultPayload,
+): Promise<HearingResultResponse> {
+  return request(`/calendar/events/${eventId}/result`, { method: "POST", body: JSON.stringify(payload) });
+}
+
 /** null resets the task to the default reminder (1 day before). */
 export async function updateTaskReminders(taskId: string, reminderDays: number[] | null): Promise<Task> {
   return request(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ reminder_days: reminderDays }) });
```

Create `frontend/src/lib/hearings.ts`:

```ts
/** Form rules and display helpers of the case page's "Duruşmalar" card. Dates are
 * "YYYY-MM-DD" strings and times "HH:MM" in the application's local time (the API sends and
 * stores naive local datetimes). */
import { formatDate } from "@/lib/labels";
import type { CaseHearing, HearingFields } from "@/types";

export const HEARING_TITLE = "Duruşma";
export const ALL_DAY_LABEL = "Tüm gün";
export const MAX_RESULT_NOTE = 4000;

export interface HearingFormState {
  date: string;
  time: string;
  all_day: boolean;
  duration: string;
  location: string;
  notes: string;
}

export interface HearingFormErrors {
  date?: string;
  time?: string;
  duration?: string;
}

export const EMPTY_HEARING_FORM: HearingFormState = {
  date: "",
  time: "09:00",
  all_day: false,
  duration: "60",
  location: "",
  notes: "",
};

export function hearingDay(hearing: Pick<CaseHearing, "starts_at">): string {
  return hearing.starts_at.slice(0, 10);
}

export function hearingTime(hearing: Pick<CaseHearing, "starts_at" | "all_day">): string {
  return hearing.all_day ? ALL_DAY_LABEL : hearing.starts_at.slice(11, 16);
}

/** "12.10.2026 · 14:30" or "12.10.2026 · Tüm gün". */
export function hearingWhen(hearing: Pick<CaseHearing, "starts_at" | "all_day">): string {
  return `${formatDate(hearingDay(hearing))} · ${hearingTime(hearing)}`;
}

export function hearingFormFromHearing(hearing: CaseHearing): HearingFormState {
  return {
    date: hearingDay(hearing),
    time: hearing.all_day ? EMPTY_HEARING_FORM.time : hearing.starts_at.slice(11, 16),
    all_day: hearing.all_day,
    duration: String(hearing.duration_minutes),
    location: hearing.location ?? "",
    notes: hearing.notes ?? "",
  };
}

/** The same rules as the calendar's event form. */
export function validateHearingForm(form: HearingFormState): HearingFormErrors {
  const errors: HearingFormErrors = {};
  if (!form.date) errors.date = "Tarih zorunludur.";
  if (!form.all_day && !form.time) errors.time = "Saat zorunludur.";
  const minutes = Number(form.duration);
  if (!form.all_day && (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)) {
    errors.duration = "Süre 5 ile 1440 dakika arasında olmalıdır.";
  }
  return errors;
}

export function hasHearingErrors(errors: HearingFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Only call with a form that passed validateHearingForm. */
export function buildHearingFields(form: HearingFormState): HearingFields {
  const minutes = Number(form.duration);
  return {
    starts_at: `${form.date}T${form.all_day ? "00:00" : form.time}:00`,
    all_day: form.all_day,
    duration_minutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 60,
    location: form.location.trim() || null,
    notes: form.notes.trim() || null,
  };
}

/** The note after a hearing: required, trimmed, at most 4000 characters. */
export function validateResultNote(note: string): string | undefined {
  const trimmed = note.trim();
  if (!trimmed) return "Sonuç notu gerekli.";
  if (trimmed.length > MAX_RESULT_NOTE) return `En fazla ${MAX_RESULT_NOTE} karakter olabilir.`;
  return undefined;
}

/** "Yaklaşan": not past, earliest first; "Geçmiş": past, latest first. */
export function splitHearings(hearings: CaseHearing[]): { upcoming: CaseHearing[]; past: CaseHearing[] } {
  const byStart = (a: CaseHearing, b: CaseHearing) => a.starts_at.localeCompare(b.starts_at);
  return {
    upcoming: hearings.filter((h) => !h.is_past).sort(byStart),
    past: hearings.filter((h) => h.is_past).sort((a, b) => byStart(b, a)),
  };
}

/** The case overview's "Sonraki Duruşma": the earliest hearing that is not past. */
export function nextHearing(hearings: CaseHearing[]): CaseHearing | null {
  return splitHearings(hearings).upcoming[0] ?? null;
}
```

Modify `frontend/src/types/index.ts`:

```diff
--- a/frontend/src/types/index.ts
+++ b/frontend/src/types/index.ts
@@ -185,11 +185,11 @@ export interface ActivityItem {
 }
 
 export type CalendarEventType = "hearing" | "meeting" | "client_meeting" | "other";
-export type CalendarItemKind = "event" | "task" | "case_hearing";
+export type CalendarItemKind = "event" | "task";
 
-/** One row of GET /calendar: a calendar event, a pending task's due date or a case hearing. */
+/** One row of GET /calendar: a calendar event (a case hearing is one) or a pending task's due date. */
 export interface CalendarEvent {
-  id: string; // "event:<id>" | "task:<id>" | "hearing:<case_id>"
+  id: string; // "event:<id>" | "task:<id>"
   kind: CalendarItemKind;
   event_type: CalendarEventType | "task";
   title: string;
@@ -206,6 +206,8 @@ export interface CalendarEvent {
   location: string | null;
   notes: string | null;
   reminder_days: number[];
+  /** The note written after a hearing; null for every other item. */
+  result_note: string | null;
   editable: boolean;
 }
 
@@ -223,10 +225,51 @@ export interface CalendarEventRecord {
   assignee_id: string | null;
   created_by: string;
   reminder_days: number[];
+  result_note: string | null;
   created_at: string;
   updated_at: string;
 }
 
+/** One hearing of a case (GET /cases/{id}/hearings). `is_past`: before today's local date;
+ * `result_open`: today or earlier, so a result may be entered. */
+export interface CaseHearing {
+  id: string;
+  starts_at: string; // naive local "YYYY-MM-DDTHH:MM:SS"; midnight for an all-day hearing
+  all_day: boolean;
+  duration_minutes: number;
+  location: string | null;
+  notes: string | null;
+  assignee_id: string | null;
+  result_note: string | null;
+  is_past: boolean;
+  result_open: boolean;
+}
+
+/** What is stored when a hearing is added or edited from the case page. */
+export interface HearingFields {
+  starts_at: string;
+  all_day: boolean;
+  duration_minutes: number;
+  location: string | null;
+  notes: string | null;
+}
+
+export interface HearingResultPayload {
+  result_note: string;
+  next_hearing?: {
+    starts_at: string;
+    all_day: boolean;
+    duration_minutes?: number;
+    location?: string | null;
+    notes?: string | null;
+  };
+}
+
+export interface HearingResultResponse {
+  hearing: CaseHearing;
+  next_hearing: CaseHearing | null;
+}
+
 export interface CalendarEventPayload {
   title: string;
   event_type: CalendarEventType;
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/lib/__tests__ src/components/__tests__/CalendarEventDrawer.test.tsx src/components/__tests__/CalendarEventForm.test.tsx src/components/__tests__/CalendarView.test.tsx src/components/__tests__/CalendarViews.test.tsx
```

Expected: PASS —

```text
Test Files  18 passed (18)
Tests  165 passed (165)
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS — no output (the fixtures now have `result_note` and no `case_hearing`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/UpcomingNotifications.tsx frontend/src/components/__tests__/CalendarEventDrawer.test.tsx frontend/src/components/__tests__/CalendarEventForm.test.tsx frontend/src/components/__tests__/CalendarView.test.tsx frontend/src/components/__tests__/CalendarViews.test.tsx frontend/src/components/calendar/CalendarEventDrawer.tsx frontend/src/lib/__tests__/api.test.ts frontend/src/lib/__tests__/calendar.test.ts frontend/src/lib/__tests__/hearings.test.ts frontend/src/lib/api.ts frontend/src/lib/hearings.ts frontend/src/types/index.ts
git commit -F - <<'EOF'
feat: hearing types, API calls, form rules and drawer result row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 8: Duruşmalar card with the add / edit, result and delete dialogs

The three components, tested through the card. A closed case hides `Duruşma ekle` and `Sonraki duruşmayı ekle`; an archived case shows the card without any button.

**Files:**
- Create: `frontend/src/components/CaseHearingFormModal.tsx`
- Create: `frontend/src/components/CaseHearingResultModal.tsx`
- Create: `frontend/src/components/CaseHearingsCard.tsx`
- Test (create): `frontend/src/components/__tests__/CaseHearings.test.tsx`

**Interfaces:**
- Consumes: Task 7's helpers, `createCalendarEvent` / `updateCalendarEvent` / `deleteCalendarEvent` / `recordHearingResult`, `DEFAULT_REMINDER_DAYS`, `ModalFrame`, `CaseConfirmModal`, `userMessage`.
- Produces: `CaseHearingsCard({caseDetail: {id, assigned_lawyer_id, status}, hearings, readOnly, onChanged})` (section `id="durusmalar"`, region name `Duruşmalar`), `CaseHearingFormModal({caseDetail, hearing?, onClose, onSaved})`, `CaseHearingResultModal({hearing, canAddNext, onClose, onSaved})`.

- [ ] **Step 1: Write the failing tests**


Create `frontend/src/components/__tests__/CaseHearings.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();
const deleteCalendarEvent = vi.fn();
const recordHearingResult = vi.fn();

vi.mock("@/lib/api", () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEvent(...args),
  recordHearingResult: (...args: unknown[]) => recordHearingResult(...args),
}));

import { CaseHearingsCard } from "@/components/CaseHearingsCard";
import { ApiError } from "@/lib/apiError";
import type { CaseHearing } from "@/types";

function hearing(overrides: Partial<CaseHearing> = {}): CaseHearing {
  return {
    id: "h1", starts_at: "2099-01-05T10:30:00", all_day: false, duration_minutes: 60, location: "3. Asliye Hukuk",
    notes: null, assignee_id: "u1", result_note: null, is_past: false, result_open: false, ...overrides,
  };
}
const upcoming = hearing();
const pastNoResult = hearing({ id: "h2", starts_at: "2001-02-03T00:00:00", all_day: true, location: null, is_past: true, result_open: true });
const pastWithResult = hearing({ id: "h3", starts_at: "2002-02-03T09:00:00", is_past: true, result_open: true, result_note: "Bilirkişi atandı." });
const today = hearing({ id: "h4", starts_at: "2003-04-05T09:00:00", is_past: false, result_open: true });
const open = { id: "c1", assigned_lawyer_id: "u1", status: "devam_eden" as const };

const onChanged = vi.fn();
function renderCard(props: Partial<React.ComponentProps<typeof CaseHearingsCard>> = {}) {
  return render(<CaseHearingsCard caseDetail={open} hearings={[upcoming, pastNoResult, pastWithResult]} readOnly={false} onChanged={onChanged} {...props} />);
}

beforeEach(() => {
  [createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, recordHearingResult, onChanged].forEach((fn) => fn.mockReset());
});

describe("CaseHearingsCard", () => {
  it("lists upcoming and past hearings with time, place and result", () => {
    renderCard();
    const card = screen.getByRole("region", { name: "Duruşmalar" });
    expect(card).toHaveAttribute("id", "durusmalar");
    expect(card).toHaveTextContent("Yaklaşan");
    expect(card).toHaveTextContent("05.01.2099 · 10:30");
    expect(card).toHaveTextContent("3. Asliye Hukuk");
    expect(card).toHaveTextContent("Geçmiş");
    expect(card).toHaveTextContent("03.02.2001 · Tüm gün");
    expect(card).toHaveTextContent("Sonuç girilmedi");
    expect(card).toHaveTextContent("Sonuç: Bilirkişi atandı.");
  });

  it("shows an empty state", () => {
    renderCard({ hearings: [] });
    expect(screen.getByText("Henüz duruşma yok.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duruşma ekle" })).toBeInTheDocument();
  });

  it("offers the result button only once the hearing day has come", () => {
    renderCard({ hearings: [upcoming, today, pastWithResult] });
    expect(screen.getAllByRole("button", { name: "Sonuç gir" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sonucu düzenle" })).toHaveLength(1);
  });

  it("hides every action on an archived case", () => {
    renderCard({ readOnly: true });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Duruşmalar" })).toHaveTextContent("05.01.2099 · 10:30");
  });

  it("hides 'Duruşma ekle' and the next-hearing option on a closed case but keeps edit, delete and result", async () => {
    renderCard({ caseDetail: { ...open, status: "kapali" } });
    expect(screen.queryByRole("button", { name: "Duruşma ekle" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Düzenle" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sil" }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("button", { name: "Sonuç gir" })[0]);
    expect(screen.getByRole("dialog", { name: "Sonuç gir" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Sonraki duruşmayı ekle")).not.toBeInTheDocument();
  });

  it("adds a hearing for the case with the lawyer as assignee and the default reminders", async () => {
    createCalendarEvent.mockResolvedValue({ id: "new" });
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Duruşma ekle" }));
    const dialog = screen.getByRole("dialog", { name: "Duruşma ekle" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Tarih zorunludur.")).toBeInTheDocument();
    expect(createCalendarEvent).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Tarih"), "2099-03-04");
    await userEvent.clear(within(dialog).getByLabelText("Saat"));
    await userEvent.type(within(dialog).getByLabelText("Saat"), "14:15");
    await userEvent.type(within(dialog).getByLabelText("Salon / yer"), " Salon 5 ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createCalendarEvent).toHaveBeenCalledTimes(1));
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Duruşma", event_type: "hearing", case_id: "c1", assignee_id: "u1", reminder_days: [3, 1],
      starts_at: "2099-03-04T14:15:00", all_day: false, duration_minutes: 60, location: "Salon 5", notes: null,
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits a hearing and shows only the API message, or the Turkish fallback", async () => {
    updateCalendarEvent.mockRejectedValueOnce(new ApiError("Arşivli davada değişiklik yapılamaz.", 409));
    updateCalendarEvent.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Düzenle" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşmayı düzenle" });
    expect(within(dialog).getByLabelText("Tarih")).toHaveValue("2099-01-05");
    expect(within(dialog).getByLabelText("Saat")).toHaveValue("10:30");

    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Arşivli davada değişiklik yapılamaz.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Duruşma kaydedilemedi. Lütfen tekrar deneyin."));
    expect(updateCalendarEvent).toHaveBeenCalledWith("h1", expect.objectContaining({ starts_at: "2099-01-05T10:30:00", all_day: false }));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ignores a second click while saving", async () => {
    let finish: (value: unknown) => void = () => undefined;
    updateCalendarEvent.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Düzenle" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşmayı düzenle" });
    const save = within(dialog).getByRole("button", { name: "Kaydet" });
    await userEvent.click(save);
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydediliyor..." }));
    expect(updateCalendarEvent).toHaveBeenCalledTimes(1);
    finish({});
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("deletes a hearing after confirmation", async () => {
    deleteCalendarEvent.mockResolvedValue(undefined);
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Sil" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşma silinsin mi?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));

    await waitFor(() => expect(deleteCalendarEvent).toHaveBeenCalledWith("h1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("keeps the delete dialog open with the fallback message when deleting fails", async () => {
    deleteCalendarEvent.mockRejectedValue(new Error("x"));
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Sil" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşma silinsin mi?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Duruşma silinemedi. Lütfen tekrar deneyin.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("CaseHearingResultModal (through the card)", () => {
  async function openResult(index = 0) {
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Sonuç gir" })[index]);
    return screen.getByRole("dialog", { name: "Sonuç gir" });
  }

  it("requires a note before saving", async () => {
    const dialog = await openResult();
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Sonuç notu gerekli.")).toBeInTheDocument();
    expect(recordHearingResult).not.toHaveBeenCalled();
  });

  it("saves the trimmed note alone", async () => {
    recordHearingResult.mockResolvedValue({ hearing: pastNoResult, next_hearing: null });
    const dialog = await openResult();
    await userEvent.type(within(dialog).getByLabelText("Sonuç / ara karar notu"), "  Bilirkişi atandı.  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(recordHearingResult).toHaveBeenCalledWith("h2", { result_note: "Bilirkişi atandı." }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("adds the next hearing in the same request, validating its date", async () => {
    recordHearingResult.mockResolvedValue({ hearing: pastNoResult, next_hearing: upcoming });
    const dialog = await openResult();
    await userEvent.type(within(dialog).getByLabelText("Sonuç / ara karar notu"), "Ertelendi.");
    await userEvent.click(within(dialog).getByLabelText("Sonraki duruşmayı ekle"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Tarih zorunludur.")).toBeInTheDocument();
    expect(recordHearingResult).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Tarih"), "2099-06-01");
    await userEvent.click(within(dialog).getByLabelText("Tüm gün"));
    await userEvent.type(within(dialog).getByLabelText("Salon / yer"), "Salon 2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(recordHearingResult).toHaveBeenCalledWith("h2", {
      result_note: "Ertelendi.",
      next_hearing: { starts_at: "2099-06-01T00:00:00", all_day: true, duration_minutes: 60, location: "Salon 2" },
    }));
  });

  it("shows the API message or the Turkish fallback when saving fails", async () => {
    recordHearingResult.mockRejectedValueOnce(new ApiError("Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir.", 422));
    recordHearingResult.mockRejectedValueOnce(new Error("boom"));
    const dialog = await openResult();
    await userEvent.type(within(dialog).getByLabelText("Sonuç / ara karar notu"), "Not");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Sonuç kaydedilemedi. Lütfen tekrar deneyin."));
  });

  it("prefills the existing note when editing a result", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Sonucu düzenle" }));
    const dialog = screen.getByRole("dialog", { name: "Sonucu düzenle" });
    expect(within(dialog).getByLabelText("Sonuç / ara karar notu")).toHaveValue("Bilirkişi atandı.");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseHearings.test.tsx
```

Expected: FAIL —

```text
FAIL  src/components/__tests__/CaseHearings.test.tsx
Error: Failed to resolve import "@/components/CaseHearingsCard" from "src/components/__tests__/CaseHearings.test.tsx". Does the file exist?
```

- [ ] **Step 3: Implement**


Create `frontend/src/components/CaseHearingFormModal.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { createCalendarEvent, updateCalendarEvent } from "@/lib/api";
import { DEFAULT_REMINDER_DAYS } from "@/lib/calendar";
import {
  EMPTY_HEARING_FORM,
  HEARING_TITLE,
  buildHearingFields,
  hasHearingErrors,
  hearingFormFromHearing,
  validateHearingForm,
  type HearingFormState,
} from "@/lib/hearings";
import { userMessage } from "@/lib/userMessages";
import type { Case, CaseHearing } from "@/types";
import { ModalFrame } from "@/components/ModalFrame";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";

interface Props {
  caseDetail: Pick<Case, "id" | "assigned_lawyer_id">;
  /** The hearing being edited; absent when adding. */
  hearing?: CaseHearing;
  onClose: () => void;
  /** Called after the hearing is stored; the caller reloads the hearings and the case. */
  onSaved: () => void;
}

/** "Duruşma ekle" / "Duruşmayı düzenle": the calendar event form's fields for a hearing of this case. */
export function CaseHearingFormModal({ caseDetail, hearing, onClose, onSaved }: Props) {
  const [form, setForm] = useState<HearingFormState>(() => (hearing ? hearingFormFromHearing(hearing) : EMPTY_HEARING_FORM));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateHearingForm(form);

  function setField<K extends keyof HearingFormState>(field: K, value: HearingFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (inFlight.current) return;
    if (hasHearingErrors(errors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const fields = buildHearingFields(form);
      if (hearing) {
        await updateCalendarEvent(hearing.id, fields);
      } else {
        await createCalendarEvent({
          ...fields,
          title: HEARING_TITLE,
          event_type: "hearing",
          case_id: caseDetail.id,
          assignee_id: caseDetail.assigned_lawyer_id,
          reminder_days: DEFAULT_REMINDER_DAYS.hearing,
        });
      }
      onSaved();
    } catch (err) {
      setError(userMessage(err, "Duruşma kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const shown = showErrors ? errors : {};
  return (
    <ModalFrame title={hearing ? "Duruşmayı düzenle" : "Duruşma ekle"} onClose={onClose} busy={saving}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <div>
          <label htmlFor="hearing-date" className={LABEL}>Tarih</label>
          <input id="hearing-date" type="date" data-autofocus value={form.date} onChange={(e) => setField("date", e.target.value)} className={INPUT} />
          {shown.date && <p className="mt-1 text-xs text-red-600">{shown.date}</p>}
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-navy-700">
          <input type="checkbox" checked={form.all_day} onChange={(e) => setField("all_day", e.target.checked)} className="h-4 w-4 accent-accent-600" />
          Tüm gün
        </label>
        <div>
          <label htmlFor="hearing-time" className={LABEL}>Saat</label>
          <input id="hearing-time" type="time" value={form.time} disabled={form.all_day} onChange={(e) => setField("time", e.target.value)} className={INPUT} />
          {shown.time && <p className="mt-1 text-xs text-red-600">{shown.time}</p>}
        </div>
        <div>
          <label htmlFor="hearing-duration" className={LABEL}>Süre (dakika)</label>
          <input
            id="hearing-duration"
            type="number"
            min={5}
            max={1440}
            step={5}
            value={form.duration}
            disabled={form.all_day}
            onChange={(e) => setField("duration", e.target.value)}
            className={INPUT}
          />
          {shown.duration && <p className="mt-1 text-xs text-red-600">{shown.duration}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hearing-location" className={LABEL}>Salon / yer</label>
          <input id="hearing-location" value={form.location} maxLength={200} onChange={(e) => setField("location", e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hearing-notes" className={LABEL}>Not</label>
          <textarea id="hearing-notes" rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className={INPUT} />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
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
```

Create `frontend/src/components/CaseHearingResultModal.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { recordHearingResult } from "@/lib/api";
import {
  EMPTY_HEARING_FORM,
  MAX_RESULT_NOTE,
  buildHearingFields,
  hasHearingErrors,
  hearingWhen,
  validateHearingForm,
  validateResultNote,
  type HearingFormState,
} from "@/lib/hearings";
import { userMessage } from "@/lib/userMessages";
import type { CaseHearing, HearingResultPayload } from "@/types";
import { ModalFrame } from "@/components/ModalFrame";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";

interface Props {
  hearing: CaseHearing;
  /** A closed case can take a result note but no further hearing. */
  canAddNext: boolean;
  onClose: () => void;
  /** Called after the result is stored; the caller reloads the hearings and the case. */
  onSaved: () => void;
}

/** "Sonuç gir" / "Sonucu düzenle": the note after a hearing and, optionally, the next hearing. */
export function CaseHearingResultModal({ hearing, canAddNext, onClose, onSaved }: Props) {
  const [note, setNote] = useState(hearing.result_note ?? "");
  const [addNext, setAddNext] = useState(false);
  const [next, setNext] = useState<HearingFormState>(EMPTY_HEARING_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const noteError = validateResultNote(note);
  const nextErrors = addNext ? validateHearingForm(next) : {};

  function setField<K extends keyof HearingFormState>(field: K, value: HearingFormState[K]) {
    setNext((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (inFlight.current) return;
    if (noteError || hasHearingErrors(nextErrors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload: HearingResultPayload = { result_note: note.trim() };
      if (addNext) {
        const fields = buildHearingFields(next);
        payload.next_hearing = {
          starts_at: fields.starts_at,
          all_day: fields.all_day,
          duration_minutes: fields.duration_minutes,
          location: fields.location,
        };
      }
      await recordHearingResult(hearing.id, payload);
      onSaved();
    } catch (err) {
      setError(userMessage(err, "Sonuç kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={hearing.result_note ? "Sonucu düzenle" : "Sonuç gir"} onClose={onClose} busy={saving}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-navy-600">Duruşma: {hearingWhen(hearing)}</p>
        <div>
          <label htmlFor="result-note" className={LABEL}>Sonuç / ara karar notu</label>
          <textarea
            id="result-note"
            data-autofocus
            rows={5}
            value={note}
            maxLength={MAX_RESULT_NOTE + 1}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT}
          />
          {showErrors && noteError && <p className="mt-1 text-xs text-red-600">{noteError}</p>}
        </div>
        {canAddNext && (
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" checked={addNext} onChange={(e) => setAddNext(e.target.checked)} className="h-4 w-4 accent-accent-600" />
            Sonraki duruşmayı ekle
          </label>
        )}
        {canAddNext && addNext && (
          <div className="grid gap-3 rounded-xl border border-surface-border p-3 sm:grid-cols-2">
            <div>
              <label htmlFor="next-date" className={LABEL}>Tarih</label>
              <input id="next-date" type="date" value={next.date} onChange={(e) => setField("date", e.target.value)} className={INPUT} />
              {showErrors && nextErrors.date && <p className="mt-1 text-xs text-red-600">{nextErrors.date}</p>}
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-navy-700">
              <input type="checkbox" checked={next.all_day} onChange={(e) => setField("all_day", e.target.checked)} className="h-4 w-4 accent-accent-600" />
              Tüm gün
            </label>
            <div>
              <label htmlFor="next-time" className={LABEL}>Saat</label>
              <input id="next-time" type="time" value={next.time} disabled={next.all_day} onChange={(e) => setField("time", e.target.value)} className={INPUT} />
              {showErrors && nextErrors.time && <p className="mt-1 text-xs text-red-600">{nextErrors.time}</p>}
            </div>
            <div>
              <label htmlFor="next-location" className={LABEL}>Salon / yer</label>
              <input id="next-location" value={next.location} maxLength={200} onChange={(e) => setField("location", e.target.value)} className={INPUT} />
            </div>
          </div>
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
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
```

Create `frontend/src/components/CaseHearingsCard.tsx`:

```tsx
"use client";

import { useState } from "react";

import { deleteCalendarEvent } from "@/lib/api";
import { hearingWhen, splitHearings } from "@/lib/hearings";
import type { Case, CaseHearing } from "@/types";
import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { CaseHearingFormModal } from "@/components/CaseHearingFormModal";
import { CaseHearingResultModal } from "@/components/CaseHearingResultModal";

type Dialog = { kind: "add" } | { kind: "edit" | "result" | "delete"; hearing: CaseHearing } | null;

interface Props {
  caseDetail: Pick<Case, "id" | "assigned_lawyer_id" | "status">;
  hearings: CaseHearing[];
  /** An archived case is read-only. */
  readOnly: boolean;
  /** Reload the hearings and the case after any change. */
  onChanged: () => void;
}

const SMALL_BUTTON = "text-xs font-semibold text-accent-700 hover:underline";

/** "Duruşmalar": upcoming and past hearings of the case with add / edit / delete / result actions. */
export function CaseHearingsCard({ caseDetail, hearings, readOnly, onChanged }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const closed = caseDetail.status === "kapali";
  const { upcoming, past } = splitHearings(hearings);

  function saved() {
    setDialog(null);
    onChanged();
  }

  function row(hearing: CaseHearing) {
    return (
      <li key={hearing.id} className="space-y-1 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-navy-800">{hearingWhen(hearing)}</p>
          {!readOnly && (
            <div className="flex gap-3">
              {hearing.result_open && (
                <button type="button" onClick={() => setDialog({ kind: "result", hearing })} className={SMALL_BUTTON}>
                  {hearing.result_note ? "Sonucu düzenle" : "Sonuç gir"}
                </button>
              )}
              <button type="button" onClick={() => setDialog({ kind: "edit", hearing })} className={SMALL_BUTTON}>Düzenle</button>
              <button type="button" onClick={() => setDialog({ kind: "delete", hearing })} className={SMALL_BUTTON}>Sil</button>
            </div>
          )}
        </div>
        {hearing.location && <p className="text-xs text-navy-600">{hearing.location}</p>}
        {hearing.notes && <p className="whitespace-pre-wrap text-xs text-navy-500">{hearing.notes}</p>}
        {hearing.is_past && (
          <p className="whitespace-pre-wrap text-xs text-navy-700">
            {hearing.result_note ? `Sonuç: ${hearing.result_note}` : "Sonuç girilmedi"}
          </p>
        )}
      </li>
    );
  }

  return (
    <section id="durusmalar" aria-labelledby="durusmalar-baslik" className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
      <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
        <h2 id="durusmalar-baslik" className="text-sm font-semibold text-navy-800">Duruşmalar</h2>
        {!readOnly && !closed && (
          <button type="button" onClick={() => setDialog({ kind: "add" })} className="text-xs font-semibold text-accent-700 hover:underline">
            Duruşma ekle
          </button>
        )}
      </header>
      {hearings.length === 0 ? (
        <p className="p-4 text-sm text-navy-500">Henüz duruşma yok.</p>
      ) : (
        <div className="divide-y divide-surface-border">
          {upcoming.length > 0 && (
            <div>
              <h3 className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-navy-400">Yaklaşan</h3>
              <ul className="divide-y divide-surface-border">{upcoming.map(row)}</ul>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-navy-400">Geçmiş</h3>
              <ul className="divide-y divide-surface-border">{past.map(row)}</ul>
            </div>
          )}
        </div>
      )}

      {dialog?.kind === "add" && <CaseHearingFormModal caseDetail={caseDetail} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "edit" && (
        <CaseHearingFormModal caseDetail={caseDetail} hearing={dialog.hearing} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "result" && (
        <CaseHearingResultModal hearing={dialog.hearing} canAddNext={!closed} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "delete" && (
        <CaseConfirmModal
          title="Duruşma silinsin mi?"
          message={`${hearingWhen(dialog.hearing)} tarihli duruşma silinecek.`}
          confirmLabel="Sil"
          fallbackError="Duruşma silinemedi. Lütfen tekrar deneyin."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteCalendarEvent(dialog.hearing.id);
            saved();
          }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseHearings.test.tsx
```

Expected: PASS —

```text
Test Files  1 passed (1)
Tests  15 passed (15)
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS — no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseHearingFormModal.tsx frontend/src/components/CaseHearingResultModal.tsx frontend/src/components/CaseHearingsCard.tsx frontend/src/components/__tests__/CaseHearings.test.tsx
git commit -F - <<'EOF'
feat: hearings card with add, edit, result and delete dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 9: Case page: load the hearings, show the card, Sonraki Duruşma with time

`CaseDetailView` loads the hearings in their own effect (a sequence guard drops stale answers, a failure leaves the page working), renders the card, reloads hearings and case after every change, and shows the next hearing's date and time in the overview, linked to the card. The four older case-page test files get a `getCaseHearings` mock.

**Files:**
- Modify: `frontend/src/components/CaseDetailView.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseDetailActions.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseDetailArchived.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx`
- Test (modify): `frontend/src/components/__tests__/CaseDetailView.test.tsx`

**Interfaces:**
- Consumes: Task 8's card, Task 7's `nextHearing`, `hearingWhen`, `getCaseHearings`.
- Produces: no new exports; the overview field `Sonraki Duruşma` renders `<dd.mm.yyyy> · <HH:MM | Tüm gün>` as a link to `#durusmalar`, falling back to `case.next_hearing_date` when the hearings cannot be loaded.

- [ ] **Step 1: Write the failing tests**


Modify `frontend/src/components/__tests__/CaseDetailActions.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseDetailActions.test.tsx
+++ b/frontend/src/components/__tests__/CaseDetailActions.test.tsx
@@ -10,6 +10,7 @@ const getMe = vi.fn();
 const listSimulations = vi.fn();
 const listDocuments = vi.fn();
 const listCaseTasks = vi.fn();
+const getCaseHearings = vi.fn().mockResolvedValue([]);
 const updateCase = vi.fn();
 const unarchiveCase = vi.fn();
 
@@ -19,6 +20,7 @@ vi.mock("@/lib/api", () => ({
   listSimulations: (...args: unknown[]) => listSimulations(...args),
   listDocuments: (...args: unknown[]) => listDocuments(...args),
   listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
+  getCaseHearings: (...args: unknown[]) => getCaseHearings(...args),
   updateCase: (...args: unknown[]) => updateCase(...args),
   unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
   startSimulation: vi.fn(),
```

Modify `frontend/src/components/__tests__/CaseDetailArchived.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseDetailArchived.test.tsx
+++ b/frontend/src/components/__tests__/CaseDetailArchived.test.tsx
@@ -10,6 +10,7 @@ const getMe = vi.fn();
 const listSimulations = vi.fn();
 const listDocuments = vi.fn();
 const listCaseTasks = vi.fn();
+const getCaseHearings = vi.fn().mockResolvedValue([]);
 const unarchiveCase = vi.fn();
 const updateTaskStatus = vi.fn();
 const addCaseEvent = vi.fn();
@@ -20,6 +21,7 @@ vi.mock("@/lib/api", () => ({
   listSimulations: (...args: unknown[]) => listSimulations(...args),
   listDocuments: (...args: unknown[]) => listDocuments(...args),
   listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
+  getCaseHearings: (...args: unknown[]) => getCaseHearings(...args),
   unarchiveCase: (...args: unknown[]) => unarchiveCase(...args),
   updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
   addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
```

Modify `frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx
+++ b/frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx
@@ -10,6 +10,7 @@ const getMe = vi.fn();
 const listSimulations = vi.fn();
 const listDocuments = vi.fn();
 const listCaseTasks = vi.fn();
+const getCaseHearings = vi.fn().mockResolvedValue([]);
 const closeCase = vi.fn();
 const reopenCase = vi.fn();
 const archiveCase = vi.fn();
@@ -22,6 +23,7 @@ vi.mock("@/lib/api", () => ({
   listSimulations: (...args: unknown[]) => listSimulations(...args),
   listDocuments: (...args: unknown[]) => listDocuments(...args),
   listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
+  getCaseHearings: (...args: unknown[]) => getCaseHearings(...args),
   closeCase: (...args: unknown[]) => closeCase(...args),
   reopenCase: (...args: unknown[]) => reopenCase(...args),
   archiveCase: (...args: unknown[]) => archiveCase(...args),
```

Modify `frontend/src/components/__tests__/CaseDetailView.test.tsx`:

```diff
--- a/frontend/src/components/__tests__/CaseDetailView.test.tsx
+++ b/frontend/src/components/__tests__/CaseDetailView.test.tsx
@@ -16,6 +16,8 @@ const uploadDocument = vi.fn();
 const addCaseEvent = vi.fn();
 const generateHandover = vi.fn();
 const listCaseTasks = vi.fn();
+const getCaseHearings = vi.fn().mockResolvedValue([]);
+const createCalendarEvent = vi.fn();
 const createTask = vi.fn();
 const updateTaskStatus = vi.fn();
 const updateCase = vi.fn();
@@ -32,6 +34,11 @@ vi.mock("@/lib/api", () => ({
   addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
   generateHandover: (...args: unknown[]) => generateHandover(...args),
   listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
+  getCaseHearings: (...args: unknown[]) => getCaseHearings(...args),
+  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
+  deleteCalendarEvent: vi.fn(),
+  updateCalendarEvent: vi.fn(),
+  recordHearingResult: vi.fn(),
   createTask: (...args: unknown[]) => createTask(...args),
   updateTaskStatus: (...args: unknown[]) => updateTaskStatus(...args),
   updateCase: (...args: unknown[]) => updateCase(...args),
@@ -76,6 +83,9 @@ beforeEach(() => {
   updateTaskStatus.mockReset();
   updateCase.mockReset();
   listCaseTasks.mockResolvedValue([]);
+  getCaseHearings.mockReset();
+  getCaseHearings.mockResolvedValue([]);
+  createCalendarEvent.mockReset();
 });
 
 afterEach(() => {
@@ -110,6 +120,54 @@ describe("CaseDetailView", () => {
     expect(screen.getByText("Tazminat hesabını kontrol et.")).toBeInTheDocument();
   });
 
+  it("shows the next hearing with its time in the overview, linked to the Duruşmalar card", async () => {
+    getCase.mockResolvedValue({ ...caseDetail, next_hearing_date: "2099-01-05" });
+    listSimulations.mockResolvedValue([]);
+    listDocuments.mockResolvedValue([]);
+    getCaseHearings.mockResolvedValue([
+      { id: "h1", starts_at: "2099-01-05T10:30:00", all_day: false, duration_minutes: 60, location: "Salon 3", notes: null, assignee_id: null, result_note: null, is_past: false, result_open: false },
+    ]);
+
+    render(<CaseDetailView caseId="c1" />);
+
+    const link = await screen.findByRole("link", { name: "05.01.2099 · 10:30" });
+    expect(link).toHaveAttribute("href", "#durusmalar");
+    expect(screen.getByRole("region", { name: "Duruşmalar" })).toHaveTextContent("Salon 3");
+  });
+
+  it("falls back to the case's next hearing date when the hearings cannot be loaded", async () => {
+    getCase.mockResolvedValue({ ...caseDetail, next_hearing_date: "2099-01-05" });
+    listSimulations.mockResolvedValue([]);
+    listDocuments.mockResolvedValue([]);
+    getCaseHearings.mockRejectedValue(new Error("x"));
+
+    render(<CaseDetailView caseId="c1" />);
+
+    expect(await screen.findByText("05.01.2099")).toBeInTheDocument();
+    expect(screen.getByText("Henüz duruşma yok.")).toBeInTheDocument();
+    expect(screen.queryByText("Dava yüklenemedi. Lütfen daha sonra tekrar deneyin.")).not.toBeInTheDocument();
+  });
+
+  it("reloads the hearings and the case after a hearing is added", async () => {
+    getCase.mockResolvedValue(caseDetail);
+    listSimulations.mockResolvedValue([]);
+    listDocuments.mockResolvedValue([]);
+    createCalendarEvent.mockResolvedValue({ id: "new" });
+
+    render(<CaseDetailView caseId="c1" />);
+    await userEvent.click(await screen.findByRole("button", { name: "Duruşma ekle" }));
+    const dialog = screen.getByRole("dialog", { name: "Duruşma ekle" });
+    await userEvent.type(within(dialog).getByLabelText("Tarih"), "2099-03-04");
+    getCaseHearings.mockResolvedValue([
+      { id: "h9", starts_at: "2099-03-04T09:00:00", all_day: false, duration_minutes: 60, location: null, notes: null, assignee_id: null, result_note: null, is_past: false, result_open: false },
+    ]);
+    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
+
+    expect(await screen.findByRole("link", { name: "04.03.2099 · 09:00" })).toBeInTheDocument();
+    expect(createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ case_id: "c1", event_type: "hearing" }));
+    await waitFor(() => expect(getCase).toHaveBeenCalledTimes(2));
+  });
+
   it("renders the chronological timeline in the Gelişmeler tab", async () => {
     getCase.mockResolvedValue(caseDetail);
     listSimulations.mockResolvedValue([]);
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseDetailView.test.tsx
```

Expected: FAIL —

```text
× CaseDetailView > shows the next hearing with its time in the overview, linked to the Duruşmalar card
× CaseDetailView > falls back to the case's next hearing date when the hearings cannot be loaded
× CaseDetailView > reloads the hearings and the case after a hearing is added
Tests  3 failed | 33 passed (36)
```

- [ ] **Step 3: Implement**


Modify `frontend/src/components/CaseDetailView.tsx`:

```diff
--- a/frontend/src/components/CaseDetailView.tsx
+++ b/frontend/src/components/CaseDetailView.tsx
@@ -8,6 +8,7 @@ import {
   createTask,
   generateHandover,
   getCase,
+  getCaseHearings,
   getMe,
   getSimulation,
   listCaseTasks,
@@ -23,7 +24,8 @@ import {
 import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, SIMULATION_STATUS_LABELS, formatDate } from "@/lib/labels";
 import { parseCaseTab, type CaseTabSlug } from "@/lib/filters";
 import { useUrlParams } from "@/lib/urlState";
-import type { AppUser, Case, CaseDetail, DocumentItem, HandoverReport, Simulation, Task } from "@/types";
+import type { AppUser, Case, CaseDetail, CaseHearing, DocumentItem, HandoverReport, Simulation, Task } from "@/types";
+import { hearingWhen, nextHearing } from "@/lib/hearings";
 import { canManageCase, caseActions, type CaseAction } from "@/lib/caseAccess";
 import { userMessage } from "@/lib/userMessages";
 import { LoadingState } from "@/components/LoadingState";
@@ -42,6 +44,7 @@ import { CaseEditModal } from "@/components/CaseEditModal";
 import { CaseCloseModal, type CloseResult } from "@/components/CaseCloseModal";
 import { CaseConfirmModal } from "@/components/CaseConfirmModal";
 import { CaseDecisionCard } from "@/components/CaseDecisionCard";
+import { CaseHearingsCard } from "@/components/CaseHearingsCard";
 
 const TABS = [
   { slug: "genel", label: "Genel Bakış" },
@@ -86,6 +89,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   const [handoverGenerating, setHandoverGenerating] = useState(false);
   const [handoverError, setHandoverError] = useState<string | null>(null);
   const [tasks, setTasks] = useState<Task[]>([]);
+  const [hearings, setHearings] = useState<CaseHearing[]>([]);
   const [taskForm, setTaskForm] = useState({ title: "", due_date: "" });
   const [addingTask, setAddingTask] = useState(false);
   const [taskError, setTaskError] = useState<string | null>(null);
@@ -99,6 +103,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   const actionInFlight = useRef(false);
   // Reloads after an action may answer out of order; only the latest one is applied.
   const reloadSeq = useRef(0);
+  const hearingsSeq = useRef(0);
   // Set by the new-case page when some events or documents could not be added after the case was created.
   const skippedParam = params.get("eklenemeyen") ?? "";
   const skippedCount = /^[1-9]\d*$/.test(skippedParam) ? Number(skippedParam) : 0;
@@ -141,6 +146,32 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
     };
   }, []);
 
+  // The hearings load on their own so a failure here never breaks the rest of the page.
+  async function loadHearings() {
+    const seq = ++hearingsSeq.current;
+    try {
+      const fresh = await getCaseHearings(caseId);
+      if (seq === hearingsSeq.current) setHearings(fresh);
+    } catch {
+      // Keep the list we have; the case page itself still works.
+    }
+  }
+
+  useEffect(() => {
+    setHearings([]);
+    void loadHearings();
+    return () => {
+      hearingsSeq.current += 1;
+    };
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [caseId]);
+
+  /** After a hearing was added, edited, deleted or given a result: the case's next date and timeline changed too. */
+  function handleHearingsChanged() {
+    void loadHearings();
+    void refreshCaseAndDocuments();
+  }
+
   // Follow external URL changes (e.g. a quick-view shortcut to another tab of this case).
   useEffect(() => {
     setActiveTab(labelForSlug(parseCaseTab(sekmeParam)));
@@ -335,6 +366,7 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
   const actions = caseActions(me, caseDetail);
   const archived = caseDetail.is_archived;
   const canEditDetails = !archived && canManageCase(me, caseDetail);
+  const upcomingHearing = nextHearing(hearings);
   const notes = caseDetail.timeline.filter((e) => e.event_type === "note");
   const pendingTasks = tasks.filter((task) => task.status === "pending").length;
   const latestEvents = [...caseDetail.timeline].sort((a, b) => b.event_date.localeCompare(a.event_date));
@@ -402,19 +434,25 @@ export function CaseDetailView({ caseId }: { caseId: string }) {
                 ["Mahkeme", caseDetail.court ?? "—"],
                 ["Durum", CASE_STATUS_LABELS[caseDetail.status]],
                 ["Açılış Tarihi", formatDate(caseDetail.opening_date)],
-                ["Sonraki Duruşma", caseDetail.next_hearing_date ? formatDate(caseDetail.next_hearing_date) : "Planlanmadı"],
+                ["Sonraki Duruşma", upcomingHearing ? hearingWhen(upcomingHearing) : caseDetail.next_hearing_date ? formatDate(caseDetail.next_hearing_date) : "Planlanmadı"],
                 ["Karşı Taraf", caseDetail.opposing_party ?? "—"],
                 ["Dava Değeri", caseDetail.case_value ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(caseDetail.case_value) : "Belirtilmedi"],
                 ["Dosya Numarası", caseDetail.case_number],
               ].map(([label, value]) => <div key={label} className="bg-white p-4">
                 <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
-                <p className="mt-1 text-sm font-medium text-navy-800">{value}</p>
+                {label === "Sonraki Duruşma" && value !== "Planlanmadı" ? (
+                  <a href="#durusmalar" className="mt-1 block text-sm font-medium text-accent-700 hover:underline">{value}</a>
+                ) : (
+                  <p className="mt-1 text-sm font-medium text-navy-800">{value}</p>
+                )}
               </div>)}
             </div>
           </section>
 
           {caseDetail.status === "kapali" && <CaseDecisionCard caseDetail={caseDetail} />}
 
+          <CaseHearingsCard caseDetail={caseDetail} hearings={hearings} readOnly={archived} onChanged={handleHearingsChanged} />
+
           <div className="grid gap-4 xl:grid-cols-2">
             <CasePartiesCard caseDetail={caseDetail} onSaved={handleCaseSaved} canEdit={canEditDetails} />
             <CaseDisputeCard caseDetail={caseDetail} onSaved={handleCaseSaved} canEdit={canEditDetails} />
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/__tests__/CaseDetail
```

Expected: PASS —

```text
Test Files  5 passed (5)
Tests  92 passed (92)
```

- [ ] **Step 5: Run the wider suite for regressions**

```bash
cd frontend && nohup npx vitest run > /tmp/vitest-full.log 2>&1 &
# wait, then:
tail -6 /tmp/vitest-full.log && npx tsc --noEmit && npm run build
```

Expected: PASS — `Test Files  66 passed (66)`, `Tests  624 passed (624)`; `tsc` prints nothing; the build ends with the route table.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseDetailView.tsx frontend/src/components/__tests__/CaseDetailActions.test.tsx frontend/src/components/__tests__/CaseDetailArchived.test.tsx frontend/src/components/__tests__/CaseDetailLifecycle.test.tsx frontend/src/components/__tests__/CaseDetailView.test.tsx
git commit -F - <<'EOF'
feat: case page shows the hearings card and the next hearing with its time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 10: E2E: hearing from the case page through the calendar to a recorded result

One lawyer login. The spec derives every day from today's date in `Europe/Istanbul`. An end-to-end spec exercises the finished UI and API, so it is written last and has no separate red phase: its failure mode is the missing `Duruşmalar` region, which is what every earlier build of the application would show.

**Files:**
- Test (create): `tests/e2e/specs/12-hearing-dates.spec.ts`

**Interfaces:**
- Consumes: everything above; `BACKEND_URL`, `DEMO_LAWYER`, `login` from `tests/e2e/specs/helpers.ts`.
- Produces: spec `12-hearing-dates.spec.ts`.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/specs/12-hearing-dates.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { BACKEND_URL, DEMO_LAWYER, login } from "./helpers";

// Flow 12: hearings are calendar events. A hearing added on the case page shows in the calendar,
// moving it there changes the date on the case page, and a result entered on a past hearing
// (with the next hearing) lands in the timeline. All dates derive from today's date in the
// application's time zone (Europe/Istanbul), never from fixed calendar days. One lawyer login only.

const STAMP = Date.now();
const CASE_NAME = `E2E Duruşma Davası ${STAMP}`;

/** "YYYY-MM-DD" of today in Europe/Istanbul, shifted by `days`. */
function istanbulDay(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const shifted = new Date(`${today}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> "dd.mm.yyyy" (how the app prints dates). */
function shown(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

test("add a hearing on the case page, move it in the calendar, then record a result with the next hearing", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, DEMO_LAWYER);

  const token = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };

  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers,
    data: {
      case_number: `E2E-HD-${STAMP}`,
      case_name: CASE_NAME,
      client_name: "E2E Müvekkil",
      opposing_party: "E2E Karşı Taraf",
      case_type: "diger",
      opening_date: "2026-02-03",
    },
  });
  expect(created.ok()).toBeTruthy();
  const caseId = (await created.json()).id as string;

  // A hearing of yesterday, so a result can be entered on it.
  const yesterday = istanbulDay(-1);
  const past = await page.request.post(`${BACKEND_URL}/calendar/events`, {
    headers,
    data: {
      title: "Duruşma", event_type: "hearing", starts_at: `${yesterday}T00:00:00`, all_day: true, duration_minutes: 60,
      location: null, notes: null, case_id: caseId, assignee_id: null, reminder_days: [3, 1],
    },
  });
  expect(past.ok()).toBeTruthy();

  const first = istanbulDay(10);
  const moved = istanbulDay(12);
  const later = istanbulDay(30);

  // --- Add a hearing from the case page ---
  await page.goto(`/davalar/${caseId}`);
  const card = page.getByRole("region", { name: "Duruşmalar" });
  await expect(card).toContainText("Sonuç girilmedi");
  await card.getByRole("button", { name: "Duruşma ekle" }).click();
  const addDialog = page.getByRole("dialog", { name: "Duruşma ekle" });
  await addDialog.getByLabel("Tarih").fill(first);
  await addDialog.getByLabel("Saat").fill("10:30");
  await addDialog.getByLabel("Salon / yer").fill("E2E Salon 4");
  await addDialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(addDialog).toBeHidden();
  await expect(card).toContainText(`${shown(first)} · 10:30`);
  await expect(card).toContainText("E2E Salon 4");
  await expect(page.getByRole("link", { name: `${shown(first)} · 10:30` })).toBeVisible();

  // --- It is a real calendar event; move it there ---
  await page.goto(`/takvim?gorunum=hafta&hafta=${first}&dava=${caseId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Takvim" })).toBeVisible();
  await page.getByTestId(`day-${first}`).getByRole("button", { name: /Duruşma/ }).click();
  const drawer = page.getByRole("dialog", { name: "Duruşma" });
  await expect(drawer).toContainText("E2E Salon 4");
  await drawer.getByRole("button", { name: "Düzenle" }).click();
  const form = page.getByRole("dialog", { name: "Etkinliği düzenle" });
  await form.getByLabel("Tarih").fill(moved);
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toHaveCount(0);
  await page.goto(`/takvim?gorunum=hafta&hafta=${moved}&dava=${caseId}`);
  await expect(page.getByTestId(`day-${moved}`).getByRole("button", { name: /Duruşma/ })).toBeVisible();

  // --- The case page follows ---
  await page.goto(`/davalar/${caseId}`);
  await expect(card).toContainText(`${shown(moved)} · 10:30`);
  await expect(card).not.toContainText(shown(first));
  await expect(page.getByRole("link", { name: `${shown(moved)} · 10:30` })).toBeVisible();

  // --- Result on the past hearing, with the next hearing ---
  await card.getByRole("button", { name: "Sonuç gir" }).click();
  const result = page.getByRole("dialog", { name: "Sonuç gir" });
  await result.getByRole("button", { name: "Kaydet" }).click();
  await expect(result.getByText("Sonuç notu gerekli.")).toBeVisible();
  await result.getByLabel("Sonuç / ara karar notu").fill("Bilirkişi raporu için süre verildi.");
  await result.getByLabel("Sonraki duruşmayı ekle").check();
  await result.getByLabel("Tarih").fill(later);
  await result.getByLabel("Tüm gün").check();
  await result.getByRole("button", { name: "Kaydet" }).click();
  await expect(result).toBeHidden();
  await expect(card).toContainText("Sonuç: Bilirkişi raporu için süre verildi.");
  await expect(card).toContainText(`${shown(later)} · Tüm gün`);

  // --- The timeline has the "Duruşma yapıldı" entry ---
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText(`Duruşma yapıldı — ${shown(yesterday)}`)).toBeVisible();
  await expect(page.getByText("Bilirkişi raporu için süre verildi.")).toBeVisible();
});
```

- [ ] **Step 2: Run the spec**

```bash
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test specs/12-hearing-dates.spec.ts
```

Expected: PASS —

```text
1 passed
```

- [ ] **Step 3: Run the whole E2E suite**

```bash
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test
```

Expected: every spec passes except `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply` (Decision 16): 12 passed, 1 failed. Make sure no dev server of the earlier runs is still listening on ports 8010 / 3010 (`reuseExistingServer` is false).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/12-hearing-dates.spec.ts
git commit -F - <<'EOF'
test: e2e hearing dates flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```

### Task 11: Progress note and full verification

Documents the feature in `PROGRESS.md` and runs every suite once on the final tree.

**Files:**
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documentation only.

- [ ] **Step 1: Add the note**

Modify `PROGRESS.md`:

```diff
--- a/PROGRESS.md
+++ b/PROGRESS.md
@@ -231,3 +231,11 @@ Status: COMPLETE
 - `cases.decision_date` / `closing_note` (migration `e6c1b9a4d2f8`); `POST /cases/{id}/close|reopen|archive|unarchive`; `PATCH /cases/{id}` no longer sets `status=kapali` or `outcome`.
 - An archived case is read-only: PATCH, close, reopen, events, tasks, documents and calendar events linked to it answer 409 until it is unarchived. The case list has an "Arşivi göster" switch and an "Arşivli" badge.
 - New E2E spec `11-case-lifecycle.spec.ts`.
+
+## Hearing dates (case page ↔ calendar)
+Status: COMPLETE
+
+- A hearing is a calendar event of type `hearing` linked to a case; `cases.next_hearing_date` is a cache (earliest hearing today or later, `APP_TIMEZONE`) recomputed on every hearing change, on case creation, import and seed, and once a day by the reminder worker. `PATCH /cases/{id}` rejects the field (422). The calendar no longer shows derived `case_hearing` rows.
+- Case page "Duruşmalar" card: add, edit, delete, "Sonuç gir" (result note + optional next hearing) via `GET /cases/{id}/hearings` and `POST /calendar/events/{id}/result`; the result adds a "Duruşma yapıldı" timeline entry. Closed cases take no new hearings; archived cases are read-only.
+- Migration `a7d2e4f6b8c1` adds `result_note` / `result_case_event_id` and turns each existing `next_hearing_date` into an all-day hearing event.
+- New E2E spec `12-hearing-dates.spec.ts`.
```

- [ ] **Step 2: Run the full backend suite**

```bash
cd backend && nohup .venv/bin/python -m pytest -q -p no:cacheprovider > /tmp/backend-full.log 2>&1 &
# about ten minutes, then:
tail -3 /tmp/backend-full.log
```

Expected: PASS — `898 passed`.

- [ ] **Step 3: Run the full frontend checks**

```bash
cd frontend && npx vitest run && npx tsc --noEmit && npm run build
```

Expected: PASS — `Test Files  66 passed (66)`, `Tests  624 passed (624)`; `tsc` prints nothing; the production build ends with the route table.

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -F - <<'EOF'
docs: hearing dates progress note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY
EOF
```



## Self-Review

**1. Spec coverage** (each spec section → the task that implements it)

- §2 Tek kaynak (hearing event is the source; `next_hearing_date` is a cache nobody writes by hand) → Task 2 (`hearing_dates`, calendar service, `POST /cases`, PATCH 422), Task 3 (importer, seed), Task 5 (nightly pass, reopen).
- §2 Kapsam (planning + record after the hearing) → Tasks 6 (endpoints), 8 (dialogs), 9 (case page).
- §2 Yetki (everybody in the firm; closed case takes no new hearing; archived is read-only) → no permission check is added (same as the calendar); closed rule in Task 2 (`require_case_open_for_hearing`, 409) and Task 6 (result + `next_hearing`); archived guard reused in Task 6 (`require_case_id_writable`) and by the existing calendar guards; UI in Task 8 (`readOnly`, `closed`).
- §2 Kapsam dışı (legal deadlines, automatic tasks, UYAP) → listed under "Out of scope", nothing built.
- §3.1 columns → Task 1.
- §3.2 `recompute_next_hearing`, triggers (create / update / delete, old and new case, new case, import, seed, migration), nightly recompute, replacement of `_sync_next_hearing` / `_release_hearing_day` → Task 2 (service + tests: add, move, change type, move to another case, delete, a hearing that is today, Istanbul midnight), Task 3, Task 5, Task 1; Decisions 1–3.
- §3.3 migration (events for dates without an event, title / all-day / midnight / `case_id` / `law_firm_id` / assignee / `created_by` fallback / skipped firm / `HEARING_REMINDER_DAYS`, recompute with the local date, downgrade drops the two columns) → Task 1; Decision 8.
- §4 Kurallar: PATCH 422 → Task 2; `POST /cases` event in the same transaction (past date too) → Task 2; importer dedupe and seed → Task 3; closed-case 409 (create and move; edit / delete allowed) → Task 2; archived rule unchanged; derived `case_hearing` items removed, reminders / upcoming list / reports / dashboard unchanged → Tasks 2, 4 and Decision 12.
- §5 API: `result_note` on responses → Task 2; `GET /cases/{id}/hearings` → Task 6; `POST /calendar/events/{id}/result` (validation, order of checks, archived / closed, timeline entry created or updated, `next_hearing`, response shape) → Task 6; timeline entry survives deletion of the hearing → Task 6 test.
- §6.1 Dava sayfası kartı (lists, buttons, add / edit window, result window, delete confirmation, closed and archived behaviour, `Sonraki duruşma` with time linked to the card, `ModalFrame`, `aria-disabled` + guard, `ApiError`-only messages) → Tasks 7–9.
- §6.2 Takvim (hearing events edited as today; `Sonuç` row in the drawer) → Task 7 (drawer), existing calendar UI unchanged; Task 10 moves a hearing in the calendar.
- §6.3 Yeni dava sayfası unchanged → Decision 10 (no frontend change; backend of Task 2 does the conversion).
- §7 Test: backend list (migration, recompute cases, nightly, PATCH 422, `POST /cases` and import, closed 409, hearings list, result endpoint, firm isolation, reminders, no `case_hearing` item) → Tasks 1–6; frontend list → Tasks 7–9; E2E → Task 10.
- Gaps: none. Decisions 1–15 record the points the spec leaves open (trigger and testing of the nightly job, scope, "today", `is_past` / `result_open`, effect of removing derived items, the next hearing's time, timeline linking, `created_by` fallback, import dedupe, unaffected analytics).

**2. Placeholder scan.** The plan contains no "TBD", "TODO", "implement later", "add appropriate error handling" or "similar to Task N"; every code step is a complete new file or a unified diff taken from the verified implementation, and every command has an expected result. The two tasks without a red phase (Task 10, an E2E spec that exercises the finished UI, and Task 11, documentation and verification) say so.

**3. Type consistency.** Names are used identically across tasks: backend `recompute_next_hearing(db, case, today)` (Task 2) is called by Task 3 (`ensure_all_day_hearing` callers), Task 5 (`reopen`) and Task 6 (`record_result`); `add_all_day_hearing` (Task 2) is wrapped by `ensure_all_day_hearing` (Task 3); `normalize_start` is private in Task 2 and public in Task 6 (the Task 6 diff renames its two call sites); `HearingRecomputeSchedule.run_if_new_day` / `run_reminder_tick(..., hearing_schedule=)` (Task 5) are used only by the worker loop and its tests; backend `CaseHearingOut` (`id, starts_at, all_day, duration_minutes, location, notes, assignee_id, result_note, is_past, result_open`) ↔ frontend `CaseHearing` (same fields, Task 7); `HearingResultIn` / `NextHearingIn` ↔ `HearingResultPayload` (`result_note`, `next_hearing{starts_at, all_day, duration_minutes?, location?, notes?}`); `HearingResultOut` ↔ `HearingResultResponse`; `HearingFields` (Task 7) is what `buildHearingFields` returns and what Task 8's modal sends to `updateCalendarEvent` / spreads into `createCalendarEvent`; `CaseHearingsCard` props (`caseDetail`, `hearings`, `readOnly`, `onChanged`) in Task 8 match the call in Task 9; the Turkish strings of the Global Constraints are the literals used in the code blocks (`Duruşma kaydedilemedi. Lütfen tekrar deneyin.`, `Sonuç kaydedilemedi. Lütfen tekrar deneyin.`, `Duruşma silinemedi. Lütfen tekrar deneyin.`, `Sonuç notu gerekli.`, `Henüz duruşma yok.`).

**Verification recorded while writing the plan** (scratch worktree outside the repository, built task by task; every task's tests were first run against the previous state of its source files to see them fail, then against the task's commit): backend full suite 898 passed; frontend `npx vitest run` 624 passed (66 files); `npx tsc --noEmit` clean; `npm run build` succeeds; Playwright 12 passed and 1 failed — the failure is `07-ai-chat.spec.ts` › `the system picks the answer level and labels the reply` (it waits for `Standart · mock`), which fails identically before this work.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-12-hearing-dates.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in one session using superpowers:executing-plans, with checkpoints for review.

Which approach?
