# Dava Notları, Gelişme Türleri, Geri Dönüş ve Sorumlu Avukat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let lawyers write, edit and delete case notes in the Notlar tab, give timeline entries (Gelişmeler) a type, add a way back from a case to the (filtered) case list, and show and filter by the responsible lawyer everywhere a case is shown; admins can change the responsible lawyer from the case's edit dialog.

**Architecture:** Backend: a note is a `case_events` row with `event_type=note` (text in `description`, `title` derived from the first line). A new module `app/services/case_events.py` holds the input rules (Turkish 422 texts) and the title rule; `CaseService.add_event` applies them. Two new routes `PATCH|DELETE /cases/{id}/events/{event_id}` change notes only. `CaseEvent` gets an `author` relationship and `CaseEventOut` returns `created_by` / `created_by_name`. `Case` gets a view-only `assigned_lawyer` relationship (`lazy="selectin"`, so lists cost one extra query, not one per case) and `CaseOut` returns `assigned_lawyer_name`. `GET /cases?assigned_lawyer_id=none` lists unassigned cases. The admin assignment route refuses archived cases and answers in Turkish. Frontend: `CaseDetailView` delegates the Gelişmeler tab to a new `CaseTimelinePanel` (type select, description, type badges) and the Notlar tab to a new `CaseNotesPanel` (add / inline edit / delete with confirmation). `CaseHeader` shows `← Davalar` (back to the last list URL kept in `sessionStorage`) and `Sorumlu: …`. The list gets a `Sorumlu` column and filter, the quick view a `Sorumlu avukat` field, `WorkspaceHeader` a link on the section name, and `CaseEditModal` an admin-only `Sorumlu avukat` select.

**Tech Stack:** FastAPI, SQLAlchemy 2, pydantic v2, pytest; Next.js 14 (app router), React 18, Tailwind, Vitest + Testing Library + user-event; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-case-notes-and-owner-design.md`

## Global Constraints

Every task's requirements include this section.

**Process**

- Work on branch `feature/case-notes-and-owner` (already checked out; do not switch branches, do not push, never use `git stash`). One commit per task. Every commit message ends with a blank line and then exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY`
- Always `git add` explicit paths, never `git add .` (`backend/.venv`, `frontend/node_modules`, `tests/e2e/node_modules` must never be committed).
- No new Python or npm packages. No Alembic migration (no schema change).
- Backend commands run from `backend/` (`.venv/bin/python -m pytest ...`), frontend from `frontend/` (`npx vitest run ...`, `npx tsc --noEmit`, `npm run build`), E2E from `tests/e2e/` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`. The full backend suite takes about ten minutes; run it with `timeout: 600000` or in the background.

**Project rules (code review checks every one)**

- Only `ApiError` messages are shown to users; anything else becomes the Turkish fallback. Use `userMessage(error, fallback)` from `frontend/src/lib/userMessages.ts`.
- The frontend only shows a string `detail`; a pydantic 422 list becomes the generic `İstek başarısız oldu (422).`. Every user-facing 422 in this plan is therefore raised with a string `detail`, never by a pydantic validator.
- A button the user just clicked uses `aria-disabled` plus an `inFlight` ref guard, never `disabled`.
- No ref reads inside React state updaters; no stale state reads after an `await` (use the awaited value or a functional update).
- Modals use the existing `ModalFrame` (`frontend/src/components/ModalFrame.tsx`; props `title`, `onClose`, `busy`, optional `wide`).
- Every query is firm-scoped: another firm's case or event answers 404.
- Turkish copy is used exactly as written in this plan.
- `sessionStorage` reads and writes are wrapped in `try/catch`; the page works without storage.

**Exact strings**

- Notes API errors: 422 `Not metni boş olamaz.`, 422 `Not en fazla 4000 karakter olabilir.`, 404 `Kayıt bulunamadı.`, 409 `Yalnızca notlar düzenlenebilir veya silinebilir.`, 403 `Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir.`, 409 (archived) `Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.` (existing `CASE_ARCHIVED`).
- Other event API errors: 422 `Gelişme başlığı boş olamaz.`, 422 `Gelişme başlığı en fazla 255 karakter olabilir.`, 422 `Açıklama en fazla 4000 karakter olabilir.`.
- Admin assignment API errors: 404 `Dava bulunamadı.`, 422 `Bu büroda aktif bir avukat seçin.`, 409 `Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.`.
- Notlar tab: label `Not`, label `Tarih`, button `Not ekle` / `Ekleniyor...`, counter `<n>/4000`, empty `Henüz not eklenmedi.`, per note buttons `Düzenle` and `Sil`, edit buttons `Kaydet` / `Kaydediliyor...` / `Vazgeç`, author `— <ad>`, validation `Not metni boş olamaz.`, fallbacks `Not kaydedilemedi. Lütfen tekrar deneyin.` and `Not silinemedi. Lütfen tekrar deneyin.`, delete dialog title `Not silinsin mi?`, text `Bu işlem geri alınamaz.`, buttons `Sil` / `Siliniyor...` / `Vazgeç`.
- Gelişmeler tab: labels `Tarih`, `Gelişme Başlığı` (unchanged), `Tür`, `Açıklama`; button `Ekle` / `Ekleniyor...`; empty `Henüz gelişme yok.`; fallback `Gelişme eklenemedi. Lütfen tekrar deneyin.`
- Event type labels: `filing` `Dava açılışı / dilekçe`, `submission` `Beyan / cevap`, `expert_report` `Bilirkişi raporu`, `legal_update` `Mevzuat / içtihat gelişmesi`, `other` `Diğer`, `hearing` `Duruşma`, `note` `Not`. Form options (in this order): filing, submission, expert_report, legal_update, other (default other).
- Navigation: link `← Davalar`; header shows `CaseBridge / ` followed by a link with the section title.
- Owner: header `Sorumlu: <ad>` or `Sorumlu: Atanmamış`; list column `Sorumlu` (`—` when unassigned); quick view field `Sorumlu avukat`; filter select `aria-label="Sorumlu filtresi"` with options `Tüm sorumlular` (value empty), `Benim davalarım` (value = my id, only for a lawyer), each lawyer by full name, `Atanmamış` (value `yok`), and `Diğer avukat` (only when the URL holds an id that is in none of the others); filter chip `Sorumlu: <Benim davalarım | ad | Atanmamış | Diğer avukat>`.
- Edit dialog (admin only): label `Sorumlu avukat`, placeholder option `Avukat seçin` (only when the case has no responsible lawyer), a missing current lawyer shown as `<ad> (pasif)` (or `Mevcut avukat (pasif)` when no name), load error `Avukat listesi yüklenemedi.`, partial failure `Bilgiler kaydedildi ancak sorumlu avukat değiştirilemedi.`

---

### Task 1: Event input rules, note titles and the author's name (backend)

**Files:**
- Create: `backend/app/services/case_events.py`
- Modify: `backend/app/models/case.py` (class `CaseEvent`)
- Modify: `backend/app/schemas/case.py` (`CaseEventCreate`, `CaseEventOut`)
- Modify: `backend/app/services/case_service.py` (`add_event`)
- Modify: `backend/app/api/routes/cases.py` (`add_case_event`)
- Test: `backend/tests/unit/test_case_events_rules.py`, `backend/tests/api/test_case_notes.py`

**Interfaces:**
- Produces: `CaseEventInputError(detail: str)`; `note_title(text: str) -> str`; `clean_note_text(value: str | None) -> str`; `clean_event_fields(payload: CaseEventCreate) -> dict` (keys `event_date`, `title`, `description`, `event_type`); `NOTE_MAX_LENGTH = 4000`; `CaseEvent.author` relationship and `CaseEvent.created_by_name` property; `CaseEventOut.created_by: str | None`, `CaseEventOut.created_by_name: str | None`.

- [ ] **Step 1: Write the failing unit tests**

`backend/tests/unit/test_case_events_rules.py`:

```python
"""Input rules for timeline entries and notes (app/services/case_events.py)."""
from datetime import date

import pytest

from app.models.case import CaseEventType
from app.schemas.case import CaseEventCreate
from app.services.case_events import CaseEventInputError, clean_event_fields, clean_note_text, note_title


def test_note_title_is_the_first_non_blank_line_with_collapsed_spaces():
    assert note_title("\n\n  Bilirkişi   raporu\tgeldi \nikinci satır") == "Bilirkişi raporu geldi"


def test_note_title_is_cut_at_120_characters_with_an_ellipsis():
    title = note_title("a" * 200)
    assert len(title) == 120
    assert title.endswith("…")


def test_clean_note_text_trims_and_checks_length():
    assert clean_note_text("  Müvekkil aradı.  ") == "Müvekkil aradı."
    with pytest.raises(CaseEventInputError) as blank:
        clean_note_text("   ")
    assert blank.value.detail == "Not metni boş olamaz."
    with pytest.raises(CaseEventInputError) as missing:
        clean_note_text(None)
    assert missing.value.detail == "Not metni boş olamaz."
    with pytest.raises(CaseEventInputError) as long:
        clean_note_text("x" * 4001)
    assert long.value.detail == "Not en fazla 4000 karakter olabilir."
    assert clean_note_text("x" * 4000) == "x" * 4000


def test_a_note_ignores_the_sent_title_and_derives_it():
    fields = clean_event_fields(CaseEventCreate(
        event_date=date(2026, 10, 1), title="yok sayılır", description="İlk satır\nDetay", event_type=CaseEventType.NOTE,
    ))
    assert fields == {
        "event_date": date(2026, 10, 1), "title": "İlk satır", "description": "İlk satır\nDetay",
        "event_type": CaseEventType.NOTE,
    }


def test_other_types_need_a_title_and_keep_an_optional_description():
    fields = clean_event_fields(CaseEventCreate(
        event_date=date(2026, 10, 1), title="  Rapor geldi ", description="   ", event_type=CaseEventType.EXPERT_REPORT,
    ))
    assert fields["title"] == "Rapor geldi"
    assert fields["description"] is None
    with pytest.raises(CaseEventInputError) as blank:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1), title="  "))
    assert blank.value.detail == "Gelişme başlığı boş olamaz."
    with pytest.raises(CaseEventInputError) as missing:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1)))
    assert missing.value.detail == "Gelişme başlığı boş olamaz."
    with pytest.raises(CaseEventInputError) as long_title:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1), title="x" * 256))
    assert long_title.value.detail == "Gelişme başlığı en fazla 255 karakter olabilir."
    with pytest.raises(CaseEventInputError) as long_description:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1), title="Başlık", description="x" * 4001))
    assert long_description.value.detail == "Açıklama en fazla 4000 karakter olabilir."
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tests/unit/test_case_events_rules.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.case_events'`.

- [ ] **Step 3: Implement the rules module and make `title` optional**

`backend/app/services/case_events.py`:

```python
"""Input rules for case timeline entries (Gelişmeler) and notes (Notlar).

A note is a timeline entry of type `note`: its text lives in `description` and
its `title` is derived from the text's first line, so lists that only show
titles (quick view, dashboard activity) still read well. The rules raise
CaseEventInputError with a Turkish sentence; routes turn it into a 422 with a
string detail (the frontend shows only string details).
"""
from typing import Optional

from app.models.case import CaseEventType
from app.schemas.case import CaseEventCreate

NOTE_MAX_LENGTH = 4000
DESCRIPTION_MAX_LENGTH = 4000
TITLE_MAX_LENGTH = 255
NOTE_TITLE_LENGTH = 120


class CaseEventInputError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def note_title(text: str) -> str:
    first_line = next((line for line in text.splitlines() if line.strip()), "")
    collapsed = " ".join(first_line.split())
    if len(collapsed) <= NOTE_TITLE_LENGTH:
        return collapsed
    return collapsed[: NOTE_TITLE_LENGTH - 1].rstrip() + "…"


def clean_note_text(value: Optional[str]) -> str:
    text = (value or "").strip()
    if not text:
        raise CaseEventInputError("Not metni boş olamaz.")
    if len(text) > NOTE_MAX_LENGTH:
        raise CaseEventInputError("Not en fazla 4000 karakter olabilir.")
    return text


def clean_event_fields(payload: CaseEventCreate) -> dict:
    if payload.event_type == CaseEventType.NOTE:
        text = clean_note_text(payload.description)
        return {"event_date": payload.event_date, "title": note_title(text), "description": text, "event_type": payload.event_type}

    title = (payload.title or "").strip()
    if not title:
        raise CaseEventInputError("Gelişme başlığı boş olamaz.")
    if len(title) > TITLE_MAX_LENGTH:
        raise CaseEventInputError("Gelişme başlığı en fazla 255 karakter olabilir.")
    description = (payload.description or "").strip() or None
    if description is not None and len(description) > DESCRIPTION_MAX_LENGTH:
        raise CaseEventInputError("Açıklama en fazla 4000 karakter olabilir.")
    return {"event_date": payload.event_date, "title": title, "description": description, "event_type": payload.event_type}
```

In `backend/app/schemas/case.py`, change `CaseEventCreate.title` to optional (notes do not send one):

```python
class CaseEventCreate(BaseModel):
    event_date: date
    title: Optional[str] = None
    description: Optional[str] = None
    event_type: CaseEventType = CaseEventType.OTHER
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/unit/test_case_events_rules.py -q`
Expected: 5 passed.

- [ ] **Step 5: Write the failing API tests**

`backend/tests/api/test_case_notes.py` (Task 2 appends to this file):

```python
"""Notes (Notlar) and typed timeline entries: POST /cases/{id}/events with the
Turkish input rules, the author's name, and (Task 2) PATCH/DELETE of notes."""
from datetime import timedelta

import pytest

from app.core.timeutil import local_today

TODAY = local_today()
OPENED = (TODAY - timedelta(days=30)).isoformat()
DAY = (TODAY - timedelta(days=3)).isoformat()


def _new_case(client, headers, number="2026/N1"):
    response = client.post("/cases", json={
        "case_number": number, "case_name": "Kira Alacağı", "client_name": "Müvekkil", "case_type": "kira",
        "opening_date": OPENED,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _add_note(client, headers, case_id, text="Müvekkil aradı.\nDetaylar yarın.", event_date=DAY):
    response = client.post(f"/cases/{case_id}/events", json={
        "event_date": event_date, "event_type": "note", "description": text,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


def test_a_note_is_saved_with_a_derived_title_and_its_author(client, office, lawyer):
    case = _new_case(client, lawyer)

    note = _add_note(client, lawyer, case["id"])

    assert (note["event_type"], note["title"], note["description"]) == ("note", "Müvekkil aradı.", "Müvekkil aradı.\nDetaylar yarın.")
    assert (note["created_by"], note["created_by_name"]) == (office.lawyer_a1.id, "Ayşe Avukat")
    timeline = client.get(f"/cases/{case['id']}", headers=lawyer).json()["timeline"]
    assert [(e["id"], e["created_by_name"]) for e in timeline] == [(note["id"], "Ayşe Avukat")]


@pytest.mark.parametrize("payload, detail", [
    ({"event_type": "note", "description": "   "}, "Not metni boş olamaz."),
    ({"event_type": "note"}, "Not metni boş olamaz."),
    ({"event_type": "note", "description": "x" * 4001}, "Not en fazla 4000 karakter olabilir."),
    ({"event_type": "other", "title": " "}, "Gelişme başlığı boş olamaz."),
    ({"event_type": "filing"}, "Gelişme başlığı boş olamaz."),
    ({"title": "x" * 256}, "Gelişme başlığı en fazla 255 karakter olabilir."),
    ({"title": "Rapor", "description": "x" * 4001}, "Açıklama en fazla 4000 karakter olabilir."),
])
def test_invalid_entries_answer_422_with_a_turkish_sentence(client, lawyer, payload, detail):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/events", json={"event_date": DAY, **payload}, headers=lawyer)
    assert response.status_code == 422
    assert response.json()["detail"] == detail


def test_a_typed_entry_keeps_its_type_and_trimmed_description(client, lawyer):
    case = _new_case(client, lawyer)
    response = client.post(f"/cases/{case['id']}/events", json={
        "event_date": DAY, "title": " Bilirkişi raporu tebliğ edildi ", "description": "  ", "event_type": "expert_report",
    }, headers=lawyer)
    assert response.status_code == 201
    body = response.json()
    assert (body["title"], body["description"], body["event_type"]) == ("Bilirkişi raporu tebliğ edildi", None, "expert_report")


def test_an_entry_without_an_author_has_no_name(client, db_session, lawyer):
    from app.models.case import CaseEvent, CaseEventType

    case = _new_case(client, lawyer)
    db_session.add(CaseEvent(case_id=case["id"], law_firm_id=case["law_firm_id"], event_date=TODAY, title="İçe aktarılan",
                             event_type=CaseEventType.OTHER))
    db_session.commit()
    timeline = client.get(f"/cases/{case['id']}", headers=lawyer).json()["timeline"]
    assert (timeline[0]["created_by"], timeline[0]["created_by_name"]) == (None, None)


def test_archived_case_refuses_a_note_before_checking_it(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    response = client.post(f"/cases/{case['id']}/events", json={"event_date": DAY, "event_type": "note", "description": ""}, headers=lawyer)
    assert response.status_code == 409
```

- [ ] **Step 6: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_case_notes.py -q`
Expected: FAIL (`KeyError: 'created_by'`, and 201 instead of 422 for the input rules).

- [ ] **Step 7: Add the author relationship, the output fields and apply the rules**

In `backend/app/models/case.py`, class `CaseEvent`, below the existing `case` relationship:

```python
    # Who wrote the entry (None for imported or seeded rows). selectin: a timeline
    # loads every author in one extra query.
    author: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by], lazy="selectin", viewonly=True)

    @property
    def created_by_name(self) -> Optional[str]:
        return self.author.full_name if self.author is not None else None
```

Make sure `Optional` is imported from `typing` at the top of the file, and that `"User"` resolves (the `User` model is registered on the same `Base`; if the file uses `TYPE_CHECKING` imports for other models, add `from app.models.user import User` under it).

In `backend/app/schemas/case.py`, `CaseEventOut` gets two fields after `event_type`:

```python
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
```

In `backend/app/services/case_service.py`, import `from app.services.case_events import clean_event_fields` and replace `add_event`:

```python
    def add_event(self, case: Case, payload: CaseEventCreate, created_by: Optional[str] = None) -> CaseEvent:
        """Raises CaseEventInputError (Turkish detail) when the entry breaks an input rule."""
        event = CaseEvent(
            case_id=case.id,
            law_firm_id=case.law_firm_id,
            created_by=created_by,
            **clean_event_fields(payload),
        )
        return self.events.create(event)
```

In `backend/app/api/routes/cases.py`, import `from app.services.case_events import CaseEventInputError` and change the end of `add_case_event`:

```python
    require_case_writable(case)
    try:
        return service.add_event(case, payload, created_by=current_user.id)
    except CaseEventInputError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail) from exc
```

- [ ] **Step 8: Run the new and the neighbouring tests**

Run: `.venv/bin/python -m pytest tests/unit/test_case_events_rules.py tests/api/test_case_notes.py tests/api/test_case_events.py tests/api/test_archived_case_readonly.py tests/api/test_case_intake.py tests/api/test_cases.py -q`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/case_events.py backend/app/models/case.py backend/app/schemas/case.py backend/app/services/case_service.py backend/app/api/routes/cases.py backend/tests/unit/test_case_events_rules.py backend/tests/api/test_case_notes.py
git commit -m "feat: note and timeline entry input rules, entry author's name"
```

---

### Task 2: Edit and delete notes (backend)

**Files:**
- Modify: `backend/app/api/case_access.py` (add `can_change_note`, constants)
- Modify: `backend/app/repositories/case_event_repository.py` (add `get_in_case`, `save`, `delete`)
- Modify: `backend/app/schemas/case.py` (add `CaseNoteUpdate`)
- Modify: `backend/app/api/routes/cases.py` (two routes)
- Test: `backend/tests/api/test_case_notes.py` (append)

**Interfaces:**
- Consumes: `clean_note_text`, `note_title`, `CaseEventInputError` (Task 1).
- Produces: `PATCH /cases/{case_id}/events/{event_id}` body `{"description"?: str, "event_date"?: date}` → `CaseEventOut`; `DELETE /cases/{case_id}/events/{event_id}` → 204.

- [ ] **Step 1: Append the failing tests**

Append to `backend/tests/api/test_case_notes.py`:

```python
# --- PATCH / DELETE notes ------------------------------------------------------------

def _patch(client, headers, case_id, event_id, **body):
    return client.patch(f"/cases/{case_id}/events/{event_id}", json=body, headers=headers)


def _delete(client, headers, case_id, event_id):
    return client.delete(f"/cases/{case_id}/events/{event_id}", headers=headers)


def test_the_author_edits_a_note_and_the_title_follows_the_text(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    new_day = (TODAY - timedelta(days=1)).isoformat()

    response = _patch(client, lawyer, case["id"], note["id"], description="  Yeni ilk satır\nsonra ", event_date=new_day)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["title"], body["description"], body["event_date"]) == ("Yeni ilk satır", "Yeni ilk satır\nsonra", new_day)
    assert body["created_by_name"] == "Ayşe Avukat"


def test_a_patch_with_only_a_date_keeps_the_text(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    response = _patch(client, lawyer, case["id"], note["id"], event_date=TODAY.isoformat())
    assert response.status_code == 200
    assert response.json()["description"] == note["description"]


def test_an_empty_text_is_refused(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    response = _patch(client, lawyer, case["id"], note["id"], description=" ")
    assert (response.status_code, response.json()["detail"]) == (422, "Not metni boş olamaz.")


def test_the_author_deletes_a_note(client, lawyer):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    assert _delete(client, lawyer, case["id"], note["id"]).status_code == 204
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["timeline"] == []


def test_responsible_lawyer_and_admin_may_change_a_colleagues_note(client, office, auth_headers, lawyer):
    colleague = auth_headers(office.lawyer_a2)
    admin = auth_headers(office.admin_a)
    case = _new_case(client, lawyer)  # lawyer_a1 is responsible
    note = _add_note(client, colleague, case["id"], text="Meslektaş notu")

    assert _patch(client, lawyer, case["id"], note["id"], description="Sorumlu düzeltti").status_code == 200
    assert _patch(client, admin, case["id"], note["id"], description="Yönetici düzeltti").status_code == 200
    assert _delete(client, admin, case["id"], note["id"]).status_code == 204


def test_another_lawyer_may_not_change_a_note(client, office, auth_headers, lawyer):
    colleague = auth_headers(office.lawyer_a2)
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    detail = "Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir."

    patched = _patch(client, colleague, case["id"], note["id"], description="Değiştirme denemesi")
    deleted = _delete(client, colleague, case["id"], note["id"])

    assert (patched.status_code, patched.json()["detail"]) == (403, detail)
    assert (deleted.status_code, deleted.json()["detail"]) == (403, detail)


def test_only_notes_can_be_changed(client, lawyer):
    case = _new_case(client, lawyer)
    entry = client.post(f"/cases/{case['id']}/events", json={"event_date": DAY, "title": "Dava açıldı", "event_type": "filing"},
                        headers=lawyer).json()
    detail = "Yalnızca notlar düzenlenebilir veya silinebilir."
    patched = _patch(client, lawyer, case["id"], entry["id"], description="x")
    deleted = _delete(client, lawyer, case["id"], entry["id"])
    assert (patched.status_code, patched.json()["detail"]) == (409, detail)
    assert (deleted.status_code, deleted.json()["detail"]) == (409, detail)


def test_unknown_or_foreign_entries_are_404(client, office, auth_headers, lawyer):
    other_firm = auth_headers(office.admin_b)
    case = _new_case(client, lawyer)
    other_case = _new_case(client, lawyer, number="2026/N2")
    note = _add_note(client, lawyer, case["id"])

    for response in (
        _patch(client, lawyer, case["id"], "no-such-id", description="x"),
        _patch(client, lawyer, other_case["id"], note["id"], description="x"),  # entry of another case
        _patch(client, other_firm, case["id"], note["id"], description="x"),  # another firm
        _delete(client, other_firm, case["id"], note["id"]),
    ):
        assert (response.status_code, response.json()["detail"]) == (404, "Kayıt bulunamadı.")


def test_archived_case_notes_are_read_only(client, lawyer, close_case):
    case = _new_case(client, lawyer)
    note = _add_note(client, lawyer, case["id"])
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    archived = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
    patched = _patch(client, lawyer, case["id"], note["id"], description="x")
    deleted = _delete(client, lawyer, case["id"], note["id"])
    assert (patched.status_code, patched.json()["detail"]) == (409, archived)
    assert (deleted.status_code, deleted.json()["detail"]) == (409, archived)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_case_notes.py -q`
Expected: the new tests FAIL with 405 (no PATCH/DELETE route).

- [ ] **Step 3: Implement access rule, repository methods, schema and routes**

`backend/app/api/case_access.py` — add below `require_case_manager` (import `CaseEvent` from `app.models.case`):

```python
NOT_NOTE_CHANGER = "Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir."


def can_change_note(user: User, case: Case, event: CaseEvent) -> bool:
    """A note may be changed by whoever wrote it, by the case's responsible lawyer and by admins."""
    return (event.created_by is not None and event.created_by == user.id) or can_manage_case(user, case)
```

`backend/app/repositories/case_event_repository.py` — add (import `Optional` from `typing`):

```python
    def get_in_case(self, event_id: str, case_id: str, law_firm_id: str) -> Optional[CaseEvent]:
        return (
            self.db.query(CaseEvent)
            .filter(CaseEvent.id == event_id, CaseEvent.case_id == case_id, CaseEvent.law_firm_id == law_firm_id)
            .first()
        )

    def save(self, event: CaseEvent) -> CaseEvent:
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete(self, event: CaseEvent) -> None:
        self.db.delete(event)
        self.db.commit()
```

`backend/app/schemas/case.py` — add after `CaseEventOut`:

```python
class CaseNoteUpdate(BaseModel):
    """PATCH /cases/{id}/events/{event_id}: a note's text and/or date. Missing or null keeps the value."""

    description: Optional[str] = None
    event_date: Optional[date] = None
```

`backend/app/api/routes/cases.py` — imports: add `CaseNoteUpdate` to the schema import, `from app.api.case_access import NOT_NOTE_CHANGER, can_change_note, require_case_manager, require_case_writable`, `from app.models.case import CaseEventType` (extend the existing import), `from app.repositories.case_event_repository import CaseEventRepository`, `from app.services.case_events import CaseEventInputError, clean_note_text, note_title`. Then add after `add_case_event`:

```python
NOTE_NOT_FOUND = "Kayıt bulunamadı."
ONLY_NOTES = "Yalnızca notlar düzenlenebilir veya silinebilir."


def _changeable_note(db: Session, case_id: str, event_id: str, current_user: User):
    """404 (no such case/entry in this firm), 409 (archived), 409 (not a note), 403 (not allowed), in that order."""
    case = CaseService(db).get_case(case_id, current_user.law_firm_id)
    events = CaseEventRepository(db)
    event = events.get_in_case(event_id, case_id, current_user.law_firm_id) if case is not None else None
    if case is None or event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOTE_NOT_FOUND)
    require_case_writable(case)
    if event.event_type != CaseEventType.NOTE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ONLY_NOTES)
    if not can_change_note(current_user, case, event):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_NOTE_CHANGER)
    return events, event


@router.patch("/{case_id}/events/{event_id}", response_model=CaseEventOut)
def update_case_note(
    case_id: str,
    event_id: str,
    payload: CaseNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events, event = _changeable_note(db, case_id, event_id, current_user)
    if payload.description is not None:
        try:
            text = clean_note_text(payload.description)
        except CaseEventInputError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.detail) from exc
        event.description = text
        event.title = note_title(text)
    if payload.event_date is not None:
        event.event_date = payload.event_date
    return events.save(event)


@router.delete("/{case_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case_note(
    case_id: str,
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events, event = _changeable_note(db, case_id, event_id, current_user)
    events.delete(event)
```

Note: the spec's check order puts "not a note" (409) before "not allowed" (403) on purpose: anyone in the firm can see the timeline, so the type is not secret.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/test_case_notes.py tests/api/test_case_events.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/case_access.py backend/app/repositories/case_event_repository.py backend/app/schemas/case.py backend/app/api/routes/cases.py backend/tests/api/test_case_notes.py
git commit -m "feat: edit and delete case notes"
```

---

### Task 3: Responsible lawyer's name, unassigned filter, admin assignment fixes (backend)

**Files:**
- Modify: `backend/app/models/case.py` (class `Case`)
- Modify: `backend/app/schemas/case.py` (`CaseOut`)
- Modify: `backend/app/repositories/case_repository.py` (`list_in_firm`)
- Modify: `backend/app/api/routes/admin.py` (`assign_case_lawyer`)
- Test: `backend/tests/api/test_case_owner.py`

**Interfaces:**
- Produces: `CaseOut.assigned_lawyer_name: str | None` (also on `CaseDetailOut` and every route returning `CaseOut`); `GET /cases?assigned_lawyer_id=none`; `UNASSIGNED = "none"` in `case_repository.py`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/api/test_case_owner.py`:

```python
"""The responsible lawyer's name on case responses, the "none" (unassigned) list filter,
and the admin assignment route's archived guard and Turkish messages."""
from datetime import timedelta

from sqlalchemy import event

from app.core.timeutil import local_today
from app.models.case import Case, CaseType

OPENED = (local_today() - timedelta(days=30)).isoformat()


def _new_case(client, headers, number, **extra):
    response = client.post("/cases", json={
        "case_number": number, "case_name": f"Dava {number}", "client_name": "Müvekkil", "case_type": "kira",
        "opening_date": OPENED, **extra,
    }, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _unassigned_case(db_session, office, number="2026/U1"):
    case = Case(law_firm_id=office.firm_a.id, case_number=number, case_name="Sahipsiz Dava", client_name="Müvekkil",
                case_type=CaseType.KIRA, opening_date=local_today())
    db_session.add(case)
    db_session.commit()
    return case


def test_case_responses_carry_the_responsible_lawyers_name(client, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    created = _new_case(client, lawyer, "2026/O1")
    assert created["assigned_lawyer_name"] == "Ayşe Avukat"
    assert client.get(f"/cases/{created['id']}", headers=lawyer).json()["assigned_lawyer_name"] == "Ayşe Avukat"
    listed = client.get("/cases", headers=lawyer).json()
    assert [(c["id"], c["assigned_lawyer_name"]) for c in listed] == [(created["id"], "Ayşe Avukat")]


def test_an_unassigned_case_has_no_name_and_the_none_filter_finds_it(client, db_session, office, auth_headers):
    admin = auth_headers(office.admin_a)
    lawyer = auth_headers(office.lawyer_a1)
    _new_case(client, lawyer, "2026/O2")
    orphan = _unassigned_case(db_session, office)

    listed = client.get("/cases", params={"assigned_lawyer_id": "none"}, headers=admin).json()

    assert [(c["id"], c["assigned_lawyer_name"]) for c in listed] == [(orphan.id, None)]


def test_listing_many_cases_does_not_query_once_per_case(client, db_session, office, auth_headers):
    lawyer = auth_headers(office.lawyer_a1)
    colleague = auth_headers(office.lawyer_a2)
    for index in range(6):
        _new_case(client, lawyer if index % 2 else colleague, f"2026/Q{index}")

    statements = []
    engine = db_session.get_bind()
    listener = lambda conn, cursor, statement, *args: statements.append(statement)  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        response = client.get("/cases", headers=lawyer)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert response.status_code == 200 and len(response.json()) == 6
    user_selects = [s for s in statements if "FROM users" in s]
    # One for the signed-in user (auth), one batched load of the responsible lawyers; a few more for parties etc. is fine.
    assert len(user_selects) <= 3, user_selects


def test_admin_assignment_returns_the_new_name(client, office, auth_headers):
    admin = auth_headers(office.admin_a)
    case = _new_case(client, auth_headers(office.lawyer_a1), "2026/O3")
    response = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id}, headers=admin)
    assert response.status_code == 200
    assert (response.json()["assigned_lawyer_id"], response.json()["assigned_lawyer_name"]) == (office.lawyer_a2.id, "Mehmet Avukat")


def test_admin_assignment_answers_in_turkish(client, office, auth_headers):
    admin = auth_headers(office.admin_a)
    case = _new_case(client, auth_headers(office.lawyer_a1), "2026/O4")
    missing = client.patch("/admin/cases/no-such-case/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id}, headers=admin)
    wrong = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_b.id}, headers=admin)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Dava bulunamadı.")
    assert (wrong.status_code, wrong.json()["detail"]) == (422, "Bu büroda aktif bir avukat seçin.")


def test_admin_assignment_refuses_an_archived_case(client, office, auth_headers, close_case):
    admin = auth_headers(office.admin_a)
    lawyer = auth_headers(office.lawyer_a1)
    case = _new_case(client, lawyer, "2026/O5")
    close_case(lawyer, case["id"])
    assert client.post(f"/cases/{case['id']}/archive", headers=lawyer).status_code == 200
    response = client.patch(f"/admin/cases/{case['id']}/lawyer", json={"assigned_lawyer_id": office.lawyer_a2.id}, headers=admin)
    assert (response.status_code, response.json()["detail"]) == (409, "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.")
```

If the office fixture's users have no `password_set_at` and the assignment answers 422 in `test_admin_assignment_returns_the_new_name`, set `office.lawyer_a2.password_set_at` to `datetime.now(timezone.utc)` and commit at the start of that test (check `backend/app/models/user.py` first; ORM-created users normally get a value).

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_case_owner.py -q`
Expected: FAIL (`KeyError: 'assigned_lawyer_name'`, English messages, 200 on the archived case).

- [ ] **Step 3: Implement**

`backend/app/models/case.py`, class `Case`, next to the other relationships:

```python
    # The responsible lawyer, for showing their name. viewonly: assignments keep writing
    # assigned_lawyer_id; selectin: a case list loads every name in one extra query.
    assigned_lawyer: Mapped[Optional["User"]] = relationship(
        foreign_keys=[assigned_lawyer_id], lazy="selectin", viewonly=True,
    )

    @property
    def assigned_lawyer_name(self) -> Optional[str]:
        return self.assigned_lawyer.full_name if self.assigned_lawyer is not None else None
```

`backend/app/schemas/case.py`, `CaseOut`, right after `assigned_lawyer_id`:

```python
    assigned_lawyer_name: Optional[str] = None
```

`backend/app/repositories/case_repository.py`: add a module constant and change the lawyer filter in `list_in_firm`:

```python
# GET /cases?assigned_lawyer_id=none lists the cases nobody is responsible for.
UNASSIGNED = "none"
```

```python
        if assigned_lawyer_id == UNASSIGNED:
            query = query.filter(Case.assigned_lawyer_id.is_(None))
        elif assigned_lawyer_id is not None:
            query = query.filter(Case.assigned_lawyer_id == assigned_lawyer_id)
```

`backend/app/api/routes/admin.py`, `assign_case_lawyer` (import `require_case_writable` from `app.api.case_access`):

```python
    if case is None:
        raise HTTPException(status_code=404, detail="Dava bulunamadı.")
    require_case_writable(case)
    lawyer = ...  # unchanged query
    if lawyer is None:
        raise HTTPException(status_code=422, detail="Bu büroda aktif bir avukat seçin.")
    case.assigned_lawyer_id = lawyer.id
    db.commit()
    db.refresh(case)
    db.expire(case, ["assigned_lawyer"])  # the view-only relationship still points at the previous lawyer
    return case
```

Check the other tests that assert the old English texts: `grep -rn "Case not found\|Choose an active lawyer" tests/` and update only the assertions that hit `/admin/cases/{id}/lawyer` (the `/cases` routes keep their messages).

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/python -m pytest tests/api/test_case_owner.py tests/api/test_admin.py tests/api/test_cases.py tests/api/test_analytics.py tests/api/test_case_handover.py tests/api/test_admin_user_lifecycle.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/case.py backend/app/schemas/case.py backend/app/repositories/case_repository.py backend/app/api/routes/admin.py backend/tests/api/test_case_owner.py
git commit -m "feat: responsible lawyer's name on cases, unassigned filter, safer admin assignment"
```

(Add any test file you had to update in Step 3 to the `git add` line.)

---

### Task 4: Gelişmeler panel with entry types (frontend)

**Files:**
- Modify: `frontend/src/types/index.ts` (`CaseEvent`, `Case`)
- Modify: `frontend/src/lib/labels.ts` (add `CASE_EVENT_TYPE_LABELS`, `TIMELINE_FORM_TYPES`)
- Modify: `frontend/src/lib/api.ts` (`addCaseEvent` payload type)
- Create: `frontend/src/components/CaseTimelinePanel.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx` (use the panel; remove the old event form state and `handleAddEvent`)
- Test: `frontend/src/components/__tests__/CaseTimelinePanel.test.tsx`

**Interfaces:**
- Produces: `CaseEvent` now has `event_type: CaseEventType`, `created_by: string | null`, `created_by_name: string | null`; `Case.assigned_lawyer_name: string | null` (added here so later tasks compile); `CASE_EVENT_TYPE_LABELS: Record<CaseEventType, string>`; `TIMELINE_FORM_TYPES: CaseEventType[]`; `<CaseTimelinePanel caseId timeline readOnly onAdded />`.

- [ ] **Step 1: Types and labels**

`frontend/src/types/index.ts`:

```ts
export interface CaseEvent {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  event_type: CaseEventType;
  /** Who wrote it; null for imported or seeded entries. */
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}
```

and in `interface Case`, after `assigned_lawyer_id`:

```ts
  /** The responsible lawyer's full name; null when nobody is responsible. */
  assigned_lawyer_name: string | null;
```

`frontend/src/lib/labels.ts` (import `type { CaseEventType }` from `@/types`):

```ts
export const CASE_EVENT_TYPE_LABELS: Record<CaseEventType, string> = {
  filing: "Dava açılışı / dilekçe",
  submission: "Beyan / cevap",
  expert_report: "Bilirkişi raporu",
  legal_update: "Mevzuat / içtihat gelişmesi",
  other: "Diğer",
  hearing: "Duruşma",
  note: "Not",
};

/** Types offered in the Gelişmeler form. Notes come from the Notlar tab; hearings from the calendar. */
export const TIMELINE_FORM_TYPES: CaseEventType[] = ["filing", "submission", "expert_report", "legal_update", "other"];
```

`frontend/src/lib/api.ts`, `addCaseEvent`:

```ts
export async function addCaseEvent(
  caseId: string,
  payload: { event_date: string; title?: string; description?: string; event_type?: CaseEventType }
): Promise<CaseEvent> {
  return request(`/cases/${caseId}/events`, { method: "POST", body: JSON.stringify(payload) });
}
```

Run `npx tsc --noEmit`. Typed test fixtures or components that build a `Case` or `CaseEvent` literal now fail; add `assigned_lawyer_name: null` / `created_by: null, created_by_name: null` to each one tsc lists (only those). `NewCaseView.tsx` passes `suggestion.event_type`; if its type is `string`, cast through the `CaseEventType` union where the suggestion type is defined rather than widening the API type.

- [ ] **Step 2: Write the failing panel test**

`frontend/src/components/__tests__/CaseTimelinePanel.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addCaseEvent = vi.fn();
vi.mock("@/lib/api", () => ({ addCaseEvent: (...args: unknown[]) => addCaseEvent(...args) }));

import { CaseTimelinePanel } from "@/components/CaseTimelinePanel";
import { ApiError } from "@/lib/apiError";
import type { CaseEvent } from "@/types";

const entry = (over: Partial<CaseEvent>): CaseEvent => ({
  id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing",
  created_by: null, created_by_name: null, created_at: "2026-01-12T10:00:00", ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("CaseTimelinePanel", () => {
  it("shows each entry with its type badge and description", () => {
    // readOnly: no form, so the type select's options do not duplicate the badge texts.
    render(<CaseTimelinePanel caseId="c1" readOnly onAdded={vi.fn()} timeline={[
      entry({}),
      entry({ id: "e2", title: "Müvekkil aradı", event_type: "note" }),
      entry({ id: "e3", title: "Rapor", description: "Kusur oranı %70", event_type: "expert_report" }),
    ]} />);
    expect(screen.getByText("Dava açılışı / dilekçe")).toBeInTheDocument();
    expect(screen.getByText("Not")).toBeInTheDocument();
    expect(screen.getByText("Bilirkişi raporu")).toBeInTheDocument();
    expect(screen.getByText("Kusur oranı %70")).toBeInTheDocument();
  });

  it("offers the five form types, defaulting to Diğer", () => {
    render(<CaseTimelinePanel caseId="c1" readOnly={false} onAdded={vi.fn()} timeline={[]} />);
    const select = screen.getByLabelText("Tür") as HTMLSelectElement;
    expect(select.value).toBe("other");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Dava açılışı / dilekçe", "Beyan / cevap", "Bilirkişi raporu", "Mevzuat / içtihat gelişmesi", "Diğer",
    ]);
    expect(screen.getByText("Henüz gelişme yok.")).toBeInTheDocument();
  });

  it("sends type and description and hands the new entry up", async () => {
    const created = entry({ id: "e9", title: "Rapor geldi", event_type: "expert_report", description: "Ayrıntı" });
    addCaseEvent.mockResolvedValue(created);
    const onAdded = vi.fn();
    render(<CaseTimelinePanel caseId="c1" readOnly={false} onAdded={onAdded} timeline={[]} />);

    await userEvent.type(screen.getByLabelText("Tarih"), "2026-03-01");
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Rapor geldi");
    await userEvent.selectOptions(screen.getByLabelText("Tür"), "expert_report");
    await userEvent.type(screen.getByLabelText("Açıklama"), "Ayrıntı");
    await userEvent.click(screen.getByRole("button", { name: "Ekle" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(addCaseEvent).toHaveBeenCalledWith("c1", {
      event_date: "2026-03-01", title: "Rapor geldi", event_type: "expert_report", description: "Ayrıntı",
    });
    expect((screen.getByLabelText("Gelişme Başlığı") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Tür") as HTMLSelectElement).value).toBe("other");
  });

  it("omits an empty description, shows ApiError text and ignores a second click while saving", async () => {
    let reject: (error: unknown) => void = () => {};
    addCaseEvent.mockReturnValue(new Promise((_, r) => { reject = r; }));
    render(<CaseTimelinePanel caseId="c1" readOnly={false} onAdded={vi.fn()} timeline={[]} />);
    await userEvent.type(screen.getByLabelText("Tarih"), "2026-03-01");
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Dilekçe verildi");
    const button = screen.getByRole("button", { name: "Ekle" });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "Ekleniyor..." }));
    expect(addCaseEvent).toHaveBeenCalledTimes(1);
    expect(addCaseEvent.mock.calls[0][1]).toEqual({ event_date: "2026-03-01", title: "Dilekçe verildi", event_type: "other" });
    reject(new ApiError("Gelişme başlığı boş olamaz.", 422));
    expect(await screen.findByText("Gelişme başlığı boş olamaz.")).toBeInTheDocument();
  });

  it("hides the form on an archived case", () => {
    render(<CaseTimelinePanel caseId="c1" readOnly onAdded={vi.fn()} timeline={[entry({})]} />);
    expect(screen.queryByLabelText("Gelişme Başlığı")).toBeNull();
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/CaseTimelinePanel.test.tsx`
Expected: FAIL (cannot resolve `@/components/CaseTimelinePanel`).

- [ ] **Step 4: Implement the panel**

`frontend/src/components/CaseTimelinePanel.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { addCaseEvent } from "@/lib/api";
import { CASE_EVENT_TYPE_LABELS, TIMELINE_FORM_TYPES, formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { CaseEvent, CaseEventType } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

const INPUT = "rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400";
const EMPTY_FORM = { event_date: "", title: "", event_type: "other" as CaseEventType, description: "" };

interface Props {
  caseId: string;
  timeline: CaseEvent[];
  /** Archived case: the list stays, the form goes. */
  readOnly: boolean;
  onAdded: (event: CaseEvent) => void;
}

/** "Gelişmeler": the case timeline with a type badge per entry, and a form for typed entries (not notes). */
export function CaseTimelinePanel({ caseId, timeline, readOnly, onAdded }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    const description = form.description.trim();
    try {
      const created = await addCaseEvent(caseId, {
        event_date: form.event_date,
        title: form.title,
        event_type: form.event_type,
        ...(description ? { description } : {}),
      });
      onAdded(created);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(userMessage(err, "Gelişme eklenemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      {!readOnly && (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="event_date" className="mb-1 block text-xs font-medium text-navy-600">Tarih</label>
              <input id="event_date" type="date" required value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })} className={INPUT} />
            </div>
            <div className="min-w-[200px] flex-1">
              <label htmlFor="event_title" className="mb-1 block text-xs font-medium text-navy-600">Gelişme Başlığı</label>
              <input id="event_title" required maxLength={255} value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} className={`w-full ${INPUT}`} />
            </div>
            <div>
              <label htmlFor="event_type" className="mb-1 block text-xs font-medium text-navy-600">Tür</label>
              <select id="event_type" value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value as CaseEventType })} className={`bg-white ${INPUT}`}>
                {TIMELINE_FORM_TYPES.map((type) => (
                  <option key={type} value={type}>{CASE_EVENT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="event_description" className="mb-1 block text-xs font-medium text-navy-600">Açıklama</label>
            <textarea id="event_description" rows={2} maxLength={4000} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className={`w-full ${INPUT}`} />
          </div>
          <div className="flex justify-end">
            <button type="submit" aria-disabled={saving}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60">
              {saving ? "Ekleniyor..." : "Ekle"}
            </button>
          </div>
        </form>
      )}
      {error && <ErrorState message={error} />}

      {timeline.length === 0 ? (
        <EmptyState message="Henüz gelişme yok." />
      ) : (
        <ol className="space-y-4">
          {timeline.map((entry) => (
            <li key={entry.id} className="flex gap-4">
              <div className="w-24 shrink-0 text-xs text-navy-500">{formatDate(entry.event_date)}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-navy-800">{entry.title}</p>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-navy-600">
                    {CASE_EVENT_TYPE_LABELS[entry.event_type] ?? entry.event_type}
                  </span>
                </div>
                {entry.description && entry.event_type !== "note" && (
                  <p className="whitespace-pre-line text-xs text-navy-500">{entry.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

(A note's description is its full text, of which the title is the first line; the Notlar tab shows it in full, so the timeline shows only the title.)

In `frontend/src/components/CaseDetailView.tsx`:
- Remove `eventForm`, `addingEvent`, `eventError` state, `handleAddEvent`, and `addCaseEvent` from the API import.
- Replace the whole `{activeTab === "Gelişmeler" && (...)}` block with:

```tsx
      {activeTab === "Gelişmeler" && (
        <CaseTimelinePanel
          caseId={caseId}
          timeline={caseDetail.timeline}
          readOnly={archived}
          onAdded={(created) => setCaseDetail((prev) => (prev ? { ...prev, timeline: [...prev.timeline, created] } : prev))}
        />
      )}
```

- Import `CaseTimelinePanel`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/__tests__/CaseTimelinePanel.test.tsx src/components/__tests__/CaseDetailView.test.tsx src/components/__tests__/CaseDetailArchived.test.tsx src/components/__tests__/CaseDetailLifecycle.test.tsx && npx tsc --noEmit`
Expected: all pass. `CaseDetailView.test.tsx` line ~287 adds an event through the old form: the panel keeps the same labels and button, so it should pass; if it asserts the exact `addCaseEvent` payload, update the expectation to include `event_type: "other"`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/labels.ts frontend/src/lib/api.ts frontend/src/components/CaseTimelinePanel.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/__tests__/CaseTimelinePanel.test.tsx
git commit -m "feat: typed timeline entries in the Gelişmeler tab"
```

(Add every test fixture file you touched in Step 1 or 5.)

---

### Task 5: Notlar panel — add, edit, delete (frontend)

**Files:**
- Create: `frontend/src/lib/caseNotes.ts`
- Modify: `frontend/src/lib/api.ts` (add `updateCaseNote`, `deleteCaseNote`)
- Create: `frontend/src/components/CaseNotesPanel.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx` (Notlar tab)
- Test: `frontend/src/lib/__tests__/caseNotes.test.ts`, `frontend/src/components/__tests__/CaseNotesPanel.test.tsx`

**Interfaces:**
- Consumes: `CaseEvent` with `created_by` / `created_by_name` (Task 4); `addCaseEvent` (Task 4); `todayLocalISO()` from `@/lib/closing`; `ModalFrame`.
- Produces: `NOTE_MAX_LENGTH = 4000`; `noteText(note)`; `sortNotes(notes)`; `canChangeNote(me, assignedLawyerId, note)`; `updateCaseNote(caseId, eventId, payload)`; `deleteCaseNote(caseId, eventId)`; `<CaseNotesPanel caseId notes me assignedLawyerId readOnly onAdded onUpdated onDeleted />`.

- [ ] **Step 1: Write the failing helper tests**

`frontend/src/lib/__tests__/caseNotes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { canChangeNote, noteText, sortNotes } from "@/lib/caseNotes";
import type { CaseEvent } from "@/types";

const note = (over: Partial<CaseEvent>): CaseEvent => ({
  id: "n", event_date: "2026-10-01", title: "Başlık", description: "Başlık\nAyrıntı", event_type: "note",
  created_by: "u-author", created_by_name: "Yazar", created_at: "2026-10-01T09:00:00", ...over,
});

describe("caseNotes", () => {
  it("noteText prefers the full text and falls back to the title of old notes", () => {
    expect(noteText(note({}))).toBe("Başlık\nAyrıntı");
    expect(noteText(note({ description: null }))).toBe("Başlık");
  });

  it("sortNotes puts the newest date first, then the newest written", () => {
    const sorted = sortNotes([
      note({ id: "a", event_date: "2026-09-01" }),
      note({ id: "b", event_date: "2026-10-01", created_at: "2026-10-01T08:00:00" }),
      note({ id: "c", event_date: "2026-10-01", created_at: "2026-10-01T12:00:00" }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("canChangeNote: author, responsible lawyer or admin", () => {
    expect(canChangeNote({ id: "u-author", role: "lawyer" }, "u-owner", note({}))).toBe(true);
    expect(canChangeNote({ id: "u-owner", role: "lawyer" }, "u-owner", note({}))).toBe(true);
    expect(canChangeNote({ id: "u-admin", role: "admin" }, null, note({}))).toBe(true);
    expect(canChangeNote({ id: "u-other", role: "lawyer" }, "u-owner", note({}))).toBe(false);
    expect(canChangeNote({ id: "u-other", role: "lawyer" }, null, note({ created_by: null }))).toBe(false);
    expect(canChangeNote(null, "u-owner", note({}))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/caseNotes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers and API functions**

`frontend/src/lib/caseNotes.ts`:

```ts
import type { AppUser, CaseEvent } from "@/types";

export const NOTE_MAX_LENGTH = 4000;

/** A note's full text; notes written before the Notlar form only have a title. */
export function noteText(note: CaseEvent): string {
  return note.description ?? note.title;
}

export function sortNotes(notes: CaseEvent[]): CaseEvent[] {
  return [...notes].sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at));
}

/**
 * Who may edit or delete a note: its author, the case's responsible lawyer, admins.
 * Only decides what the page shows; the backend answers 403 whatever the page does.
 */
export function canChangeNote(
  me: Pick<AppUser, "id" | "role"> | null,
  assignedLawyerId: string | null,
  note: Pick<CaseEvent, "created_by">,
): boolean {
  if (!me) return false;
  if (me.role === "admin") return true;
  if (note.created_by !== null && note.created_by === me.id) return true;
  return assignedLawyerId !== null && assignedLawyerId === me.id;
}
```

`frontend/src/lib/api.ts`, after `addCaseEvent`:

```ts
export async function updateCaseNote(
  caseId: string,
  eventId: string,
  payload: { description?: string; event_date?: string }
): Promise<CaseEvent> {
  return request(`/cases/${caseId}/events/${eventId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteCaseNote(caseId: string, eventId: string): Promise<void> {
  return request(`/cases/${caseId}/events/${eventId}`, { method: "DELETE" });
}
```

Run: `npx vitest run src/lib/__tests__/caseNotes.test.ts` → PASS.

- [ ] **Step 4: Write the failing panel test**

`frontend/src/components/__tests__/CaseNotesPanel.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addCaseEvent = vi.fn();
const updateCaseNote = vi.fn();
const deleteCaseNote = vi.fn();
vi.mock("@/lib/api", () => ({
  addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
  updateCaseNote: (...args: unknown[]) => updateCaseNote(...args),
  deleteCaseNote: (...args: unknown[]) => deleteCaseNote(...args),
}));

import { CaseNotesPanel } from "@/components/CaseNotesPanel";
import { ApiError } from "@/lib/apiError";
import { todayLocalISO } from "@/lib/closing";
import type { CaseEvent } from "@/types";

const author = { id: "u-author", role: "lawyer" as const };
const stranger = { id: "u-x", role: "lawyer" as const };
const note = (over: Partial<CaseEvent>): CaseEvent => ({
  id: "n1", event_date: "2026-10-01", title: "Müvekkil aradı.", description: "Müvekkil aradı.\nYarın dönülecek.",
  event_type: "note", created_by: "u-author", created_by_name: "Ayşe Avukat", created_at: "2026-10-01T09:00:00", ...over,
});

function setup(props: Partial<React.ComponentProps<typeof CaseNotesPanel>> = {}) {
  const handlers = { onAdded: vi.fn(), onUpdated: vi.fn(), onDeleted: vi.fn() };
  render(<CaseNotesPanel caseId="c1" notes={[note({})]} me={author} assignedLawyerId="u-owner" readOnly={false} {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => vi.clearAllMocks());

describe("CaseNotesPanel", () => {
  it("lists notes newest first with author and full text", () => {
    setup({ notes: [note({}), note({ id: "n2", event_date: "2026-10-05", description: "Daha yeni", title: "Daha yeni", created_by_name: null })] });
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Daha yeni");
    expect(items[0]).not.toHaveTextContent("—");
    expect(items[1]).toHaveTextContent("— Ayşe Avukat");
    expect(items[1]).toHaveTextContent("Yarın dönülecek.");
  });

  it("adds a note dated today by default", async () => {
    const created = note({ id: "n9", description: "Yeni not", title: "Yeni not" });
    addCaseEvent.mockResolvedValue(created);
    const { onAdded } = setup({ notes: [] });
    expect(screen.getByText("Henüz not eklenmedi.")).toBeInTheDocument();
    expect((screen.getByLabelText("Tarih") as HTMLInputElement).value).toBe(todayLocalISO());

    await userEvent.type(screen.getByLabelText("Not"), "  Yeni not ");
    await userEvent.click(screen.getByRole("button", { name: "Not ekle" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(addCaseEvent).toHaveBeenCalledWith("c1", { event_date: todayLocalISO(), event_type: "note", description: "Yeni not" });
    expect((screen.getByLabelText("Not") as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses an empty note without calling the API and shows the counter", async () => {
    setup({ notes: [] });
    expect(screen.getByText("0/4000")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Not"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Not ekle" }));
    expect(await screen.findByText("Not metni boş olamaz.")).toBeInTheDocument();
    expect(addCaseEvent).not.toHaveBeenCalled();
  });

  it("edits a note in place", async () => {
    const updated = note({ description: "Düzeltilmiş", title: "Düzeltilmiş" });
    updateCaseNote.mockResolvedValue(updated);
    const { onUpdated } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    const editor = screen.getByLabelText("Notu düzenle") as HTMLTextAreaElement;
    expect(editor.value).toBe("Müvekkil aradı.\nYarın dönülecek.");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Düzeltilmiş");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(updateCaseNote).toHaveBeenCalledWith("c1", "n1", { description: "Düzeltilmiş", event_date: "2026-10-01" });
    expect(screen.queryByLabelText("Notu düzenle")).toBeNull();
  });

  it("keeps the editor open and shows the API message when saving fails", async () => {
    updateCaseNote.mockRejectedValue(new ApiError("Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir.", 403));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir.")).toBeInTheDocument();
    expect(screen.getByLabelText("Notu düzenle")).toBeInTheDocument();
  });

  it("deletes after confirmation", async () => {
    deleteCaseNote.mockResolvedValue(undefined);
    const { onDeleted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    const dialog = screen.getByRole("dialog", { name: "Not silinsin mi?" });
    expect(dialog).toHaveTextContent("Bu işlem geri alınamaz.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("n1"));
    expect(deleteCaseNote).toHaveBeenCalledWith("c1", "n1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the fallback when deleting fails with a non-API error", async () => {
    deleteCaseNote.mockRejectedValue(new Error("network"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sil" }));
    expect(await screen.findByText("Not silinemedi. Lütfen tekrar deneyin.")).toBeInTheDocument();
  });

  it("offers no edit or delete to someone who may not change the note", () => {
    setup({ me: stranger });
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("is read-only on an archived case", () => {
    setup({ readOnly: true });
    expect(screen.queryByLabelText("Not")).toBeNull();
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
    expect(screen.getByText(/Yarın dönülecek/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/components/__tests__/CaseNotesPanel.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 6: Implement the panel**

`frontend/src/components/CaseNotesPanel.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

import { addCaseEvent, deleteCaseNote, updateCaseNote } from "@/lib/api";
import { NOTE_MAX_LENGTH, canChangeNote, noteText, sortNotes } from "@/lib/caseNotes";
import { todayLocalISO } from "@/lib/closing";
import { formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, CaseEvent } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { ModalFrame } from "@/components/ModalFrame";

const INPUT = "rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400";
const SAVE_FAILED = "Not kaydedilemedi. Lütfen tekrar deneyin.";
const EMPTY_NOTE = "Not metni boş olamaz.";

interface Props {
  caseId: string;
  notes: CaseEvent[];
  me: Pick<AppUser, "id" | "role"> | null;
  assignedLawyerId: string | null;
  readOnly: boolean;
  onAdded: (note: CaseEvent) => void;
  onUpdated: (note: CaseEvent) => void;
  onDeleted: (noteId: string) => void;
}

/** "Notlar": notes are timeline entries of type "note"; any colleague adds, author / responsible lawyer / admin change. */
export function CaseNotesPanel({ caseId, notes, me, assignedLawyerId, readOnly, onAdded, onUpdated, onDeleted }: Props) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => todayLocalISO());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addInFlight = useRef(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editInFlight = useRef(false);

  const [deleteTarget, setDeleteTarget] = useState<CaseEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlight = useRef(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (addInFlight.current) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setAddError(EMPTY_NOTE);
      return;
    }
    addInFlight.current = true;
    setAdding(true);
    setAddError(null);
    try {
      const created = await addCaseEvent(caseId, { event_date: date, event_type: "note", description: trimmed });
      onAdded(created);
      setText("");
    } catch (err) {
      setAddError(userMessage(err, SAVE_FAILED));
    } finally {
      addInFlight.current = false;
      setAdding(false);
    }
  }

  function startEdit(note: CaseEvent) {
    setEditingId(note.id);
    setEditText(noteText(note));
    setEditDate(note.event_date);
    setEditError(null);
  }

  async function saveEdit(note: CaseEvent) {
    if (editInFlight.current) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError(EMPTY_NOTE);
      return;
    }
    editInFlight.current = true;
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await updateCaseNote(caseId, note.id, { description: trimmed, event_date: editDate });
      onUpdated(updated);
      setEditingId(null);
    } catch (err) {
      setEditError(userMessage(err, SAVE_FAILED));
    } finally {
      editInFlight.current = false;
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleteInFlight.current || !deleteTarget) return;
    const target = deleteTarget;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCaseNote(caseId, target.id);
      onDeleted(target.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(userMessage(err, "Not silinemedi. Lütfen tekrar deneyin."));
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  const sorted = sortNotes(notes);

  return (
    <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      {!readOnly && (
        <form onSubmit={add} noValidate className="space-y-2">
          <label htmlFor="note_text" className="block text-xs font-medium text-navy-600">Not</label>
          <textarea id="note_text" rows={3} maxLength={NOTE_MAX_LENGTH} value={text}
            onChange={(e) => setText(e.target.value)} className={`w-full ${INPUT}`} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label htmlFor="note_date" className="mb-1 block text-xs font-medium text-navy-600">Tarih</label>
              <input id="note_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-navy-400">{`${text.length}/${NOTE_MAX_LENGTH}`}</span>
              <button type="submit" aria-disabled={adding}
                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60">
                {adding ? "Ekleniyor..." : "Not ekle"}
              </button>
            </div>
          </div>
          {addError && <p role="alert" className="text-sm text-red-700">{addError}</p>}
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="Henüz not eklenmedi." />
      ) : (
        <ul className="space-y-4 text-sm">
          {sorted.map((note) => {
            const mayChange = !readOnly && canChangeNote(me, assignedLawyerId, note);
            const editing = editingId === note.id;
            return (
              <li key={note.id} className="border-b border-surface-border pb-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-navy-500">
                    {formatDate(note.event_date)}
                    {note.created_by_name ? ` — ${note.created_by_name}` : ""}
                  </p>
                  {mayChange && !editing && (
                    <div className="flex gap-2 text-xs font-semibold">
                      <button type="button" onClick={() => startEdit(note)} className="text-accent-700 hover:underline">Düzenle</button>
                      <button type="button" onClick={() => { setDeleteError(null); setDeleteTarget(note); }} className="text-red-700 hover:underline">Sil</button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="mt-2 space-y-2">
                    <textarea aria-label="Notu düzenle" rows={3} maxLength={NOTE_MAX_LENGTH} value={editText}
                      onChange={(e) => setEditText(e.target.value)} className={`w-full ${INPUT}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <input aria-label="Not tarihi" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={INPUT} />
                      <button type="button" aria-disabled={editSaving} onClick={() => void saveEdit(note)}
                        className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 aria-disabled:opacity-60">
                        {editSaving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                      <button type="button" aria-disabled={editSaving} onClick={() => { if (!editSaving) setEditingId(null); }}
                        className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-surface-muted">
                        Vazgeç
                      </button>
                    </div>
                    {editError && <p role="alert" className="text-sm text-red-700">{editError}</p>}
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-line text-navy-800">{noteText(note)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {deleteTarget && (
        <ModalFrame title="Not silinsin mi?" onClose={() => setDeleteTarget(null)} busy={deleting}>
          <p className="text-sm text-navy-700">Bu işlem geri alınamaz.</p>
          {deleteError && <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" aria-disabled={deleting} onClick={() => { if (!deleting) setDeleteTarget(null); }}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted">
              Vazgeç
            </button>
            <button type="button" aria-disabled={deleting} onClick={() => void confirmDelete()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 aria-disabled:opacity-60">
              {deleting ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}
```

Check `ModalFrame`'s props in `frontend/src/components/ModalFrame.tsx` before using it; if its children layout or prop names differ (e.g. it renders its own button row), adapt to the same pattern `CaseConfirmModal.tsx` uses.

In `frontend/src/components/CaseDetailView.tsx`, replace the `{activeTab === "Notlar" && (...)}` block and remove the now unused `notes` constant:

```tsx
      {activeTab === "Notlar" && (
        <CaseNotesPanel
          caseId={caseId}
          notes={caseDetail.timeline.filter((entry) => entry.event_type === "note")}
          me={me}
          assignedLawyerId={caseDetail.assigned_lawyer_id}
          readOnly={archived}
          onAdded={(created) => setCaseDetail((prev) => (prev ? { ...prev, timeline: [...prev.timeline, created] } : prev))}
          onUpdated={(updated) =>
            setCaseDetail((prev) => (prev ? { ...prev, timeline: prev.timeline.map((e) => (e.id === updated.id ? updated : e)) } : prev))
          }
          onDeleted={(noteId) =>
            setCaseDetail((prev) => (prev ? { ...prev, timeline: prev.timeline.filter((e) => e.id !== noteId) } : prev))
          }
        />
      )}
```

Import `CaseNotesPanel`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/__tests__/caseNotes.test.ts src/components/__tests__/CaseNotesPanel.test.tsx src/components/__tests__/CaseDetailView.test.tsx src/components/__tests__/CaseDetailArchived.test.tsx && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/caseNotes.ts frontend/src/lib/__tests__/caseNotes.test.ts frontend/src/lib/api.ts frontend/src/components/CaseNotesPanel.tsx frontend/src/components/__tests__/CaseNotesPanel.test.tsx frontend/src/components/CaseDetailView.tsx
git commit -m "feat: add, edit and delete notes in the Notlar tab"
```

---

### Task 6: Way back to the list (frontend)

**Files:**
- Create: `frontend/src/lib/caseListMemory.ts`
- Modify: `frontend/src/components/CaseListView.tsx` (remember the list URL)
- Modify: `frontend/src/components/CaseHeader.tsx` (`← Davalar` link)
- Modify: `frontend/src/components/WorkspaceHeader.tsx` (section link)
- Modify: `frontend/src/components/__tests__/WorkspaceHeader.test.tsx`, `frontend/src/components/__tests__/UserMenu.test.tsx` (breadcrumb assertion)
- Test: `frontend/src/lib/__tests__/caseListMemory.test.ts`, `frontend/src/components/__tests__/CaseHeader.test.tsx`

**Interfaces:**
- Produces: `rememberCaseListHref(href: string): void`, `lastCaseListHref(): string`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/__tests__/caseListMemory.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { lastCaseListHref, rememberCaseListHref } from "@/lib/caseListMemory";

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("caseListMemory", () => {
  it("returns the last remembered list URL", () => {
    rememberCaseListHref("/davalar?durum=aktif&avukat=u1");
    expect(lastCaseListHref()).toBe("/davalar?durum=aktif&avukat=u1");
  });

  it("falls back to /davalar when nothing or something foreign is stored", () => {
    expect(lastCaseListHref()).toBe("/davalar");
    window.sessionStorage.setItem("casebridge:lastCaseListHref", "https://evil.example/davalar");
    expect(lastCaseListHref()).toBe("/davalar");
    rememberCaseListHref("/gorevler");
    expect(lastCaseListHref()).toBe("/davalar");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => rememberCaseListHref("/davalar?ara=x")).not.toThrow();
    expect(lastCaseListHref()).toBe("/davalar");
  });
});
```

`frontend/src/components/__tests__/CaseHeader.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CaseHeader } from "@/components/CaseHeader";
import { rememberCaseListHref } from "@/lib/caseListMemory";
import type { Case } from "@/types";

const base = {
  id: "c1", case_number: "2026/1", case_name: "Kira Davası", client_name: "Deniz", opposing_party: null,
  status: "devam_eden", outcome: "ongoing", is_archived: false, assigned_lawyer_id: "u1", assigned_lawyer_name: "Ayşe Demir",
} as unknown as Case;

afterEach(() => window.sessionStorage.clear());

describe("CaseHeader", () => {
  it("links back to the last case list and names the responsible lawyer", async () => {
    rememberCaseListHref("/davalar?durum=aktif");
    render(<CaseHeader caseDetail={base} actions={[]} busy={false} actionError={null} onPick={() => {}} />);
    expect(await screen.findByRole("link", { name: "← Davalar" })).toHaveAttribute("href", "/davalar?durum=aktif");
    expect(screen.getByText("Sorumlu: Ayşe Demir")).toBeInTheDocument();
  });

  it("falls back to /davalar and says when nobody is responsible", () => {
    render(<CaseHeader caseDetail={{ ...base, assigned_lawyer_id: null, assigned_lawyer_name: null }} actions={[]} busy={false} actionError={null} onPick={() => {}} />);
    expect(screen.getByRole("link", { name: "← Davalar" })).toHaveAttribute("href", "/davalar");
    expect(screen.getByText("Sorumlu: Atanmamış")).toBeInTheDocument();
  });
});
```

(The `Sorumlu:` line belongs to Task 7 conceptually but lives in the same component; it is implemented here so the header changes once.)

In `frontend/src/components/__tests__/WorkspaceHeader.test.tsx`, replace `expect(screen.getByText("CaseBridge / Admin Paneli")).toBeInTheDocument();` with:

```tsx
    const section = screen.getByRole("link", { name: "Admin Paneli" });
    expect(section).toHaveAttribute("href", "/admin");
    expect(section).toHaveAttribute("aria-current", "page");
```

and add a test:

```tsx
  it("links the section name to its list from a page inside it", () => {
    setUrl("/davalar/c1");
    render(<WorkspaceHeader user={null} />);
    const section = screen.getByRole("link", { name: "Davalar" });
    expect(section).toHaveAttribute("href", "/davalar");
    expect(section).not.toHaveAttribute("aria-current");
  });
```

In `frontend/src/components/__tests__/UserMenu.test.tsx` line ~115 replace `screen.getByText("CaseBridge / Hesabım")` with `screen.getByRole("link", { name: "Hesabım" })` scoped so it does not collide with a menu item of the same name: use `within(screen.getByRole("banner")).getAllByRole("link", { name: "Hesabım" })[0]` if needed and assert `href="/hesabim"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/__tests__/caseListMemory.test.ts src/components/__tests__/CaseHeader.test.tsx src/components/__tests__/WorkspaceHeader.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`frontend/src/lib/caseListMemory.ts`:

```ts
/**
 * The case list's last URL (with its filters), so "← Davalar" on a case page
 * returns to the list the user came from. Per tab (sessionStorage); any storage
 * failure falls back to the plain list.
 */
const KEY = "casebridge:lastCaseListHref";
const LIST_HREF = /^\/davalar(\?|$)/;

export function rememberCaseListHref(href: string): void {
  if (!LIST_HREF.test(href)) return;
  try {
    window.sessionStorage.setItem(KEY, href);
  } catch {
    // Storage blocked: the back link uses the plain list.
  }
}

export function lastCaseListHref(): string {
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored && LIST_HREF.test(stored)) return stored;
  } catch {
    // Storage blocked.
  }
  return "/davalar";
}
```

`frontend/src/components/CaseListView.tsx`: import `rememberCaseListHref` and add next to the load effect:

```tsx
  useEffect(() => {
    rememberCaseListHref(queryKey);
  }, [queryKey]);
```

`frontend/src/components/CaseHeader.tsx`: add `import Link from "next/link";`, `import { useEffect, useState } from "react";`, `import { lastCaseListHref } from "@/lib/caseListMemory";`. In `CaseHeader`:

```tsx
export function CaseHeader({ caseDetail, actions, busy, actionError, onPick }: Props) {
  // Read after mount: sessionStorage does not exist during the server render.
  const [backHref, setBackHref] = useState("/davalar");
  useEffect(() => setBackHref(lastCaseListHref()), []);

  return (
    <div className="space-y-2">
      <Link href={backHref} className="inline-block text-xs font-semibold text-accent-700 hover:underline">
        ← Davalar
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent-600">{caseDetail.case_number}</p>
          <h1 className="text-xl font-semibold text-navy-900">{caseDetail.case_name}</h1>
          <p className="text-sm text-navy-500">
            {caseDetail.client_name}
            {caseDetail.opposing_party ? ` vs. ${caseDetail.opposing_party}` : ""}
          </p>
          <p className="text-sm text-navy-500">{`Sorumlu: ${caseDetail.assigned_lawyer_name ?? "Atanmamış"}`}</p>
        </div>
        <CaseActionsMenu actions={actions} busy={busy} onPick={onPick} />
      </div>
      {/* the rest of the component is unchanged */}
```

`frontend/src/components/WorkspaceHeader.tsx`: replace `titleForPath` with a function returning the route too, and render a link:

```tsx
function sectionForPath(pathname: string): { href: string; title: string } | null {
  const key = Object.keys(PAGE_TITLES)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { href: key, title: PAGE_TITLES[key] } : null;
}
```

```tsx
  const section = sectionForPath(pathname);
  ...
        <p className="text-xs font-medium text-navy-500">
          CaseBridge /{" "}
          {section ? (
            <Link href={section.href} aria-current={pathname === section.href ? "page" : undefined} className="hover:text-accent-700 hover:underline">
              {section.title}
            </Link>
          ) : (
            "Çalışma Alanı"
          )}
        </p>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/__tests__/caseListMemory.test.ts src/components/__tests__/CaseHeader.test.tsx src/components/__tests__/WorkspaceHeader.test.tsx src/components/__tests__/UserMenu.test.tsx src/components/__tests__/CaseListView.test.tsx src/components/__tests__/CaseDetailLifecycle.test.tsx && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/caseListMemory.ts frontend/src/lib/__tests__/caseListMemory.test.ts frontend/src/components/CaseListView.tsx frontend/src/components/CaseHeader.tsx frontend/src/components/__tests__/CaseHeader.test.tsx frontend/src/components/WorkspaceHeader.tsx frontend/src/components/__tests__/WorkspaceHeader.test.tsx frontend/src/components/__tests__/UserMenu.test.tsx
git commit -m "feat: back link to the filtered case list, clickable section name, responsible lawyer in the case header"
```

---

### Task 7: Responsible lawyer in the list, filter and quick view (frontend)

**Files:**
- Modify: `frontend/src/lib/filters.ts` (`toCaseListFilters`, `describeCaseListQuery`, constant `UNASSIGNED_SLUG`)
- Modify: `frontend/src/components/CaseListView.tsx` (column, filter select, chip label)
- Modify: `frontend/src/components/CaseQuickView.tsx` (`Sorumlu avukat` field)
- Test: `frontend/src/components/__tests__/CaseListView.test.tsx` (append), `frontend/src/components/__tests__/CaseQuickView.test.tsx` (append), `frontend/src/lib/__tests__/filters.test.ts` (append)

**Interfaces:**
- Consumes: `Case.assigned_lawyer_name` (Task 4), `GET /cases?assigned_lawyer_id=none` (Task 3), `listUsers()`, `getMe()`.
- Produces: `UNASSIGNED_SLUG = "yok"`; `describeCaseListQuery(query, ownerLabel?: string)`.

- [ ] **Step 1: Write the failing filter tests**

Append to `frontend/src/lib/__tests__/filters.test.ts`:

```ts
describe("responsible lawyer filter", () => {
  it("maps avukat=yok to the API's none and keeps ids as they are", () => {
    expect(toCaseListFilters({ avukat: "yok" }).assigned_lawyer_id).toBe("none");
    expect(toCaseListFilters({ avukat: "u1" }).assigned_lawyer_id).toBe("u1");
  });

  it("names the chip after the given label", () => {
    expect(describeCaseListQuery({ avukat: "u1" }, "Ayşe Demir")).toContainEqual({ key: "avukat", label: "Sorumlu: Ayşe Demir" });
    expect(describeCaseListQuery({ avukat: "u1" })).toContainEqual({ key: "avukat", label: "Sorumlu: Diğer avukat" });
  });
});
```

(Import `toCaseListFilters` / `describeCaseListQuery` if the file does not already.)

- [ ] **Step 2: Implement the filter helpers**

`frontend/src/lib/filters.ts`:

```ts
/** URL value of the "Atanmamış" choice; the API's value is "none". */
export const UNASSIGNED_SLUG = "yok";
```

In `toCaseListFilters`:

```ts
  if (query.avukat) filters.assigned_lawyer_id = query.avukat === UNASSIGNED_SLUG ? "none" : query.avukat;
```

`describeCaseListQuery` gains a second parameter and a new chip text:

```ts
export function describeCaseListQuery(query: CaseListQuery, ownerLabel?: string): FilterChip[] {
  ...
  if (query.avukat) chips.push({ key: "avukat", label: `Sorumlu: ${ownerLabel ?? "Diğer avukat"}` });
  return chips;
}
```

Run the filters tests → PASS.

- [ ] **Step 3: Write the failing list and quick view tests**

Read the top of `frontend/src/components/__tests__/CaseListView.test.tsx` first and reuse its mocks; it must now also mock `getMe` and `listUsers` from `@/lib/api` (add them to the existing `vi.mock` factory with defaults `getMe.mockResolvedValue({ id: "u-me", role: "lawyer", full_name: "Ben" })` and `listUsers.mockResolvedValue([...])` in `beforeEach`). Append:

```tsx
describe("responsible lawyer", () => {
  const colleagues = [
    { id: "u-me", full_name: "Ben Avukat", role: "lawyer" },
    { id: "u-2", full_name: "Zeynep Arslan", role: "lawyer" },
    { id: "u-admin", full_name: "Yönetici", role: "admin" },
  ];

  beforeEach(() => {
    listUsers.mockResolvedValue(colleagues);
    getMe.mockResolvedValue({ id: "u-me", role: "lawyer", full_name: "Ben Avukat" });
  });

  it("shows a Sorumlu column with the name or a dash", async () => {
    getCases.mockResolvedValue([
      { ...CASE_ROW, id: "c1", assigned_lawyer_id: "u-2", assigned_lawyer_name: "Zeynep Arslan" },
      { ...CASE_ROW, id: "c2", case_number: "2026/2", assigned_lawyer_id: null, assigned_lawyer_name: null },
    ]);
    render(<CaseListView />);
    expect(await screen.findByRole("columnheader", { name: "Sorumlu" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Zeynep Arslan");
    expect(rows[1]).toHaveTextContent("—");
  });

  it("offers my cases, the lawyers and unassigned, and writes the choice to the URL", async () => {
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    const select = await screen.findByLabelText("Sorumlu filtresi");
    await waitFor(() => expect(within(select).getByRole("option", { name: "Zeynep Arslan" })).toBeInTheDocument());
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Tüm sorumlular", "Benim davalarım", "Zeynep Arslan", "Atanmamış",
    ]);
    await userEvent.selectOptions(select, "yok");
    expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("avukat=yok"), expect.anything());
  });

  it("asks the API for unassigned cases and names the chip", async () => {
    setUrl("/davalar?avukat=yok");
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    await waitFor(() => expect(getCases).toHaveBeenCalledWith(expect.objectContaining({ assigned_lawyer_id: "none" })));
    expect(await screen.findByText("Sorumlu: Atanmamış")).toBeInTheDocument();
  });

  it("keeps an unknown lawyer id selectable as Diğer avukat", async () => {
    setUrl("/davalar?avukat=u-gone");
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    const select = (await screen.findByLabelText("Sorumlu filtresi")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("u-gone"));
    expect(within(select).getByRole("option", { name: "Diğer avukat" })).toBeInTheDocument();
  });
});
```

`CASE_ROW` is whatever case fixture the file already uses (rename to match); `nav`, `setUrl` come from `@/test/navigation` (already used by the file if it mocks `next/navigation`; otherwise add the mock like `WorkspaceHeader.test.tsx` does). `setParams` calls `router.replace(href, { scroll: false })` (see `frontend/src/lib/urlState.ts`).

Append to `frontend/src/components/__tests__/CaseQuickView.test.tsx` a test that renders the quick view for a case with `assigned_lawyer_name: "Zeynep Arslan"` (copy the file's existing render helper) and asserts:

```tsx
    expect(await screen.findByText("Sorumlu avukat")).toBeInTheDocument();
    expect(screen.getByText("Zeynep Arslan")).toBeInTheDocument();
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/components/__tests__/CaseListView.test.tsx src/components/__tests__/CaseQuickView.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 5: Implement**

`frontend/src/components/CaseQuickView.tsx`, in the `<dl>` after `Mahkeme`:

```tsx
        <Field label="Sorumlu avukat" value={detail.assigned_lawyer_name} />
```

`frontend/src/components/CaseListView.tsx`:
- Imports: `getMe, listUsers` from `@/lib/api`; `UNASSIGNED_SLUG` from `@/lib/filters`; `AppUser` type.
- State and loading (once, failures leave the lists empty — the select still offers `Tüm sorumlular` and `Atanmamış`):

```tsx
  const [me, setMe] = useState<AppUser | null>(null);
  const [lawyers, setLawyers] = useState<AppUser[]>([]);

  useEffect(() => {
    let active = true;
    getMe().then((user) => active && setMe(user)).catch(() => {});
    listUsers()
      .then((users) => active && setLawyers(users.filter((user) => user.role === "lawyer").sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const myId = me?.role === "lawyer" ? me.id : null;
  const otherLawyers = lawyers.filter((lawyer) => lawyer.id !== myId);
  const owner = query.avukat;
  const ownerKnown = !owner || owner === UNASSIGNED_SLUG || owner === myId || otherLawyers.some((lawyer) => lawyer.id === owner);
  const ownerLabel = !owner
    ? undefined
    : owner === UNASSIGNED_SLUG
      ? "Atanmamış"
      : owner === myId
        ? "Benim davalarım"
        : otherLawyers.find((lawyer) => lawyer.id === owner)?.full_name;
```

- Replace `const chips = describeCaseListQuery(query);` (now declared after `ownerLabel`) with `const chips = describeCaseListQuery(query, ownerLabel);` — move the line below the block above.
- Filter select, after the `Sonuç filtresi` select:

```tsx
        <select aria-label="Sorumlu filtresi" value={owner ?? ""} onChange={(e) => setParams({ avukat: e.target.value || null })} className={SELECT}>
          <option value="">Tüm sorumlular</option>
          {myId && <option value={myId}>Benim davalarım</option>}
          {otherLawyers.map((lawyer) => (
            <option key={lawyer.id} value={lawyer.id}>{lawyer.full_name}</option>
          ))}
          <option value={UNASSIGNED_SLUG}>Atanmamış</option>
          {!ownerKnown && owner && <option value={owner}>Diğer avukat</option>}
        </select>
```

- Table: header `<th className="px-4 py-3 font-medium">Sorumlu</th>` before `Durum`; cell before the status cell:

```tsx
                  <td className="px-4 py-3 text-navy-700">{c.assigned_lawyer_name ?? "—"}</td>
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/__tests__/CaseListView.test.tsx src/components/__tests__/CaseQuickView.test.tsx && npx vitest run && npx tsc --noEmit`
Expected: all pass (the full run catches other pages that render `CaseListView` or call `describeCaseListQuery`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/filters.ts frontend/src/components/CaseListView.tsx frontend/src/components/CaseQuickView.tsx frontend/src/components/__tests__/CaseListView.test.tsx frontend/src/components/__tests__/CaseQuickView.test.tsx
git commit -m "feat: responsible lawyer column, filter and quick view field"
```

(Also `git add frontend/src/lib/__tests__/filters.test.ts`.)

---

### Task 8: Admin changes the responsible lawyer from the edit dialog (frontend)

**Files:**
- Modify: `frontend/src/components/CaseEditModal.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx` (props)
- Test: `frontend/src/components/__tests__/CaseEditModal.test.tsx` (append)

**Interfaces:**
- Consumes: `listAdminLawyers()`, `assignCaseLawyer(caseId, lawyerId)`, `Case.assigned_lawyer_name`.
- Produces: `CaseEditModal` props `isAdmin: boolean`, `onUpdated: (updated: Case) => void` (saved but the dialog stays open), existing `onSaved` (saved, close).

- [ ] **Step 1: Write the failing tests**

Read the top of `frontend/src/components/__tests__/CaseEditModal.test.tsx` and reuse its case fixture and API mocks; add `listAdminLawyers` and `assignCaseLawyer` mocks to the factory. Pass `isAdmin={false} onUpdated={vi.fn()}` in the existing renders. Append:

```tsx
describe("responsible lawyer (admin)", () => {
  const lawyers = [
    { id: "u-owner", full_name: "Ayşe Avukat", role: "lawyer" },
    { id: "u-2", full_name: "Zeynep Arslan", role: "lawyer" },
  ];

  it("is not shown to a lawyer", () => {
    renderModal({ isAdmin: false });
    expect(screen.queryByLabelText("Sorumlu avukat")).toBeNull();
    expect(listAdminLawyers).not.toHaveBeenCalled();
  });

  it("saves the details, then the new lawyer, then closes", async () => {
    listAdminLawyers.mockResolvedValue(lawyers);
    updateCase.mockResolvedValue({ ...CASE, case_name: "Yeni ad" });
    assignCaseLawyer.mockResolvedValue({ ...CASE, assigned_lawyer_id: "u-2", assigned_lawyer_name: "Zeynep Arslan" });
    const { onSaved } = renderModal({ isAdmin: true });
    const select = await screen.findByLabelText("Sorumlu avukat");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("u-owner"));
    await userEvent.selectOptions(select, "u-2");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ assigned_lawyer_name: "Zeynep Arslan" })));
    expect(assignCaseLawyer).toHaveBeenCalledWith(CASE.id, "u-2");
    expect(updateCase.mock.invocationCallOrder[0]).toBeLessThan(assignCaseLawyer.mock.invocationCallOrder[0]);
  });

  it("does not call the assignment when the lawyer did not change", async () => {
    listAdminLawyers.mockResolvedValue(lawyers);
    updateCase.mockResolvedValue(CASE);
    const { onSaved } = renderModal({ isAdmin: true });
    await screen.findByLabelText("Sorumlu avukat");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(assignCaseLawyer).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when only the assignment fails", async () => {
    listAdminLawyers.mockResolvedValue(lawyers);
    const saved = { ...CASE, case_name: "Yeni ad" };
    updateCase.mockResolvedValue(saved);
    assignCaseLawyer.mockRejectedValue(new Error("network"));
    const { onSaved, onUpdated } = renderModal({ isAdmin: true });
    await userEvent.selectOptions(await screen.findByLabelText("Sorumlu avukat"), "u-2");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Bilgiler kaydedildi ancak sorumlu avukat değiştirilemedi.")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledWith(saved);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a current lawyer who is no longer assignable as (pasif)", async () => {
    listAdminLawyers.mockResolvedValue([lawyers[1]]);
    renderModal({ isAdmin: true });
    const select = await screen.findByLabelText("Sorumlu avukat");
    await waitFor(() => expect(within(select).getByRole("option", { name: "Ayşe Avukat (pasif)" })).toBeInTheDocument());
  });

  it("offers Avukat seçin for an unassigned case and keeps saving possible when the list fails", async () => {
    listAdminLawyers.mockRejectedValue(new Error("network"));
    updateCase.mockResolvedValue(CASE);
    const { onSaved } = renderModal({ isAdmin: true, caseDetail: { ...CASE, assigned_lawyer_id: null, assigned_lawyer_name: null } });
    expect(await screen.findByText("Avukat listesi yüklenemedi.")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Sorumlu avukat")).getByRole("option", { name: "Avukat seçin" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(assignCaseLawyer).not.toHaveBeenCalled();
  });
});
```

Write `renderModal(overrides)` in the file if it has no such helper: it renders `<CaseEditModal caseDetail={CASE} isAdmin={false} onClose={vi.fn()} onSaved={onSaved} onUpdated={onUpdated} {...overrides} />` and returns `{ onSaved, onUpdated }`. `CASE` (the file's fixture) needs `assigned_lawyer_id: "u-owner", assigned_lawyer_name: "Ayşe Avukat"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/__tests__/CaseEditModal.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`frontend/src/components/CaseEditModal.tsx`:
- Imports: `useEffect`; `assignCaseLawyer, listAdminLawyers` from `@/lib/api`; `AppUser` type.
- Props:

```tsx
interface Props {
  caseDetail: Case;
  /** Admins also choose the responsible lawyer here. */
  isAdmin: boolean;
  onClose: () => void;
  /** Everything saved: the parent closes the dialog. */
  onSaved: (updated: Case) => void;
  /** The details were saved but the dialog stays open (the lawyer could not be changed). */
  onUpdated: (updated: Case) => void;
}
```

- State and loading:

```tsx
  const currentLawyerId = caseDetail.assigned_lawyer_id ?? "";
  const [lawyerId, setLawyerId] = useState(currentLawyerId);
  const [lawyers, setLawyers] = useState<AppUser[] | null>(null);
  const [lawyersFailed, setLawyersFailed] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    listAdminLawyers()
      .then((rows) => active && setLawyers(rows))
      .catch(() => active && setLawyersFailed(true));
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const currentMissing = currentLawyerId !== "" && !(lawyers ?? []).some((lawyer) => lawyer.id === currentLawyerId);
```

- `save()` after the PATCH:

```tsx
    try {
      const updated = await updateCase(caseDetail.id, buildBasicInfoPayload(form, { includeStatus: !closed }));
      if (isAdmin && lawyerId !== "" && lawyerId !== currentLawyerId) {
        try {
          onSaved(await assignCaseLawyer(caseDetail.id, lawyerId));
        } catch {
          onUpdated(updated);
          setError("Bilgiler kaydedildi ancak sorumlu avukat değiştirilemedi.");
        }
        return;
      }
      onSaved(updated);
    } catch (err) {
      setError(userMessage(err, "Dava bilgileri kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
```

(The `return` inside `try` still runs `finally`.)

- Field, after `<BasicInfoFields ... />`:

```tsx
        {isAdmin && (
          <div>
            <label htmlFor="case_owner" className="mb-1 block text-xs font-medium text-navy-600">Sorumlu avukat</label>
            <select id="case_owner" value={lawyerId} onChange={(e) => setLawyerId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm outline-none focus:border-accent-400">
              {currentLawyerId === "" && <option value="">Avukat seçin</option>}
              {currentMissing && (
                <option value={currentLawyerId}>{`${caseDetail.assigned_lawyer_name ?? "Mevcut avukat"} (pasif)`}</option>
              )}
              {(lawyers ?? []).map((lawyer) => (
                <option key={lawyer.id} value={lawyer.id}>{lawyer.full_name}</option>
              ))}
            </select>
            {lawyersFailed && <p className="mt-1 text-xs text-red-700">Avukat listesi yüklenemedi.</p>}
          </div>
        )}
```

While the list is loading `currentMissing` is true for a moment and shows `(pasif)`; avoid the flicker by computing `currentMissing` only when `lawyers !== null || lawyersFailed` (when the list failed, the current lawyer is shown as an option with the plain name instead: use `${caseDetail.assigned_lawyer_name ?? "Mevcut avukat"}` without ` (pasif)` in that case). Keep the tests' expectations: the `(pasif)` option appears once the list has loaded without the current lawyer.

`frontend/src/components/CaseDetailView.tsx`:

```tsx
      {dialog === "edit" && (
        <CaseEditModal
          caseDetail={caseDetail}
          isAdmin={me?.role === "admin"}
          onClose={() => setDialog(null)}
          onSaved={(updated) => {
            handleCaseSaved(updated);
            setDialog(null);
          }}
          onUpdated={handleCaseSaved}
        />
      )}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/__tests__/CaseEditModal.test.tsx src/components/__tests__/CaseDetailLifecycle.test.tsx src/components/__tests__/CaseDetailActions.test.tsx && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CaseEditModal.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/__tests__/CaseEditModal.test.tsx
git commit -m "feat: admins change the responsible lawyer from the case edit dialog"
```

---

### Task 9: End-to-end flow and full verification

**Files:**
- Create: `tests/e2e/specs/12-case-notes-and-owner.spec.ts`

- [ ] **Step 1: Write the E2E spec**

```ts
import { test, expect } from "@playwright/test";
import { BACKEND_URL, DEMO_LAWYER, login } from "./helpers";

// Flow 12: a lawyer writes, edits and deletes a note, adds a typed timeline entry,
// filters the case list to "Benim davalarım", opens the case and comes back to the
// filtered list with "← Davalar". One login; the token is reused for the API setup.

const STAMP = Date.now();
const CASE_NAME = `E2E Notlar ${STAMP}`;

test("notes, typed entries, responsible lawyer and the way back to the list", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, DEMO_LAWYER);
  const token = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const me = await (await page.request.get(`${BACKEND_URL}/users/me`, { headers })).json();
  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers,
    data: { case_number: `E2E-NO-${STAMP}`, case_name: CASE_NAME, client_name: "E2E Müvekkil", case_type: "diger", opening_date: "2026-02-03" },
  });
  expect(created.ok()).toBeTruthy();
  const caseId = (await created.json()).id as string;

  // --- List: Sorumlu column and "Benim davalarım" ---
  await page.goto("/davalar");
  await page.getByLabel("Sorumlu filtresi").selectOption({ label: "Benim davalarım" });
  await expect(page).toHaveURL(new RegExp(`avukat=${me.id}`));
  const row = page.getByRole("row", { name: new RegExp(CASE_NAME) });
  await expect(row).toContainText(me.full_name);
  await row.getByRole("link", { name: CASE_NAME }).click();

  // --- Header ---
  await expect(page.getByRole("heading", { name: CASE_NAME })).toBeVisible();
  await expect(page.getByText(`Sorumlu: ${me.full_name}`)).toBeVisible();

  // --- Notlar: add, edit, delete ---
  await page.getByRole("tab", { name: "Notlar" }).click();
  await page.getByLabel("Not", { exact: true }).fill("Müvekkil aradı.\nYarın dönülecek.");
  await page.getByRole("button", { name: "Not ekle" }).click();
  await expect(page.getByText(`— ${me.full_name}`)).toBeVisible();
  await page.getByRole("button", { name: "Düzenle" }).click();
  await page.getByLabel("Notu düzenle").fill("Müvekkil aradı, belgeler istendi.");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Müvekkil aradı, belgeler istendi.")).toBeVisible();
  await page.getByRole("button", { name: "Sil" }).click();
  await page.getByRole("dialog", { name: "Not silinsin mi?" }).getByRole("button", { name: "Sil" }).click();
  await expect(page.getByText("Henüz not eklenmedi.")).toBeVisible();

  // --- Gelişmeler: typed entry ---
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await page.getByLabel("Tarih").fill("2026-03-01");
  await page.getByLabel("Gelişme Başlığı").fill("Bilirkişi raporu tebliğ edildi");
  await page.getByLabel("Tür").selectOption({ label: "Bilirkişi raporu" });
  await page.getByRole("button", { name: "Ekle" }).click();
  const entry = page.getByRole("listitem").filter({ hasText: "Bilirkişi raporu tebliğ edildi" });
  await expect(entry).toContainText("Bilirkişi raporu");

  // --- Back to the filtered list ---
  await page.getByRole("link", { name: "← Davalar" }).click();
  await expect(page).toHaveURL(new RegExp(`/davalar\\?.*avukat=${me.id}`));
  await expect(page.getByText("Sorumlu: Benim davalarım")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E spec and the whole suite**

Run (from `tests/e2e/`): `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test specs/12-case-notes-and-owner.spec.ts`
Expected: 1 passed. Then `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test` → all pass except the known `07-ai-chat` test 2 ("Standart · mock"), which fails on this branch's base too. `05-click-through` and `11-case-lifecycle` use the Gelişmeler form and the breadcrumb: if they fail, fix the selectors to the new labels (the labels `Tarih`, `Gelişme Başlığı`, `Ekle` are unchanged on purpose).

- [ ] **Step 3: Full verification**

Run, and paste the summary lines into the commit body:
- `cd backend && .venv/bin/python -m pytest -q` (≈10 min) → all pass.
- `cd frontend && npx vitest run && npx tsc --noEmit && npm run build` → all pass, build clean.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/12-case-notes-and-owner.spec.ts
git commit -m "test: end-to-end flow for notes, typed entries, responsible lawyer and the back link"
```

(Add any E2E spec you had to fix in Step 2.)
