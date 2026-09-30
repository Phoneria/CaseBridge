# Tıklanabilir Değerler ve Dava Önizleme (Drill-down) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every number, row and chart element in CaseBridge either navigate to a filtered list / case detail tab or open a URL-driven case quick-view drawer, backed by a few small backend additions.

**Architecture:** A single `CaseQuickView` drawer lives in `AppShell` and opens whenever the URL has `?onizle=<caseId>`. List screens read and write their filters from URL query params through one mapping module (`lib/filters.ts`) that is also the only place links are generated, so a card's number always equals the row count of the list it opens. The backend gains list filters (`outcome`, `active`, `hearing_within_days`), `by_status` analytics, calendar `task_id`, a document download endpoint and real report CSVs + summary.

**Tech Stack:** FastAPI + SQLAlchemy + pytest (backend); Next.js 14.2 App Router, React 18, TypeScript, Tailwind, Recharts 2.12, Vitest + Testing Library (frontend); Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-09-30-clickable-drilldown-design.md`

## Global Constraints

- Branch: `feature/clickable-drilldown`. One commit per task (or per step where shown).
- No DB schema changes and no Alembic migrations.
- No new npm or pip dependencies.
- All user-facing copy is Turkish.
- URL parameter names are exactly: `onizle`, `odak`, `sekme`, `ara`, `kategori`, `durum`, `sonuc`, `durusma`, `arsiv`, `vade`, `dava`, `tur`, `ay`, `goster`. `sayfa` is reserved (not used in this work).
- `odak` values are `gorev:<id>`, `belge:<id>`, `olay:<id>`.
- `sekme` slugs are exactly: `genel`, `belgeler`, `gelismeler`, `gorevler`, `simulasyonlar`, `devir`, `notlar`.
- "Upcoming hearing" window is **30 days**, inclusive of today: `today <= next_hearing_date <= today + 30`.
- `active` means `status != kapali`, identical to `AnalyticsService`.
- Analytics counts include archived cases, so every link generated from an analytics number carries `arsiv=dahil`.
- Every new endpoint is tenant-scoped with `Depends(get_current_law_firm_id)`.
- Every clickable element is a real `<Link>` (or a `<button>` for in-page actions). Non-clickable values get no hover styling.
- Missing values render as `—` (em dash) and are never clickable.
- Links in the app are only generated through helpers in `frontend/src/lib/filters.ts` / `frontend/src/lib/urlState.ts`, never hand-built strings in components.

**Environment setup (once, before Task 1):**

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ..
cd frontend && npm ci && cd ..
```

Backend tests run from `backend/` with the venv active: `pytest -q`. Frontend tests run from `frontend/`: `npx vitest run <path>`.

---

## File Map

**Backend**

| File | Change |
|---|---|
| `backend/app/repositories/case_repository.py` | `list_in_firm` gains `outcome`, `active`, `hearing_within_days` |
| `backend/app/services/case_service.py` | pass-through of the new filters |
| `backend/app/api/routes/cases.py` | new query params |
| `backend/app/schemas/analytics.py` | `StatusBreakdown`, `AnalyticsOverview.by_status` |
| `backend/app/services/analytics_service.py` | compute `by_status` |
| `backend/app/schemas/calendar.py`, `backend/app/api/routes/calendar.py` | `task_id` |
| `backend/app/services/document_service.py`, `backend/app/api/routes/documents.py` | download |
| `backend/app/schemas/report.py` (new), `backend/app/services/report_service.py`, `backend/app/api/routes/reports.py` | 3 CSVs + summary |

**Frontend**

| File | Responsibility |
|---|---|
| `src/lib/apiError.ts` (new) | `ApiError` with HTTP status |
| `src/lib/download.ts` (new) | `saveBlob` |
| `src/lib/filters.ts` (new) | URL slug ↔ API mapping, link builders, task/document filtering, date helpers |
| `src/lib/urlState.ts` (new) | `useUrlParams`, `useQuickViewHref`, `parseOdak` |
| `src/test/navigation.ts` (new) | shared `next/navigation` mock for Vitest |
| `src/components/CaseQuickView.tsx` (new) | drawer |
| `src/components/FilterChips.tsx` (new) | active filter chips + filtered-empty state |
| `src/components/ChartLegendLinks.tsx` (new) | accessible link legend under charts |
| `src/components/StatCard.tsx` | optional `href` |
| `src/components/AppShell.tsx` | Suspense + drawer host |
| `CaseDetailView`, `CaseListView`, `TasksView`, `DocumentsView`, `DashboardView`, `CalendarView`, `AnalyticsView`, `ReportsView`, `SimulationsView` | wiring |
| `src/lib/api.ts`, `src/types/index.ts` | new fields and calls |
| `tests/e2e/specs/05-click-through.spec.ts` (new) | end-to-end drill-down |

Note on Suspense: Next 14 requires a `<Suspense>` boundary around client components that call `useSearchParams` during static prerender. We add it once in `AppShell` (around `children` and around the drawer) instead of in every `app/*/page.tsx`.

---

### Task 1: Backend — case list filters (`outcome`, `active`, `hearing_within_days`)

**Files:**
- Modify: `backend/app/repositories/case_repository.py`
- Modify: `backend/app/services/case_service.py:38-58`
- Modify: `backend/app/api/routes/cases.py:1-57`
- Test: `backend/tests/api/test_cases.py` (append)

**Interfaces:**
- Produces: `GET /cases?outcome=<won|lost|settled|ongoing>&active=<true|false>&hearing_within_days=<1..365>`; `CaseService.list_cases(..., outcome=None, active=None, hearing_within_days=None)`; same keyword args on `CaseRepository.list_in_firm`.

- [ ] **Step 1: Write the failing tests** — add `from datetime import date, timedelta` to the imports at the top of `backend/tests/api/test_cases.py`, then append:

```python
def _create(client, headers, **overrides):
    payload = {**VALID_CASE_PAYLOAD, **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_filter_cases_by_outcome(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    won = _create(client, headers, case_number="2026/701")
    _create(client, headers, case_number="2026/702")
    client.patch(f"/cases/{won['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)

    response = client.get("/cases?outcome=won", headers=headers)

    assert response.status_code == 200
    assert [c["id"] for c in response.json()] == [won["id"]]


def test_filter_cases_active_true_and_false(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    open_case = _create(client, headers, case_number="2026/711")
    closed_case = _create(client, headers, case_number="2026/712", status="kapali")

    active_ids = [c["id"] for c in client.get("/cases?active=true", headers=headers).json()]
    inactive_ids = [c["id"] for c in client.get("/cases?active=false", headers=headers).json()]

    assert active_ids == [open_case["id"]]
    assert inactive_ids == [closed_case["id"]]


def test_filter_cases_by_hearing_window_is_inclusive(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    today = date.today()
    today_case = _create(client, headers, case_number="2026/720", next_hearing_date=today.isoformat())
    soon = _create(client, headers, case_number="2026/721", next_hearing_date=(today + timedelta(days=3)).isoformat())
    edge = _create(client, headers, case_number="2026/722", next_hearing_date=(today + timedelta(days=30)).isoformat())
    _create(client, headers, case_number="2026/723", next_hearing_date=(today + timedelta(days=31)).isoformat())
    _create(client, headers, case_number="2026/724", next_hearing_date=(today - timedelta(days=1)).isoformat())
    _create(client, headers, case_number="2026/725")

    response = client.get("/cases?hearing_within_days=30", headers=headers)

    assert response.status_code == 200
    assert {c["id"] for c in response.json()} == {today_case["id"], soon["id"], edge["id"]}


def test_hearing_window_rejects_out_of_range_values(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    assert client.get("/cases?hearing_within_days=0", headers=headers).status_code == 422
    assert client.get("/cases?hearing_within_days=366", headers=headers).status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/api/test_cases.py -q -k "outcome or active or hearing"`
Expected: FAIL — the filters are ignored (unexpected ids returned) and the range check returns 200 instead of 422.

- [ ] **Step 3: Implement the repository filters** — in `backend/app/repositories/case_repository.py` change the imports and `list_in_firm`:

```python
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.case import Case, CaseOutcome, CaseStatus, CaseType
```

```python
    def list_in_firm(
        self,
        law_firm_id: str,
        search: Optional[str] = None,
        status: Optional[CaseStatus] = None,
        case_type: Optional[CaseType] = None,
        assigned_lawyer_id: Optional[str] = None,
        include_archived: bool = False,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        outcome: Optional[CaseOutcome] = None,
        active: Optional[bool] = None,
        hearing_within_days: Optional[int] = None,
    ) -> list[Case]:
        """The single search entry point for both everyday case list
        filtering and institutional-memory historical search (section
        17) - same query, `include_archived=True` is what makes closed/
        archived cases searchable again.

        `active` and `outcome` use exactly the definitions in
        AnalyticsService so a dashboard number and the list it links to
        always agree."""
        query = self.db.query(Case).filter(Case.law_firm_id == law_firm_id)

        if not include_archived:
            query = query.filter(Case.is_archived.is_(False))

        if status is not None:
            query = query.filter(Case.status == status)

        if case_type is not None:
            query = query.filter(Case.case_type == case_type)

        if assigned_lawyer_id is not None:
            query = query.filter(Case.assigned_lawyer_id == assigned_lawyer_id)

        if outcome is not None:
            query = query.filter(Case.outcome == outcome)

        if active is True:
            query = query.filter(Case.status != CaseStatus.KAPALI)
        elif active is False:
            query = query.filter(Case.status == CaseStatus.KAPALI)

        if hearing_within_days is not None:
            today = date.today()
            query = query.filter(
                Case.next_hearing_date.isnot(None),
                Case.next_hearing_date >= today,
                Case.next_hearing_date <= today + timedelta(days=hearing_within_days),
            )

        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Case.case_name.ilike(pattern),
                    Case.client_name.ilike(pattern),
                    Case.opposing_party.ilike(pattern),
                    Case.case_number.ilike(pattern),
                    Case.description.ilike(pattern),
                )
            )

        query = query.order_by(Case.created_at.desc())
        if offset is not None:
            query = query.offset(offset)
        if limit is not None:
            query = query.limit(limit)
        return query.all()
```

- [ ] **Step 4: Pass the filters through the service** — replace `list_cases` in `backend/app/services/case_service.py` (add `CaseOutcome` to the existing `app.models.case` import there):

```python
    def list_cases(
        self,
        law_firm_id: str,
        search: Optional[str] = None,
        status: Optional[CaseStatus] = None,
        case_type: Optional[CaseType] = None,
        assigned_lawyer_id: Optional[str] = None,
        include_archived: bool = False,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        outcome: Optional[CaseOutcome] = None,
        active: Optional[bool] = None,
        hearing_within_days: Optional[int] = None,
    ) -> list[Case]:
        return self.cases.list_in_firm(
            law_firm_id,
            search=search,
            status=status,
            case_type=case_type,
            assigned_lawyer_id=assigned_lawyer_id,
            include_archived=include_archived,
            limit=limit,
            offset=offset,
            outcome=outcome,
            active=active,
            hearing_within_days=hearing_within_days,
        )
```

- [ ] **Step 5: Expose the query params** — in `backend/app/api/routes/cases.py` change the model import to `from app.models.case import CaseOutcome, CaseStatus, CaseType` and replace `list_cases`:

```python
@router.get("", response_model=list[CaseOut])
def list_cases(
    search: Optional[str] = None,
    status_filter: Optional[CaseStatus] = Query(default=None, alias="status"),
    case_type: Optional[CaseType] = None,
    assigned_lawyer_id: Optional[str] = None,
    include_archived: bool = False,
    outcome: Optional[CaseOutcome] = None,
    active: Optional[bool] = None,
    hearing_within_days: Optional[int] = Query(default=None, ge=1, le=365),
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    offset: Optional[int] = Query(default=None, ge=0),
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return CaseService(db).list_cases(
        law_firm_id,
        search=search,
        status=status_filter,
        case_type=case_type,
        assigned_lawyer_id=assigned_lawyer_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
        outcome=outcome,
        active=active,
        hearing_within_days=hearing_within_days,
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pytest tests/api/test_cases.py -q`
Expected: all PASS (old and new).

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/case_repository.py backend/app/services/case_service.py backend/app/api/routes/cases.py backend/tests/api/test_cases.py
git commit -m "feat(api): add outcome, active and hearing window filters to case list"
```

---

### Task 2: Backend — `by_status` analytics + card/list consistency test

**Files:**
- Modify: `backend/app/schemas/analytics.py`
- Modify: `backend/app/services/analytics_service.py`
- Test: `backend/tests/api/test_analytics.py` (append)

**Interfaces:**
- Consumes: Task 1 filters.
- Produces: `AnalyticsOverview.by_status: list[StatusBreakdown]` where `StatusBreakdown = {status: CaseStatus, total: int}` (JSON: `by_status: [{status: "devam_eden", total: 3}, ...]`).

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/api/test_analytics.py` (it already defines `_auth_headers` and `_create_case`):

```python
def test_analytics_overview_includes_status_breakdown(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    _create_case(client, headers, case_number="2026/551", status="devam_eden")
    _create_case(client, headers, case_number="2026/552", status="devam_eden")
    _create_case(client, headers, case_number="2026/553", status="kapali")

    body = client.get("/analytics/overview", headers=headers).json()

    by_status = {row["status"]: row["total"] for row in body["by_status"]}
    assert by_status == {"devam_eden": 2, "kapali": 1}


def test_overview_counts_match_case_list_filters(client, two_firms_two_users):
    """Spec 5.1: every analytics number must equal the row count of the
    list it links to (links from analytics always add include_archived)."""
    headers = _auth_headers(client, two_firms_two_users)
    won_archived = _create_case(client, headers, case_number="2026/601", case_type="icra")
    _create_case(client, headers, case_number="2026/602", case_type="icra")
    lost = _create_case(client, headers, case_number="2026/603", case_type="kira")
    _create_case(client, headers, case_number="2026/604", case_type="kira", status="karar_bekleyen")
    client.patch(f"/cases/{won_archived['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)
    client.patch(f"/cases/{lost['id']}", json={"outcome": "lost", "status": "kapali"}, headers=headers)
    client.post(f"/cases/{won_archived['id']}/archive", headers=headers)

    overview = client.get("/analytics/overview", headers=headers).json()

    def count(query: str) -> int:
        response = client.get(f"/cases?include_archived=true{query}", headers=headers)
        assert response.status_code == 200
        return len(response.json())

    assert overview["won_cases"] == 1  # the archived won case is counted
    assert overview["total_cases"] == count("")
    assert overview["active_cases"] == count("&active=true")
    assert overview["won_cases"] == count("&outcome=won")
    assert overview["lost_cases"] == count("&outcome=lost")
    for row in overview["by_category"]:
        assert row["total"] == count(f"&case_type={row['case_type']}")
    for row in overview["by_status"]:
        assert row["total"] == count(f"&status={row['status']}")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/api/test_analytics.py -q`
Expected: FAIL with `KeyError: 'by_status'`.

- [ ] **Step 3: Add the schema** — replace `backend/app/schemas/analytics.py`:

```python
from pydantic import BaseModel

from app.models.case import CaseStatus, CaseType


class CategoryBreakdown(BaseModel):
    case_type: CaseType
    total: int
    won: int
    lost: int
    win_rate: float


class StatusBreakdown(BaseModel):
    status: CaseStatus
    total: int


class AnalyticsOverview(BaseModel):
    total_cases: int
    active_cases: int
    won_cases: int
    lost_cases: int
    win_rate: float
    average_case_duration_days: float
    by_category: list[CategoryBreakdown]
    by_status: list[StatusBreakdown] = []
```

- [ ] **Step 4: Compute it** — in `backend/app/services/analytics_service.py` import `StatusBreakdown` (`from app.schemas.analytics import AnalyticsOverview, CategoryBreakdown, StatusBreakdown`), then insert before the `return AnalyticsOverview(` statement:

```python
        status_counts: dict[CaseStatus, int] = {}
        for c in cases:
            status_counts[c.status] = status_counts.get(c.status, 0) + 1
        by_status = [StatusBreakdown(status=s, total=n) for s, n in status_counts.items()]
```

and add `by_status=by_status,` as the last argument of `AnalyticsOverview(...)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pytest tests/api/test_analytics.py tests/unit/test_analytics_service.py -q`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/analytics.py backend/app/services/analytics_service.py backend/tests/api/test_analytics.py
git commit -m "feat(api): add status breakdown to analytics and lock card/list count consistency"
```

---

### Task 3: Backend — calendar events carry `task_id`

**Files:**
- Modify: `backend/app/schemas/calendar.py`
- Modify: `backend/app/api/routes/calendar.py` (task loop)
- Test: `backend/tests/api/test_calendar.py` (append)

**Interfaces:**
- Produces: `CalendarEventOut.task_id: Optional[str]` — the task id for `event_type == "task"`, `None` for hearings.

- [ ] **Step 1: Write the failing test** — append to `backend/tests/api/test_calendar.py`:

```python
def test_calendar_task_events_carry_task_id(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/803", next_hearing_date="2026-10-07")
    task = client.post(
        f"/cases/{case['id']}/tasks",
        json={"title": "Delil listesi", "due_date": "2026-10-08"},
        headers=headers,
    ).json()

    body = client.get("/calendar", headers=headers).json()

    task_event = next(e for e in body if e["event_type"] == "task")
    hearing_event = next(e for e in body if e["event_type"] == "hearing")
    assert task_event["task_id"] == task["id"]
    assert hearing_event["task_id"] is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/api/test_calendar.py -q -k task_id`
Expected: FAIL with `KeyError: 'task_id'`.

- [ ] **Step 3: Implement** — replace `backend/app/schemas/calendar.py`:

```python
"""Schema for the firm-wide calendar (Phase 4 - Takvim)."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel


class CalendarEventOut(BaseModel):
    event_type: Literal["hearing", "task"]
    date: date
    title: str
    case_id: str
    case_name: str
    task_id: Optional[str] = None
```

In `backend/app/api/routes/calendar.py`, in the `for task, case_name in tasks:` loop, add `task_id=task.id,` to the `CalendarEventOut(...)` call.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/api/test_calendar.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/calendar.py backend/app/api/routes/calendar.py backend/tests/api/test_calendar.py
git commit -m "feat(api): include task_id on calendar task events"
```

---

### Task 4: Backend — document download endpoint

**Files:**
- Modify: `backend/app/services/document_service.py` (add method after `get`)
- Modify: `backend/app/api/routes/documents.py`
- Test: `backend/tests/api/test_documents.py` (append)

**Interfaces:**
- Produces: `GET /documents/{document_id}/download` → file bytes, `Content-Disposition` with the original filename; `404 {"detail": "Document not found"}` for other firms' documents, missing files, or paths outside `settings.storage_dir`. `DocumentService.resolve_download_path(document) -> Optional[str]`.

- [ ] **Step 1: Write the failing tests** — add `import os` to the imports at the top of `backend/tests/api/test_documents.py`, then append:

```python
def _upload_txt(client, headers, case_id, content=b"Sozlesme notlari"):
    response = client.post(
        f"/cases/{case_id}/documents",
        files={"file": ("notlar.txt", content, "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_download_document_returns_original_file(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    doc = _upload_txt(client, headers, case["id"])

    response = client.get(f"/documents/{doc['id']}/download", headers=headers)

    assert response.status_code == 200
    assert response.content == b"Sozlesme notlari"
    assert "notlar.txt" in response.headers["content-disposition"]


def test_download_document_from_other_firm_is_404(client, two_firms_two_users):
    headers_a = _auth_headers(client, two_firms_two_users, "user_a")
    headers_b = _auth_headers(client, two_firms_two_users, "user_b")
    case = _create_case(client, headers_a)
    doc = _upload_txt(client, headers_a, case["id"])

    response = client.get(f"/documents/{doc['id']}/download", headers=headers_b)

    assert response.status_code == 404


def test_download_document_with_missing_file_is_404(client, two_firms_two_users, db_session):
    from app.models.document import Document

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    doc = _upload_txt(client, headers, case["id"])
    os.remove(db_session.get(Document, doc["id"]).storage_path)

    response = client.get(f"/documents/{doc['id']}/download", headers=headers)

    assert response.status_code == 404


def test_download_rejects_path_outside_storage_dir(client, two_firms_two_users, db_session, tmp_path):
    from app.models.document import Document

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    doc = _upload_txt(client, headers, case["id"])
    outside = tmp_path / "outside.txt"
    outside.write_bytes(b"secret")
    stored = db_session.get(Document, doc["id"])
    stored.storage_path = str(outside)
    db_session.commit()

    response = client.get(f"/documents/{doc['id']}/download", headers=headers)

    assert response.status_code == 404
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/api/test_documents.py -q -k download`
Expected: FAIL — 404/405 for the success case because the route does not exist.

- [ ] **Step 3: Add the service method** — in `backend/app/services/document_service.py`, directly after `def get(...)`:

```python
    def resolve_download_path(self, document: Document) -> Optional[str]:
        """Absolute path of the stored file, or None when the file is gone
        or the stored path resolves outside the storage directory (defence
        against a tampered storage_path)."""
        storage_root = os.path.realpath(settings.storage_dir)
        path = os.path.realpath(document.storage_path)
        if not path.startswith(storage_root + os.sep):
            return None
        if not os.path.isfile(path):
            return None
        return path
```

(`os`, `Optional`, `settings` and `Document` are already imported in this file; verify with `grep -n "^import\|^from" backend/app/services/document_service.py` and add any that are missing.)

- [ ] **Step 4: Add the route** — in `backend/app/api/routes/documents.py` add `from fastapi.responses import FileResponse` to the imports, then add below `list_all_documents`:

```python
_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain; charset=utf-8",
}


@documents_router.get("/{document_id}/download")
def download_document(
    document_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = DocumentService(db)
    document = service.get(document_id, law_firm_id)
    path = service.resolve_download_path(document) if document is not None else None
    if path is None:
        # Same answer for "not yours" and "file gone" - no information leak.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return FileResponse(
        path,
        media_type=_MEDIA_TYPES.get(document.file_type.value, "application/octet-stream"),
        filename=document.filename,
    )
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && pytest tests/api/test_documents.py -q`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/document_service.py backend/app/api/routes/documents.py backend/tests/api/test_documents.py
git commit -m "feat(api): add tenant-scoped document download endpoint"
```

---

### Task 5: Backend — real report CSVs and report summary

**Files:**
- Create: `backend/app/schemas/report.py`
- Modify: `backend/app/services/report_service.py`
- Modify: `backend/app/api/routes/reports.py`
- Test: `backend/tests/api/test_reports.py` (append)

**Interfaces:**
- Consumes: Task 1 (`hearing_within_days`), Task 2 (`AnalyticsService`).
- Produces: `GET /reports/hearings.csv`, `GET /reports/tasks.csv`, `GET /reports/performance.csv` (UTF-8 BOM + Turkish headers), `GET /reports/summary` → `{"total_cases": int, "upcoming_hearings_30d": int, "open_tasks": int, "win_rate": float}`. `/reports/cases.csv` is unchanged.

- [ ] **Step 1: Write the failing tests** — add `import codecs` and `from datetime import date, timedelta` at the top of `backend/tests/api/test_reports.py`, then append:

```python
def _create_case(client, headers, **overrides):
    payload = {**VALID_CASE_PAYLOAD, **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _csv_lines(response):
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.content.startswith(codecs.BOM_UTF8)
    return response.content.decode("utf-8-sig").splitlines()


def test_hearings_csv_lists_only_the_30_day_window(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    today = date.today()
    _create_case(client, headers, case_number="2026/911", case_name="Yakin Durusma",
                 next_hearing_date=(today + timedelta(days=5)).isoformat())
    _create_case(client, headers, case_number="2026/912", case_name="Uzak Durusma",
                 next_hearing_date=(today + timedelta(days=45)).isoformat())

    lines = _csv_lines(client.get("/reports/hearings.csv", headers=headers))

    assert lines[0] == "Tarih,Dava No,Dava,Müvekkil,Mahkeme"
    assert any("Yakin Durusma" in line for line in lines)
    assert not any("Uzak Durusma" in line for line in lines)


def test_tasks_csv_has_turkish_status_labels(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/921")
    client.post(f"/cases/{case['id']}/tasks", json={"title": "Acik Gorev"}, headers=headers)
    done = client.post(f"/cases/{case['id']}/tasks", json={"title": "Biten Gorev"}, headers=headers).json()
    client.patch(f"/cases/{case['id']}/tasks/{done['id']}", json={"status": "completed"}, headers=headers)

    lines = _csv_lines(client.get("/reports/tasks.csv", headers=headers))

    assert lines[0] == "Görev,Dava No,Dava,Son Tarih,Durum"
    assert any(line.startswith("Acik Gorev,") and line.endswith(",Açık") for line in lines)
    assert any(line.startswith("Biten Gorev,") and line.endswith(",Tamamlandı") for line in lines)


def test_performance_csv_starts_with_total_row(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/931")
    client.patch(f"/cases/{case['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)

    lines = _csv_lines(client.get("/reports/performance.csv", headers=headers))

    assert lines[0] == "Kategori,Toplam,Kazanılan,Kaybedilen,Kazanma Oranı (%)"
    assert lines[1] == "Tümü,1,1,0,100.0"
    assert lines[2] == "Diğer,1,1,0,100.0"


def test_summary_matches_the_lists_it_links_to(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    today = date.today()
    soon = _create_case(client, headers, case_number="2026/941",
                        next_hearing_date=(today + timedelta(days=3)).isoformat())
    _create_case(client, headers, case_number="2026/942")
    client.patch(f"/cases/{soon['id']}", json={"outcome": "won"}, headers=headers)
    client.post(f"/cases/{soon['id']}/tasks", json={"title": "Acik"}, headers=headers)
    done = client.post(f"/cases/{soon['id']}/tasks", json={"title": "Bitti"}, headers=headers).json()
    client.patch(f"/cases/{soon['id']}/tasks/{done['id']}", json={"status": "completed"}, headers=headers)

    summary = client.get("/reports/summary", headers=headers).json()
    overview = client.get("/analytics/overview", headers=headers).json()

    assert summary == {
        "total_cases": len(client.get("/cases?include_archived=true", headers=headers).json()),
        "upcoming_hearings_30d": len(client.get("/cases?hearing_within_days=30", headers=headers).json()),
        "open_tasks": len(client.get("/tasks?status=pending", headers=headers).json()),
        "win_rate": overview["win_rate"],
    }
    assert summary["upcoming_hearings_30d"] == 1
    assert summary["open_tasks"] == 1


def test_summary_isolated_by_law_firm(client, two_firms_two_users):
    headers_a = _auth_headers(client, two_firms_two_users, "user_a")
    headers_b = _auth_headers(client, two_firms_two_users, "user_b")
    _create_case(client, headers_a, case_number="2026/951")

    assert client.get("/reports/summary", headers=headers_b).json()["total_cases"] == 0
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/api/test_reports.py -q`
Expected: new tests FAIL with 404 (routes missing); the two existing tests PASS.

- [ ] **Step 3: Create the summary schema** — `backend/app/schemas/report.py`:

```python
from pydantic import BaseModel


class ReportSummary(BaseModel):
    total_cases: int
    upcoming_hearings_30d: int
    open_tasks: int
    win_rate: float
```

- [ ] **Step 4: Extend the service** — replace `backend/app/services/report_service.py`:

```python
"""Report generation (Phase 4 - Raporlar). CSV exports and the numbers
shown on the report cards. Every number uses the same definition as the
list it links to (spec 5.1), so cards and lists never disagree."""
import csv
import io

from sqlalchemy.orm import Session

from app.models.task import TaskStatus
from app.repositories.task_repository import TaskRepository
from app.schemas.report import ReportSummary
from app.services.analytics_service import AnalyticsService
from app.services.case_service import CaseService

UPCOMING_HEARING_WINDOW_DAYS = 30

_HEADERS = [
    "case_number",
    "case_name",
    "client_name",
    "opposing_party",
    "case_type",
    "status",
    "outcome",
    "opening_date",
    "next_hearing_date",
]

_BOM = "﻿"  # lets Excel open the Turkish CSVs as UTF-8

_TASK_STATUS_LABELS = {TaskStatus.PENDING: "Açık", TaskStatus.COMPLETED: "Tamamlandı"}

_CASE_TYPE_LABELS = {
    "is_hukuku": "İş Hukuku",
    "ticaret_hukuku": "Ticaret Hukuku",
    "sozlesme": "Sözleşme",
    "kira": "Kira",
    "icra": "İcra",
    "diger": "Diğer",
}


def _bom_csv(rows: list[list]) -> str:
    buffer = io.StringIO()
    csv.writer(buffer).writerows(rows)
    return _BOM + buffer.getvalue()


class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self.cases = CaseService(db)

    def cases_csv(self, law_firm_id: str) -> str:
        cases = self.cases.list_cases(law_firm_id, include_archived=True)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(_HEADERS)
        for case in cases:
            writer.writerow(
                [
                    case.case_number,
                    case.case_name,
                    case.client_name,
                    case.opposing_party or "",
                    case.case_type.value,
                    case.status.value,
                    case.outcome.value,
                    case.opening_date.isoformat() if case.opening_date else "",
                    case.next_hearing_date.isoformat() if case.next_hearing_date else "",
                ]
            )
        return buffer.getvalue()

    def upcoming_hearings(self, law_firm_id: str):
        cases = self.cases.list_cases(law_firm_id, hearing_within_days=UPCOMING_HEARING_WINDOW_DAYS)
        return sorted(cases, key=lambda c: c.next_hearing_date)

    def hearings_csv(self, law_firm_id: str) -> str:
        rows: list[list] = [["Tarih", "Dava No", "Dava", "Müvekkil", "Mahkeme"]]
        for case in self.upcoming_hearings(law_firm_id):
            rows.append(
                [
                    case.next_hearing_date.isoformat(),
                    case.case_number,
                    case.case_name,
                    case.client_name,
                    case.court or "",
                ]
            )
        return _bom_csv(rows)

    def tasks_csv(self, law_firm_id: str) -> str:
        rows: list[list] = [["Görev", "Dava No", "Dava", "Son Tarih", "Durum"]]
        for task, case_name, case_number in TaskRepository(self.db).list_for_firm_with_case(law_firm_id):
            rows.append(
                [
                    task.title,
                    case_number,
                    case_name,
                    task.due_date.isoformat() if task.due_date else "",
                    _TASK_STATUS_LABELS[task.status],
                ]
            )
        return _bom_csv(rows)

    def performance_csv(self, law_firm_id: str) -> str:
        overview = AnalyticsService(self.db).compute_overview(law_firm_id)
        rows: list[list] = [
            ["Kategori", "Toplam", "Kazanılan", "Kaybedilen", "Kazanma Oranı (%)"],
            ["Tümü", overview.total_cases, overview.won_cases, overview.lost_cases, overview.win_rate],
        ]
        for row in overview.by_category:
            rows.append(
                [
                    _CASE_TYPE_LABELS.get(row.case_type.value, row.case_type.value),
                    row.total,
                    row.won,
                    row.lost,
                    row.win_rate,
                ]
            )
        return _bom_csv(rows)

    def summary(self, law_firm_id: str) -> ReportSummary:
        overview = AnalyticsService(self.db).compute_overview(law_firm_id)
        open_tasks = TaskRepository(self.db).list_for_firm_with_case(law_firm_id, status=TaskStatus.PENDING)
        return ReportSummary(
            total_cases=overview.total_cases,
            upcoming_hearings_30d=len(self.upcoming_hearings(law_firm_id)),
            open_tasks=len(open_tasks),
            win_rate=overview.win_rate,
        )
```

- [ ] **Step 5: Add the routes** — replace `backend/app/api/routes/reports.py`:

```python
"""Report endpoints (Phase 4 - Raporlar). CSV exports and the card
summary - real data pulled from the same services used everywhere else,
not a separate/duplicated query path.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.schemas.report import ReportSummary
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


def _csv_response(content: str, filename: str) -> PlainTextResponse:
    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/cases.csv")
def export_cases_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).cases_csv(law_firm_id), "davalar.csv")


@router.get("/hearings.csv")
def export_hearings_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).hearings_csv(law_firm_id), "durusmalar.csv")


@router.get("/tasks.csv")
def export_tasks_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).tasks_csv(law_firm_id), "gorevler.csv")


@router.get("/performance.csv")
def export_performance_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).performance_csv(law_firm_id), "performans.csv")


@router.get("/summary", response_model=ReportSummary)
def report_summary(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return ReportService(db).summary(law_firm_id)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pytest tests/api/test_reports.py -q`
Expected: all PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && pytest -q`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/report.py backend/app/services/report_service.py backend/app/api/routes/reports.py backend/tests/api/test_reports.py
git commit -m "feat(api): real hearings/tasks/performance CSVs and report summary"
```

---
### Task 6: Frontend foundation — types, API client, `filters.ts`, `urlState.ts`, test helpers

**Files:**
- Create: `frontend/src/lib/apiError.ts`
- Create: `frontend/src/lib/download.ts`
- Create: `frontend/src/lib/filters.ts`
- Create: `frontend/src/lib/urlState.ts`
- Create: `frontend/src/test/navigation.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/__tests__/filters.test.ts` (new), `frontend/src/lib/__tests__/urlState.test.ts` (new), `frontend/src/lib/__tests__/api.test.ts` (append)

**Interfaces:**
- Consumes: backend endpoints from Tasks 1–5.
- Produces (used by every later frontend task):
  - `class ApiError extends Error { status: number }` in `@/lib/apiError`
  - `saveBlob(blob: Blob, filename: string): void` in `@/lib/download`
  - In `@/lib/api`: `CaseListFilters` gains `outcome?: CaseOutcome; active?: boolean; hearing_within_days?: number`; new `downloadReportCsv(kind: ReportKind): Promise<Blob>`, `downloadDocument(id: string): Promise<Blob>`, `getReportSummary(): Promise<ReportSummary>`; `downloadCasesCsv()` kept.
  - In `@/types`: `StatusBreakdown`, `AnalyticsOverview.by_status`, `CalendarEvent.task_id`, `ReportSummary`, `ReportKind`.
  - In `@/lib/filters`: `CASE_TYPES`, `CASE_STATUSES`, `OUTCOME_SLUGS`, `OutcomeSlug`, `OUTCOME_SLUG_LABELS`, `UPCOMING_HEARING_DAYS`, `buildHref`, `CaseListQuery`, `CASE_LIST_PARAM_KEYS`, `parseCaseListQuery`, `caseListHref`, `analyticsCaseListHref`, `toCaseListFilters`, `FilterChip`, `describeCaseListQuery`, `TaskListQuery`, `TASK_LIST_PARAM_KEYS`, `parseTaskListQuery`, `taskListHref`, `filterTasks`, `sortTasks`, `isOverdue`, `isDueWithinWeek`, `describeTaskListQuery`, `DocumentListQuery`, `DOCUMENT_LIST_PARAM_KEYS`, `parseDocumentListQuery`, `filterDocuments`, `describeDocumentListQuery`, `CalendarQuery`, `parseCalendarQuery`, `CASE_TAB_SLUGS`, `CaseTabSlug`, `parseCaseTab`, `caseDetailHref`, `parseDateOnly`, `daysUntil`.
  - In `@/lib/urlState`: `FocusType`, `Focus`, `QUICK_VIEW_PARAM = "onizle"`, `FOCUS_PARAM = "odak"`, `parseOdak`, `formatOdak`, `withParams`, `useUrlParams(): { params: URLSearchParams; hrefWith(updates): string; setParams(updates, options?: { push?: boolean }): void }`, `useQuickViewHref(): (caseId: string, focus?: Focus) => string`.
  - In `@/test/navigation`: `nav` (`{ pathname, searchParams, push, replace, back }`), `setUrl(url)`, `resetNav()`, `navigationModule`.

- [ ] **Step 1: Write the failing `filters` tests** — `frontend/src/lib/__tests__/filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  analyticsCaseListHref,
  caseDetailHref,
  caseListHref,
  daysUntil,
  describeCaseListQuery,
  filterDocuments,
  filterTasks,
  parseCalendarQuery,
  parseCaseListQuery,
  parseCaseTab,
  parseDocumentListQuery,
  parseTaskListQuery,
  sortTasks,
  taskListHref,
  toCaseListFilters,
} from "@/lib/filters";
import type { DocumentWithCase, TaskWithCase } from "@/types";

const TODAY = new Date(2026, 8, 30); // 30 Sep 2026, local time

function task(overrides: Partial<TaskWithCase>): TaskWithCase {
  return {
    id: "t",
    case_id: "c1",
    case_name: "Dava",
    case_number: "2026/1",
    title: "Görev",
    description: null,
    due_date: null,
    status: "pending",
    assigned_to: null,
    created_at: "2026-01-01",
    completed_at: null,
    ...overrides,
  };
}

describe("case list query", () => {
  it("round-trips through the URL", () => {
    const href = caseListHref({ kategori: "icra", sonuc: "kazanilan", arsiv: "dahil" });
    expect(href).toBe("/davalar?kategori=icra&sonuc=kazanilan&arsiv=dahil");
    const parsed = parseCaseListQuery(new URLSearchParams(href.split("?")[1]));
    expect(parsed).toEqual({ kategori: "icra", sonuc: "kazanilan", arsiv: "dahil" });
  });

  it("drops unknown values instead of passing them to the API", () => {
    const parsed = parseCaseListQuery(new URLSearchParams("kategori=uzay&durum=bilinmiyor&sonuc=x&ara=%20%20"));
    expect(parsed).toEqual({});
  });

  it("maps URL slugs to API filters", () => {
    expect(toCaseListFilters({ ara: "kira", kategori: "kira", durum: "aktif", sonuc: "kaybedilen", durusma: "yaklasan", arsiv: "dahil" })).toEqual({
      search: "kira",
      case_type: "kira",
      active: true,
      outcome: "lost",
      hearing_within_days: 30,
      include_archived: true,
    });
    expect(toCaseListFilters({ durum: "kapali" })).toEqual({ status: "kapali" });
    expect(toCaseListFilters({})).toEqual({});
  });

  it("always adds arsiv=dahil to analytics links", () => {
    expect(analyticsCaseListHref({ durum: "aktif" })).toBe("/davalar?durum=aktif&arsiv=dahil");
    expect(analyticsCaseListHref()).toBe("/davalar?arsiv=dahil");
  });

  it("describes active filters as Turkish chips", () => {
    expect(describeCaseListQuery({ kategori: "icra", durum: "aktif", arsiv: "dahil" })).toEqual([
      { key: "kategori", label: "Kategori: İcra" },
      { key: "durum", label: "Durum: Aktif" },
      { key: "arsiv", label: "Arşiv dahil" },
    ]);
  });
});

describe("task list query", () => {
  it("parses and builds links", () => {
    expect(parseTaskListQuery(new URLSearchParams("durum=acik&vade=gecikmis&dava=c9"))).toEqual({ durum: "acik", vade: "gecikmis", dava: "c9" });
    expect(taskListHref({ durum: "acik" })).toBe("/gorevler?durum=acik");
  });

  it("filters overdue and due-this-week tasks relative to today", () => {
    const overdue = task({ id: "a", due_date: "2026-09-29" });
    const dueToday = task({ id: "b", due_date: "2026-09-30" });
    const inAWeek = task({ id: "c", due_date: "2026-10-07" });
    const later = task({ id: "d", due_date: "2026-10-08" });
    const doneOverdue = task({ id: "e", due_date: "2026-09-01", status: "completed" });
    const all = [overdue, dueToday, inAWeek, later, doneOverdue];

    expect(filterTasks(all, { vade: "gecikmis" }, TODAY).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(all, { vade: "7gun" }, TODAY).map((t) => t.id)).toEqual(["b", "c"]);
    expect(filterTasks(all, { durum: "tamamlanan" }, TODAY).map((t) => t.id)).toEqual(["e"]);
    expect(filterTasks(all, { durum: "acik", dava: "c1" }, TODAY)).toHaveLength(4);
  });

  it("sorts overdue first, then by due date, undated last", () => {
    const undated = task({ id: "u" });
    const later = task({ id: "l", due_date: "2026-12-01" });
    const soon = task({ id: "s", due_date: "2026-10-02" });
    const overdue = task({ id: "o", due_date: "2026-09-01" });
    expect(sortTasks([undated, later, soon, overdue], TODAY).map((t) => t.id)).toEqual(["o", "s", "l", "u"]);
  });
});

describe("document list query", () => {
  const docs: DocumentWithCase[] = [
    { id: "d1", case_id: "c1", case_name: "A", case_number: "1", filename: "Sözleşme.pdf", file_type: "pdf", extracted_text: null, uploaded_at: "2026-01-01" },
    { id: "d2", case_id: "c2", case_name: "B", case_number: "2", filename: "notlar.txt", file_type: "txt", extracted_text: null, uploaded_at: "2026-01-02" },
  ];

  it("filters by type, case and case-insensitive Turkish filename search", () => {
    expect(parseDocumentListQuery(new URLSearchParams("tur=pdf&dava=c1&ara=SÖZ"))).toEqual({ tur: "pdf", dava: "c1", ara: "SÖZ" });
    expect(filterDocuments(docs, { tur: "txt" }).map((d) => d.id)).toEqual(["d2"]);
    expect(filterDocuments(docs, { dava: "c1" }).map((d) => d.id)).toEqual(["d1"]);
    expect(filterDocuments(docs, { ara: "SÖZ" }).map((d) => d.id)).toEqual(["d1"]);
  });
});

describe("calendar, tabs and dates", () => {
  it("accepts only valid YYYY-MM months", () => {
    expect(parseCalendarQuery(new URLSearchParams("ay=2026-10&goster=gorev"))).toEqual({ ay: "2026-10", goster: "gorev" });
    expect(parseCalendarQuery(new URLSearchParams("ay=2026-13&goster=x"))).toEqual({});
  });

  it("builds case detail links and parses tab slugs", () => {
    expect(caseDetailHref("c1")).toBe("/davalar/c1");
    expect(caseDetailHref("c1", "genel")).toBe("/davalar/c1");
    expect(caseDetailHref("c1", "gorevler")).toBe("/davalar/c1?sekme=gorevler");
    expect(parseCaseTab("belgeler")).toBe("belgeler");
    expect(parseCaseTab("yok")).toBe("genel");
    expect(parseCaseTab(null)).toBe("genel");
  });

  it("counts days until a date-only string", () => {
    expect(daysUntil("2026-09-30", TODAY)).toBe(0);
    expect(daysUntil("2026-10-07", TODAY)).toBe(7);
    expect(daysUntil("2026-09-29", TODAY)).toBe(-1);
  });
});
```

- [ ] **Step 2: Write the failing `urlState` tests** — `frontend/src/lib/__tests__/urlState.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatOdak, parseOdak, withParams } from "@/lib/urlState";

describe("parseOdak", () => {
  it("parses valid focus values", () => {
    expect(parseOdak("gorev:t1")).toEqual({ type: "gorev", id: "t1" });
    expect(parseOdak("belge:abc-123")).toEqual({ type: "belge", id: "abc-123" });
    expect(formatOdak({ type: "olay", id: "e1" })).toBe("olay:e1");
  });

  it("rejects malformed focus values", () => {
    expect(parseOdak(null)).toBeNull();
    expect(parseOdak("gorev")).toBeNull();
    expect(parseOdak("gorev:")).toBeNull();
    expect(parseOdak("dosya:1")).toBeNull();
  });
});

describe("withParams", () => {
  it("adds, replaces and removes keys while keeping the rest", () => {
    const current = new URLSearchParams("kategori=icra&onizle=c1&odak=gorev%3At1");
    expect(withParams("/davalar", current, { onizle: null, odak: null })).toBe("/davalar?kategori=icra");
    expect(withParams("/davalar", current, { onizle: "c2" })).toBe("/davalar?kategori=icra&onizle=c2&odak=gorev%3At1");
    expect(withParams("/davalar", new URLSearchParams(), { ara: "" })).toBe("/davalar");
  });
});
```

- [ ] **Step 3: Write the failing `api` test** — append inside `describe("api request()", ...)` in `frontend/src/lib/__tests__/api.test.ts`:

```ts
  it("sends the new case list filters as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getCases } = await import("@/lib/api");
    await getCases({ outcome: "won", active: true, hearing_within_days: 30, include_archived: true });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/cases?");
    expect(url).toContain("outcome=won");
    expect(url).toContain("active=true");
    expect(url).toContain("hearing_within_days=30");
    expect(url).toContain("include_archived=true");
  });

  it("throws an ApiError carrying the HTTP status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Case not found" }),
    }) as unknown as typeof fetch;

    const { getCase } = await import("@/lib/api");
    const { ApiError } = await import("@/lib/apiError");

    await expect(getCase("missing")).rejects.toBeInstanceOf(ApiError);
    await expect(getCase("missing")).rejects.toMatchObject({ status: 404 });
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__`
Expected: FAIL — `@/lib/filters`, `@/lib/urlState`, `@/lib/apiError` cannot be resolved.

- [ ] **Step 5: Add types** — in `frontend/src/types/index.ts`:

Replace the `CalendarEvent` interface with:

```ts
export interface CalendarEvent {
  event_type: "hearing" | "task";
  date: string;
  title: string;
  case_id: string;
  case_name: string;
  task_id: string | null;
}
```

Replace the `AnalyticsOverview` interface with (and add `StatusBreakdown` above it):

```ts
export interface StatusBreakdown {
  status: CaseStatus;
  total: number;
}

export interface AnalyticsOverview {
  total_cases: number;
  active_cases: number;
  won_cases: number;
  lost_cases: number;
  win_rate: number;
  average_case_duration_days: number;
  by_category: CategoryBreakdown[];
  by_status: StatusBreakdown[];
}
```

Append at the end of the file:

```ts
export type ReportKind = "cases" | "hearings" | "tasks" | "performance";

export interface ReportSummary {
  total_cases: number;
  upcoming_hearings_30d: number;
  open_tasks: number;
  win_rate: number;
}
```

- [ ] **Step 6: Create `frontend/src/lib/apiError.ts`**

```ts
/** Error thrown by lib/api for non-2xx responses. Lives in its own module
 * so component tests that mock "@/lib/api" can still import it. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
```

- [ ] **Step 7: Create `frontend/src/lib/download.ts`**

```ts
/** Triggers a browser download for a Blob (auth-protected files can't be
 * plain <a href> links because the API needs the Authorization header). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 8: Update `frontend/src/lib/api.ts`**

1. Add to the type import list: `CaseOutcome`, `ReportKind`, `ReportSummary`. Add `import { ApiError } from "@/lib/apiError";` below the type import.
2. In `request()`, replace `throw new Error(detail);` with `throw new ApiError(detail, response.status);`.
3. Replace `CaseListFilters` and `getCases` with:

```ts
export interface CaseListFilters {
  search?: string;
  status?: CaseStatus;
  case_type?: CaseType;
  include_archived?: boolean;
  outcome?: CaseOutcome;
  active?: boolean;
  hearing_within_days?: number;
}

export async function getCases(filters: CaseListFilters = {}): Promise<Case[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.case_type) params.set("case_type", filters.case_type);
  if (filters.include_archived) params.set("include_archived", "true");
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.active !== undefined) params.set("active", String(filters.active));
  if (filters.hearing_within_days) params.set("hearing_within_days", String(filters.hearing_within_days));
  const query = params.toString();
  return request(`/cases${query ? `?${query}` : ""}`);
}
```

4. Replace `downloadCasesCsv` (end of file) with:

```ts
async function fetchBlob(path: string, errorPrefix: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    throw new ApiError(`${errorPrefix} (${response.status}).`, response.status);
  }
  return response.blob();
}

export async function downloadReportCsv(kind: ReportKind): Promise<Blob> {
  return fetchBlob(`/reports/${kind}.csv`, "Rapor indirilemedi");
}

export async function downloadCasesCsv(): Promise<Blob> {
  return downloadReportCsv("cases");
}

export async function getReportSummary(): Promise<ReportSummary> {
  return request(`/reports/summary`);
}

export async function downloadDocument(documentId: string): Promise<Blob> {
  return fetchBlob(`/documents/${documentId}/download`, "Belge indirilemedi");
}
```

- [ ] **Step 9: Create `frontend/src/lib/filters.ts`**

```ts
/**
 * Single source of truth for URL query params <-> API filters and for every
 * in-app link to a filtered list. Components must build links with these
 * helpers so a card's number and the list it opens can never drift apart
 * (spec 5.1).
 */
import type { CaseListFilters } from "@/lib/api";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import type { CaseOutcome, CaseStatus, CaseType, DocumentItem, DocumentWithCase, TaskWithCase } from "@/types";

type ParamSource = { get(name: string): string | null };

export const CASE_TYPES: CaseType[] = ["is_hukuku", "ticaret_hukuku", "sozlesme", "kira", "icra", "diger"];
export const CASE_STATUSES: CaseStatus[] = ["devam_eden", "durusma_bekleyen", "karar_bekleyen", "kapali"];

export const OUTCOME_SLUGS = {
  kazanilan: "won",
  kaybedilen: "lost",
  sulh: "settled",
  devam: "ongoing",
} as const satisfies Record<string, CaseOutcome>;
export type OutcomeSlug = keyof typeof OUTCOME_SLUGS;
const OUTCOME_SLUG_VALUES = Object.keys(OUTCOME_SLUGS) as OutcomeSlug[];

export const OUTCOME_SLUG_LABELS: Record<OutcomeSlug, string> = {
  kazanilan: "Kazanılan",
  kaybedilen: "Kaybedilen",
  sulh: "Uzlaşma",
  devam: "Devam Eden",
};

/** Must match UPCOMING_HEARING_WINDOW_DAYS in backend report_service.py. */
export const UPCOMING_HEARING_DAYS = 30;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function buildHref(path: string, params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

// ---------- Dates (date-only strings are interpreted in local time) ----------

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(value: string, today: Date = new Date()): number {
  const ms = parseDateOnly(value).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86_400_000);
}

// ---------- Cases (/davalar) ----------

export interface CaseListQuery {
  ara?: string;
  kategori?: CaseType;
  durum?: CaseStatus | "aktif";
  sonuc?: OutcomeSlug;
  durusma?: "yaklasan";
  arsiv?: "dahil";
}

export const CASE_LIST_PARAM_KEYS = ["ara", "kategori", "durum", "sonuc", "durusma", "arsiv"] as const;
const DURUM_VALUES: ReadonlyArray<CaseStatus | "aktif"> = [...CASE_STATUSES, "aktif"];

export function parseCaseListQuery(params: ParamSource): CaseListQuery {
  const ara = params.get("ara")?.trim();
  return compact({
    ara: ara || undefined,
    kategori: pick(params.get("kategori"), CASE_TYPES),
    durum: pick(params.get("durum"), DURUM_VALUES),
    sonuc: pick(params.get("sonuc"), OUTCOME_SLUG_VALUES),
    durusma: pick(params.get("durusma"), ["yaklasan"] as const),
    arsiv: pick(params.get("arsiv"), ["dahil"] as const),
  });
}

export function caseListHref(query: CaseListQuery = {}): string {
  return buildHref("/davalar", {
    ara: query.ara,
    kategori: query.kategori,
    durum: query.durum,
    sonuc: query.sonuc,
    durusma: query.durusma,
    arsiv: query.arsiv,
  });
}

/** Links from analytics numbers: analytics counts archived cases, so the list must too. */
export function analyticsCaseListHref(query: Omit<CaseListQuery, "arsiv"> = {}): string {
  return caseListHref({ ...query, arsiv: "dahil" });
}

export function toCaseListFilters(query: CaseListQuery): CaseListFilters {
  const filters: CaseListFilters = {};
  if (query.ara) filters.search = query.ara;
  if (query.kategori) filters.case_type = query.kategori;
  if (query.durum === "aktif") filters.active = true;
  else if (query.durum) filters.status = query.durum;
  if (query.sonuc) filters.outcome = OUTCOME_SLUGS[query.sonuc];
  if (query.durusma === "yaklasan") filters.hearing_within_days = UPCOMING_HEARING_DAYS;
  if (query.arsiv === "dahil") filters.include_archived = true;
  return filters;
}

export interface FilterChip {
  key: string;
  label: string;
}

export function describeCaseListQuery(query: CaseListQuery): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.ara) chips.push({ key: "ara", label: `Arama: ${query.ara}` });
  if (query.kategori) chips.push({ key: "kategori", label: `Kategori: ${CASE_TYPE_LABELS[query.kategori]}` });
  if (query.durum) {
    chips.push({ key: "durum", label: `Durum: ${query.durum === "aktif" ? "Aktif" : CASE_STATUS_LABELS[query.durum]}` });
  }
  if (query.sonuc) chips.push({ key: "sonuc", label: `Sonuç: ${OUTCOME_SLUG_LABELS[query.sonuc]}` });
  if (query.durusma) chips.push({ key: "durusma", label: `Duruşma: önümüzdeki ${UPCOMING_HEARING_DAYS} gün` });
  if (query.arsiv) chips.push({ key: "arsiv", label: "Arşiv dahil" });
  return chips;
}

// ---------- Tasks (/gorevler) — filtered client-side ----------

export interface TaskListQuery {
  durum?: "acik" | "tamamlanan";
  vade?: "7gun" | "gecikmis";
  dava?: string;
}

export const TASK_LIST_PARAM_KEYS = ["durum", "vade", "dava"] as const;

export function parseTaskListQuery(params: ParamSource): TaskListQuery {
  return compact({
    durum: pick(params.get("durum"), ["acik", "tamamlanan"] as const),
    vade: pick(params.get("vade"), ["7gun", "gecikmis"] as const),
    dava: params.get("dava") || undefined,
  });
}

export function taskListHref(query: TaskListQuery = {}): string {
  return buildHref("/gorevler", { durum: query.durum, vade: query.vade, dava: query.dava });
}

export function isOverdue(task: TaskWithCase, today: Date = new Date()): boolean {
  return task.status !== "completed" && !!task.due_date && parseDateOnly(task.due_date) < startOfDay(today);
}

export function isDueWithinWeek(task: TaskWithCase, today: Date = new Date()): boolean {
  if (task.status === "completed" || !task.due_date) return false;
  const days = daysUntil(task.due_date, today);
  return days >= 0 && days <= 7;
}

export function filterTasks(tasks: TaskWithCase[], query: TaskListQuery, today: Date = new Date()): TaskWithCase[] {
  return tasks.filter((task) => {
    if (query.durum === "acik" && task.status === "completed") return false;
    if (query.durum === "tamamlanan" && task.status !== "completed") return false;
    if (query.vade === "7gun" && !isDueWithinWeek(task, today)) return false;
    if (query.vade === "gecikmis" && !isOverdue(task, today)) return false;
    if (query.dava && task.case_id !== query.dava) return false;
    return true;
  });
}

export function sortTasks(tasks: TaskWithCase[], today: Date = new Date()): TaskWithCase[] {
  return [...tasks].sort((a, b) => {
    const overdueFirst = Number(isOverdue(b, today)) - Number(isOverdue(a, today));
    if (overdueFirst !== 0) return overdueFirst;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
  });
}

export function describeTaskListQuery(query: TaskListQuery, caseLabel: (caseId: string) => string | undefined): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.durum) chips.push({ key: "durum", label: query.durum === "acik" ? "Açık görevler" : "Tamamlanan görevler" });
  if (query.vade) chips.push({ key: "vade", label: query.vade === "7gun" ? "7 gün içinde" : "Gecikmiş" });
  if (query.dava) chips.push({ key: "dava", label: `Dava: ${caseLabel(query.dava) ?? "—"}` });
  return chips;
}

// ---------- Documents (/belgeler) — filtered client-side ----------

export interface DocumentListQuery {
  ara?: string;
  tur?: DocumentItem["file_type"];
  dava?: string;
}

export const DOCUMENT_LIST_PARAM_KEYS = ["ara", "tur", "dava"] as const;
const DOCUMENT_TYPES: DocumentItem["file_type"][] = ["pdf", "docx", "txt"];

export function parseDocumentListQuery(params: ParamSource): DocumentListQuery {
  const ara = params.get("ara")?.trim();
  return compact({
    ara: ara || undefined,
    tur: pick(params.get("tur"), DOCUMENT_TYPES),
    dava: params.get("dava") || undefined,
  });
}

export function filterDocuments(documents: DocumentWithCase[], query: DocumentListQuery): DocumentWithCase[] {
  const needle = query.ara?.toLocaleLowerCase("tr-TR");
  return documents.filter((doc) => {
    if (query.tur && doc.file_type !== query.tur) return false;
    if (query.dava && doc.case_id !== query.dava) return false;
    if (needle && !doc.filename.toLocaleLowerCase("tr-TR").includes(needle)) return false;
    return true;
  });
}

export function describeDocumentListQuery(query: DocumentListQuery, caseLabel: (caseId: string) => string | undefined): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.ara) chips.push({ key: "ara", label: `Arama: ${query.ara}` });
  if (query.tur) chips.push({ key: "tur", label: `Tür: ${query.tur.toUpperCase()}` });
  if (query.dava) chips.push({ key: "dava", label: `Dava: ${caseLabel(query.dava) ?? "—"}` });
  return chips;
}

// ---------- Calendar (/takvim) ----------

export interface CalendarQuery {
  ay?: string; // YYYY-MM
  goster?: "durusma" | "gorev";
}

export function parseCalendarQuery(params: ParamSource): CalendarQuery {
  const ay = params.get("ay");
  return compact({
    ay: ay && /^\d{4}-(0[1-9]|1[0-2])$/.test(ay) ? ay : undefined,
    goster: pick(params.get("goster"), ["durusma", "gorev"] as const),
  });
}

// ---------- Case detail tabs ----------

export const CASE_TAB_SLUGS = ["genel", "belgeler", "gelismeler", "gorevler", "simulasyonlar", "devir", "notlar"] as const;
export type CaseTabSlug = (typeof CASE_TAB_SLUGS)[number];

export function parseCaseTab(value: string | null): CaseTabSlug {
  return pick(value, CASE_TAB_SLUGS) ?? "genel";
}

export function caseDetailHref(caseId: string, sekme?: CaseTabSlug): string {
  return buildHref(`/davalar/${caseId}`, { sekme: sekme && sekme !== "genel" ? sekme : undefined });
}
```

- [ ] **Step 10: Create `frontend/src/lib/urlState.ts`**

```ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type FocusType = "gorev" | "belge" | "olay";
export interface Focus {
  type: FocusType;
  id: string;
}

export const QUICK_VIEW_PARAM = "onizle";
export const FOCUS_PARAM = "odak";
const FOCUS_TYPES: FocusType[] = ["gorev", "belge", "olay"];

export function parseOdak(value: string | null | undefined): Focus | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id || !(FOCUS_TYPES as string[]).includes(type)) return null;
  return { type: type as FocusType, id };
}

export function formatOdak(focus: Focus): string {
  return `${focus.type}:${focus.id}`;
}

type ParamUpdates = Record<string, string | null | undefined>;

/** `pathname` + current params with `updates` applied; null/""/undefined removes a key. */
export function withParams(pathname: string, current: { toString(): string }, updates: ParamUpdates): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const serialized = searchParams?.toString() ?? "";
  const params = useMemo(() => new URLSearchParams(serialized), [serialized]);

  const hrefWith = useCallback((updates: ParamUpdates) => withParams(pathname, params, updates), [pathname, params]);

  const setParams = useCallback(
    (updates: ParamUpdates, options: { push?: boolean } = {}) => {
      const href = withParams(pathname, params, updates);
      if (options.push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, params, router],
  );

  return { params, hrefWith, setParams };
}

/** Returns a builder for "open the quick view for this case" links that keep the current page and filters. */
export function useQuickViewHref() {
  const { hrefWith } = useUrlParams();
  return useCallback(
    (caseId: string, focus?: Focus) =>
      hrefWith({ [QUICK_VIEW_PARAM]: caseId, [FOCUS_PARAM]: focus ? formatOdak(focus) : null }),
    [hrefWith],
  );
}
```

- [ ] **Step 11: Create the shared navigation mock** — `frontend/src/test/navigation.ts`:

```ts
/**
 * Shared next/navigation mock for component tests. Use in a test file with:
 *
 *   vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
 *   import { nav, resetNav, setUrl } from "@/test/navigation";
 *
 * The mock URL is static: push/replace are recorded but do not change it,
 * so tests set the URL up front with setUrl() and assert on nav.replace/push.
 */
import { vi } from "vitest";

export const nav = {
  pathname: "/",
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};

export function setUrl(url: string) {
  const parsed = new URL(url, "http://localhost:3000");
  nav.pathname = parsed.pathname;
  nav.searchParams = new URLSearchParams(parsed.search);
}

export function resetNav() {
  setUrl("/");
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.back.mockReset();
}

export const navigationModule = {
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: nav.back, refresh: vi.fn(), prefetch: vi.fn() }),
};
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__ && npx tsc --noEmit`
Expected: all PASS and no type errors.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/lib frontend/src/test frontend/src/types/index.ts
git commit -m "feat(web): URL filter mapping, URL state hooks and API additions for drill-down"
```

---

### Task 7: `CaseQuickView` drawer + `AppShell` host

**Files:**
- Create: `frontend/src/components/CaseQuickView.tsx`
- Modify: `frontend/src/components/AppShell.tsx`
- Test: `frontend/src/components/__tests__/CaseQuickView.test.tsx` (new)

**Interfaces:**
- Consumes: `useUrlParams`, `parseOdak`, `QUICK_VIEW_PARAM`, `FOCUS_PARAM` (Task 6); `caseDetailHref`, `daysUntil` (Task 6); `ApiError` (Task 6); `getCase`, `listCaseTasks`, `listDocuments`.
- Produces: `<CaseQuickView />` (mounted once in `AppShell`); `pickWithFocus<T extends { id: string }>(items: T[], focusId: string | undefined, limit?: number): T[]`. Any page opens it by linking to `useQuickViewHref()(caseId, focus?)`.

- [ ] **Step 1: Write the failing tests** — `frontend/src/components/__tests__/CaseQuickView.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);

const getCase = vi.fn();
const listCaseTasks = vi.fn();
const listDocuments = vi.fn();

vi.mock("@/lib/api", () => ({
  getCase: (...args: unknown[]) => getCase(...args),
  listCaseTasks: (...args: unknown[]) => listCaseTasks(...args),
  listDocuments: (...args: unknown[]) => listDocuments(...args),
}));

import { CaseQuickView, pickWithFocus } from "@/components/CaseQuickView";
import { ApiError } from "@/lib/apiError";
import { nav, resetNav, setUrl } from "@/test/navigation";

const detail = {
  id: "c1",
  case_number: "2026/14",
  case_name: "Ticari Kira Uyarlama Davası",
  client_name: "Deniz Arslan",
  opposing_party: null,
  court: null,
  case_type: "kira",
  status: "durusma_bekleyen",
  next_hearing_date: null,
  timeline: [
    { id: "e1", event_date: "2026-01-10", title: "Dava açıldı", description: null, event_type: "filing", created_at: "2026-01-10" },
    { id: "e2", event_date: "2026-03-01", title: "Bilirkişi atandı", description: null, event_type: "other", created_at: "2026-03-01" },
  ],
};

function pendingTask(id: string, due: string) {
  return { id, case_id: "c1", title: `Görev ${id}`, description: null, due_date: due, status: "pending", assigned_to: null, created_at: "2026-01-01", completed_at: null };
}

beforeEach(() => {
  resetNav();
  getCase.mockReset();
  listCaseTasks.mockReset();
  listDocuments.mockReset();
  listCaseTasks.mockResolvedValue([]);
  listDocuments.mockResolvedValue([]);
});

describe("CaseQuickView", () => {
  it("renders nothing without the onizle param", () => {
    setUrl("/davalar");
    const { container } = render(<CaseQuickView />);
    expect(container).toBeEmptyDOMElement();
    expect(getCase).not.toHaveBeenCalled();
  });

  it("shows the case summary, em dashes for missing values and tab shortcuts", async () => {
    setUrl("/dashboard?onizle=c1");
    getCase.mockResolvedValue(detail);

    render(<CaseQuickView />);

    const dialog = await screen.findByRole("dialog", { name: "Ticari Kira Uyarlama Davası" });
    expect(getCase).toHaveBeenCalledWith("c1");
    expect(within(dialog).getByText("Deniz Arslan")).toBeInTheDocument();
    expect(within(dialog).getAllByText("—").length).toBeGreaterThanOrEqual(3); // karşı taraf, mahkeme, duruşma
    expect(within(dialog).getByRole("link", { name: "Davaya git →" })).toHaveAttribute("href", "/davalar/c1");
    expect(within(dialog).getByRole("link", { name: "Görevler" })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
    // most recent event first
    const events = within(dialog).getAllByTestId("quickview-event");
    expect(events[0]).toHaveTextContent("Bilirkişi atandı");
  });

  it("shows at most 3 open tasks and pins the focused one", async () => {
    setUrl("/gorevler?onizle=c1&odak=gorev%3At5");
    getCase.mockResolvedValue(detail);
    listCaseTasks.mockResolvedValue([
      pendingTask("t1", "2026-10-01"),
      pendingTask("t2", "2026-10-02"),
      pendingTask("t3", "2026-10-03"),
      pendingTask("t4", "2026-10-04"),
      pendingTask("t5", "2026-10-05"),
    ]);

    render(<CaseQuickView />);

    const dialog = await screen.findByRole("dialog");
    const tasks = within(dialog).getAllByTestId("quickview-task");
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toHaveTextContent("Görev t5");
    expect(tasks[0]).toHaveAttribute("data-focused", "true");
    expect(within(dialog).getByRole("link", { name: "Tümü (5) →" })).toHaveAttribute("href", "/davalar/c1?sekme=gorevler");
  });

  it("shows a not-found message for a 404", async () => {
    setUrl("/davalar?onizle=missing");
    getCase.mockRejectedValue(new ApiError("Case not found", 404));

    render(<CaseQuickView />);

    expect(await screen.findByText(/dava bulunamadı veya erişiminiz yok/i)).toBeInTheDocument();
  });

  it("retries after a generic error", async () => {
    setUrl("/davalar?onizle=c1");
    getCase.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(detail);

    render(<CaseQuickView />);
    await userEvent.click(await screen.findByRole("button", { name: "Tekrar dene" }));

    expect(await screen.findByRole("dialog", { name: "Ticari Kira Uyarlama Davası" })).toBeInTheDocument();
    expect(getCase).toHaveBeenCalledTimes(2);
  });

  it("closes with Escape and with the close button, keeping other params", async () => {
    setUrl("/davalar?kategori=icra&onizle=c1&odak=gorev%3At1");
    getCase.mockResolvedValue(detail);

    render(<CaseQuickView />);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?kategori=icra", { scroll: false });

    await userEvent.click(screen.getByRole("button", { name: "Önizlemeyi kapat" }));
    expect(nav.replace).toHaveBeenCalledTimes(2);
  });
});

describe("pickWithFocus", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("keeps the first items when the focus is among them or absent", () => {
    expect(pickWithFocus(items, undefined).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(pickWithFocus(items, "b").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("pins a focused item that would otherwise be cut", () => {
    expect(pickWithFocus(items, "d").map((i) => i.id)).toEqual(["d", "a", "b"]);
    expect(pickWithFocus(items, "zzz").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseQuickView.test.tsx`
Expected: FAIL — cannot resolve `@/components/CaseQuickView`.

- [ ] **Step 3: Implement** — `frontend/src/components/CaseQuickView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCase, listCaseTasks, listDocuments } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { caseDetailHref, daysUntil, type CaseTabSlug } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { FOCUS_PARAM, QUICK_VIEW_PARAM, parseOdak, useUrlParams, type Focus } from "@/lib/urlState";
import type { CaseDetail, DocumentItem, Task } from "@/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; notFound: boolean }
  | { kind: "ready"; detail: CaseDetail; tasks: Task[]; documents: DocumentItem[] };

const SHORTCUTS: Array<[CaseTabSlug, string]> = [
  ["gorevler", "Görevler"],
  ["belgeler", "Belgeler"],
  ["gelismeler", "Gelişmeler"],
  ["simulasyonlar", "Simülasyonlar"],
];

const EMPTY = "—";

/** First `limit` items; if the focused item would be cut off, it is pinned to the top. */
export function pickWithFocus<T extends { id: string }>(items: T[], focusId: string | undefined, limit = 3): T[] {
  const top = items.slice(0, limit);
  if (!focusId || top.some((item) => item.id === focusId)) return top;
  const focused = items.find((item) => item.id === focusId);
  return focused ? [focused, ...items.slice(0, limit - 1)] : top;
}

function focusIdFor(focus: Focus | null, type: Focus["type"]): string | undefined {
  return focus?.type === type ? focus.id : undefined;
}

export function CaseQuickView() {
  const { params, setParams } = useUrlParams();
  const caseId = params.get(QUICK_VIEW_PARAM);
  const focus = parseOdak(params.get(FOCUS_PARAM));
  const isOpen = caseId !== null;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setParams({ [QUICK_VIEW_PARAM]: null, [FOCUS_PARAM]: null }), [setParams]);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([getCase(caseId), listCaseTasks(caseId), listDocuments(caseId)])
      .then(([detail, tasks, documents]) => {
        if (!cancelled) setState({ kind: "ready", detail, tasks, documents });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", notFound: error instanceof ApiError && error.status === 404 });
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, reloadToken]);

  // Focus management + Escape + a minimal focus trap while open.
  useEffect(() => {
    if (!isOpen) return;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusTo?.focus?.();
    };
  }, [isOpen]);

  if (!caseId) return null;

  const title = state.kind === "ready" ? state.detail.case_name : "Dava önizleme";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" aria-hidden="true" data-testid="quickview-backdrop" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickview-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-white shadow-xl outline-none sm:w-[440px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            {state.kind === "ready" && (
              <p className="text-xs font-medium uppercase tracking-wide text-accent-600">{state.detail.case_number}</p>
            )}
            <h2 id="quickview-title" className="truncate text-base font-semibold text-navy-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Önizlemeyi kapat"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted hover:text-navy-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {state.kind === "loading" && (
            <div role="status" aria-label="Dava yükleniyor" className="space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-4 animate-pulse rounded bg-surface-muted" />
              ))}
            </div>
          )}

          {state.kind === "error" && state.notFound && (
            <div className="space-y-3 text-sm text-navy-600">
              <p>Dava bulunamadı veya erişiminiz yok.</p>
              <button type="button" onClick={close} className="rounded-lg border border-surface-border px-3 py-1.5 font-medium hover:bg-surface-muted">
                Kapat
              </button>
            </div>
          )}

          {state.kind === "error" && !state.notFound && (
            <div className="space-y-3 text-sm text-navy-600">
              <p>Dava bilgileri yüklenemedi.</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="rounded-lg border border-surface-border px-3 py-1.5 font-medium hover:bg-surface-muted"
              >
                Tekrar dene
              </button>
            </div>
          )}

          {state.kind === "ready" && <QuickViewBody {...state} focus={focus} />}
        </div>

        {state.kind === "ready" && (
          <div className="space-y-3 border-t border-surface-border p-4">
            <Link
              href={caseDetailHref(state.detail.id)}
              className="block w-full rounded-xl bg-accent-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-accent-700"
            >
              Davaya git →
            </Link>
            <nav aria-label="Dava sekmeleri" className="flex flex-wrap gap-2 text-xs">
              {SHORTCUTS.map(([slug, label]) => (
                <Link
                  key={slug}
                  href={caseDetailHref(state.detail.id, slug)}
                  className="rounded-lg border border-surface-border px-2.5 py-1.5 font-medium text-navy-700 hover:border-accent-400 hover:text-accent-700"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickViewBody({
  detail,
  tasks,
  documents,
  focus,
}: {
  detail: CaseDetail;
  tasks: Task[];
  documents: DocumentItem[];
  focus: Focus | null;
}) {
  const openTasks = tasks.filter((task) => task.status !== "completed");
  const events = [...detail.timeline].sort((a, b) => (a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0));
  const recentDocuments = [...documents].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : a.uploaded_at > b.uploaded_at ? -1 : 0));
  const hearingDays = detail.next_hearing_date ? daysUntil(detail.next_hearing_date) : null;

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">
          {CASE_STATUS_LABELS[detail.status] ?? detail.status}
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-navy-600">
          {CASE_TYPE_LABELS[detail.case_type] ?? detail.case_type}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Müvekkil" value={detail.client_name} />
        <Field label="Karşı taraf" value={detail.opposing_party} />
        <Field label="Mahkeme" value={detail.court} />
        <div>
          <dt className="text-xs text-navy-500">Sonraki duruşma</dt>
          <dd className="mt-0.5 font-medium text-navy-800">
            {detail.next_hearing_date ? formatDate(detail.next_hearing_date) : EMPTY}
            {hearingDays !== null && hearingDays >= 0 && hearingDays <= 7 && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">7 gün içinde</span>
            )}
          </dd>
        </div>
      </dl>

      <Section
        title="Açık görevler"
        moreHref={caseDetailHref(detail.id, "gorevler")}
        moreLabel={`Tümü (${openTasks.length}) →`}
        empty="Açık görev yok."
        count={openTasks.length}
      >
        {pickWithFocus(openTasks, focusIdFor(focus, "gorev")).map((task) => (
          <Item key={task.id} testId="quickview-task" focused={task.id === focusIdFor(focus, "gorev")}>
            <span className="text-navy-800">{task.title}</span>
            <span className="shrink-0 text-xs text-navy-500">{task.due_date ? formatDate(task.due_date) : EMPTY}</span>
          </Item>
        ))}
      </Section>

      <Section
        title="Son gelişmeler"
        moreHref={caseDetailHref(detail.id, "gelismeler")}
        moreLabel="Tümü →"
        empty="Henüz gelişme yok."
        count={events.length}
      >
        {pickWithFocus(events, focusIdFor(focus, "olay")).map((event) => (
          <Item key={event.id} testId="quickview-event" focused={event.id === focusIdFor(focus, "olay")}>
            <span className="text-navy-800">{event.title}</span>
            <span className="shrink-0 text-xs text-navy-500">{formatDate(event.event_date)}</span>
          </Item>
        ))}
      </Section>

      <Section
        title="Belgeler"
        moreHref={caseDetailHref(detail.id, "belgeler")}
        moreLabel={`Tümü (${documents.length}) →`}
        empty="Henüz belge yok."
        count={documents.length}
      >
        {pickWithFocus(recentDocuments, focusIdFor(focus, "belge")).map((doc) => (
          <Item key={doc.id} testId="quickview-document" focused={doc.id === focusIdFor(focus, "belge")}>
            <span className="truncate text-navy-800">{doc.filename}</span>
            <span className="shrink-0 text-xs uppercase text-navy-500">{doc.file_type}</span>
          </Item>
        ))}
      </Section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-navy-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy-800">{value || EMPTY}</dd>
    </div>
  );
}

function Section({
  title,
  moreHref,
  moreLabel,
  empty,
  count,
  children,
}: {
  title: string;
  moreHref: string;
  moreLabel: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-500">{title}</h3>
        {count > 0 && (
          <Link href={moreHref} className="text-xs font-medium text-accent-700 hover:text-accent-800">
            {moreLabel}
          </Link>
        )}
      </div>
      {count === 0 ? <p className="text-xs text-navy-400">{empty}</p> : <ul className="space-y-1.5">{children}</ul>}
    </section>
  );
}

function Item({ testId, focused, children }: { testId: string; focused: boolean; children: React.ReactNode }) {
  return (
    <li
      data-testid={testId}
      data-focused={focused ? "true" : undefined}
      className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 ${
        focused ? "bg-accent-50 ring-1 ring-accent-300" : "bg-surface-muted/60"
      }`}
    >
      {children}
    </li>
  );
}
```

- [ ] **Step 4: Mount it in `AppShell`** — replace `frontend/src/components/AppShell.tsx`:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CaseQuickView } from "@/components/CaseQuickView";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("casebridge_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  // Suspense boundaries: views and the drawer read useSearchParams(), which
  // Next 14 requires to be inside <Suspense> for static prerendering.
  return (
    <div className="flex h-screen bg-surface-muted">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <ErrorBoundary>
          <Suspense fallback={null}>{children}</Suspense>
        </ErrorBoundary>
      </main>
      <Suspense fallback={null}>
        <CaseQuickView />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseQuickView.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CaseQuickView.tsx frontend/src/components/AppShell.tsx frontend/src/components/__tests__/CaseQuickView.test.tsx
git commit -m "feat(web): URL-driven case quick-view drawer"
```

---

### Task 8: Case detail tabs ↔ `?sekme=`

**Files:**
- Modify: `frontend/src/components/CaseDetailView.tsx` (lines 1–35 constants, `useState<Tab>` line ~52, tab bar ~243–258)
- Test: `frontend/src/components/__tests__/CaseDetailView.test.tsx`

**Interfaces:**
- Consumes: `parseCaseTab`, `CaseTabSlug` (Task 6), `useUrlParams` (Task 6).
- Produces: `/davalar/<id>?sekme=<slug>` opens that tab; clicking a tab calls `router.replace` with the new `sekme` (omitted for `genel`).

- [ ] **Step 1: Write the failing tests** — in `CaseDetailView.test.tsx`, add below the existing imports of vitest/testing-library (before `vi.mock("@/lib/api", ...)`):

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
```

In the existing `beforeEach`, add as the first lines:

```tsx
  resetNav();
  setUrl("/davalar/c1");
```

Append inside the top-level `describe`:

```tsx
  it("opens the tab named in ?sekme=", async () => {
    setUrl("/davalar/c1?sekme=gorevler");
    render(<CaseDetailView caseId="c1" />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Görevler" })).toHaveAttribute("aria-selected", "true"));
  });

  it("falls back to Genel Bakış for an unknown ?sekme=", async () => {
    setUrl("/davalar/c1?sekme=yok");
    render(<CaseDetailView caseId="c1" />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Genel Bakış" })).toHaveAttribute("aria-selected", "true"));
  });

  it("writes the selected tab to the URL", async () => {
    render(<CaseDetailView caseId="c1" />);
    await userEvent.click(await screen.findByRole("tab", { name: "Belgeler" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar/c1?sekme=belgeler", { scroll: false });

    await userEvent.click(screen.getByRole("tab", { name: "Genel Bakış" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar/c1", { scroll: false });
  });
```

(The existing tests' `getCase`/`listCaseTasks` etc. mocks are set in the file's `beforeEach`; if a mock is not resolved by default there, copy the resolution lines used by the existing "renders" test into these three tests.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseDetailView.test.tsx`
Expected: the 3 new tests FAIL (tab not selected / `replace` not called); existing tests PASS.

- [ ] **Step 3: Implement** — in `CaseDetailView.tsx`:

Add imports:

```tsx
import { parseCaseTab, type CaseTabSlug } from "@/lib/filters";
import { useUrlParams } from "@/lib/urlState";
```

Replace the `TABS` constant and `Tab` type:

```tsx
const TABS = [
  { slug: "genel", label: "Genel Bakış" },
  { slug: "belgeler", label: "Belgeler" },
  { slug: "gelismeler", label: "Gelişmeler" },
  { slug: "gorevler", label: "Görevler" },
  { slug: "simulasyonlar", label: "Simülasyonlar" },
  { slug: "devir", label: "Devir Raporu" },
  { slug: "notlar", label: "Notlar" },
] as const satisfies ReadonlyArray<{ slug: CaseTabSlug; label: string }>;
type Tab = (typeof TABS)[number]["label"];

function labelForSlug(slug: CaseTabSlug): Tab {
  return TABS.find((tab) => tab.slug === slug)!.label;
}
```

Replace `const [activeTab, setActiveTab] = useState<Tab>("Genel Bakış");` with:

```tsx
  const { params, setParams } = useUrlParams();
  const sekmeParam = params.get("sekme");
  const [activeTab, setActiveTab] = useState<Tab>(() => labelForSlug(parseCaseTab(sekmeParam)));

  // Follow external URL changes (e.g. a quick-view shortcut to another tab of this case).
  useEffect(() => {
    setActiveTab(labelForSlug(parseCaseTab(sekmeParam)));
  }, [sekmeParam]);

  function selectTab(tab: (typeof TABS)[number]) {
    setActiveTab(tab.label);
    setParams({ sekme: tab.slug === "genel" ? null : tab.slug });
  }
```

Replace the tab bar `TABS.map(...)` block with:

```tsx
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            role="tab"
            aria-selected={activeTab === tab.label}
            onClick={() => selectTab(tab)}
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === tab.label
                ? "border-b-2 border-accent-600 text-accent-700"
                : "text-navy-500 hover:text-navy-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
```

All `activeTab === "Belgeler"` style comparisons further down stay unchanged (they compare labels). Search the file for any other `setActiveTab(` call and replace it with `selectTab(TABS.find((t) => t.label === "<label>")!)`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseDetailView.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CaseDetailView.tsx frontend/src/components/__tests__/CaseDetailView.test.tsx
git commit -m "feat(web): sync case detail tabs with ?sekme="
```

---

### Task 9: Shared clickable UI — `StatCard` href, `FilterChips`, `ChartLegendLinks`

**Files:**
- Modify: `frontend/src/components/StatCard.tsx`
- Create: `frontend/src/components/FilterChips.tsx`
- Create: `frontend/src/components/ChartLegendLinks.tsx`
- Test: `frontend/src/components/__tests__/ClickableUi.test.tsx` (new)

**Interfaces:**
- Consumes: `FilterChip` (Task 6).
- Produces:
  - `StatCard({ label, value, accent?, href? })` — renders a `<Link>` when `href` is set.
  - `FilterChips({ chips, onRemove(key: string), onClear(), resultCount? })` — returns `null` when `chips` is empty.
  - `NoFilterResults({ onClear })`.
  - `ChartLegendLinks({ items: LegendLinkItem[], ariaLabel })`, `LegendLinkItem = { key: string; label: string; value: string | number; href: string; color?: string }`.

- [ ] **Step 1: Write the failing tests** — `frontend/src/components/__tests__/ClickableUi.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChartLegendLinks } from "@/components/ChartLegendLinks";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";
import { StatCard } from "@/components/StatCard";

describe("StatCard", () => {
  it("is a plain block without href", () => {
    render(<StatCard label="Ort. Dava Süresi (gün)" value={120} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is a link with href", () => {
    render(<StatCard label="Aktif Davalar" value={10} href="/davalar?durum=aktif&arsiv=dahil" />);
    expect(screen.getByRole("link", { name: /Aktif Davalar/ })).toHaveAttribute("href", "/davalar?durum=aktif&arsiv=dahil");
  });
});

describe("FilterChips", () => {
  it("renders nothing without chips", () => {
    const { container } = render(<FilterChips chips={[]} onRemove={vi.fn()} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("removes one chip or clears all, and shows the result count", async () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(
      <FilterChips
        chips={[{ key: "kategori", label: "Kategori: İcra" }, { key: "arsiv", label: "Arşiv dahil" }]}
        onRemove={onRemove}
        onClear={onClear}
        resultCount={3}
      />,
    );

    expect(screen.getByText("3 sonuç")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kategori: İcra filtresini kaldır" }));
    expect(onRemove).toHaveBeenCalledWith("kategori");
    await userEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("offers a clear button in the filtered empty state", async () => {
    const onClear = vi.fn();
    render(<NoFilterResults onClear={onClear} />);
    expect(screen.getByText("Bu filtrelere uyan kayıt yok.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filtreleri temizle" }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("ChartLegendLinks", () => {
  it("renders one keyboard-reachable link per item", () => {
    render(
      <ChartLegendLinks
        ariaLabel="Dava dağılımı kategorileri"
        items={[
          { key: "icra", label: "İcra", value: 3, href: "/davalar?kategori=icra&arsiv=dahil" },
          { key: "kira", label: "Kira", value: 5, href: "/davalar?kategori=kira&arsiv=dahil", color: "#6d43f5" },
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "Dava dağılımı kategorileri" });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İcra · 3" })).toHaveAttribute("href", "/davalar?kategori=icra&arsiv=dahil");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/ClickableUi.test.tsx`
Expected: FAIL — missing modules / StatCard has no link.

- [ ] **Step 3: Replace `frontend/src/components/StatCard.tsx`**

```tsx
import Link from "next/link";

const CARD = "rounded-2xl border border-surface-border bg-white p-5 shadow-card";

export function StatCard({
  label,
  value,
  accent = false,
  href,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-sm text-navy-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? "text-accent-600" : "text-navy-900"}`}>{value}</p>
    </>
  );

  if (!href) return <div className={CARD}>{content}</div>;

  return (
    <Link
      href={href}
      className={`group relative block ${CARD} transition hover:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400`}
    >
      {content}
      <span
        aria-hidden="true"
        className="absolute right-4 top-4 text-accent-500 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        →
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/FilterChips.tsx`**

```tsx
import type { FilterChip } from "@/lib/filters";

export function FilterChips({
  chips,
  onRemove,
  onClear,
  resultCount,
}: {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
  resultCount?: number;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Aktif filtreler">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-accent-50 py-1 pl-3 pr-1 font-medium text-accent-700">
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            aria-label={`${chip.label} filtresini kaldır`}
            className="grid h-5 w-5 place-items-center rounded-full hover:bg-accent-100"
          >
            ✕
          </button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="font-medium text-navy-500 underline-offset-2 hover:text-navy-800 hover:underline">
        Filtreleri temizle
      </button>
      {resultCount !== undefined && <span className="ml-auto text-navy-500">{resultCount} sonuç</span>}
    </div>
  );
}

export function NoFilterResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-navy-500">
      <p>Bu filtrelere uyan kayıt yok.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 rounded-lg border border-surface-border px-3 py-1.5 font-medium text-navy-700 hover:bg-surface-muted"
      >
        Filtreleri temizle
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/src/components/ChartLegendLinks.tsx`**

```tsx
import Link from "next/link";

export interface LegendLinkItem {
  key: string;
  label: string;
  value: string | number;
  href: string;
  color?: string;
}

/** SVG chart marks are not keyboard-focusable; this legend gives every mark an accessible link twin. */
export function ChartLegendLinks({ items, ariaLabel }: { items: LegendLinkItem[]; ariaLabel: string }) {
  return (
    <ul aria-label={ariaLabel} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded text-navy-600 hover:text-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {item.color && <i aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />}
            {item.label} · {item.value}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/ClickableUi.test.tsx`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/StatCard.tsx frontend/src/components/FilterChips.tsx frontend/src/components/ChartLegendLinks.tsx frontend/src/components/__tests__/ClickableUi.test.tsx
git commit -m "feat(web): clickable stat cards, filter chips and chart legend links"
```

---
### Task 10: Davalar list — URL filters, chips, preview, new column

**Files:**
- Modify (full replacement): `frontend/src/components/CaseListView.tsx`
- Test: `frontend/src/components/__tests__/CaseListView.test.tsx`

**Interfaces:**
- Consumes: `parseCaseListQuery`, `toCaseListFilters`, `caseListHref`, `describeCaseListQuery`, `CASE_LIST_PARAM_KEYS`, `CASE_TYPES`, `CASE_STATUSES`, `OUTCOME_SLUG_LABELS`, `OutcomeSlug` (Task 6); `useUrlParams`, `useQuickViewHref` (Task 6); `FilterChips`, `NoFilterResults` (Task 9).
- Produces: `/davalar?…` fully URL-driven; each row has an "Önizle" link with accessible name `"<case_name> önizle"`.

- [ ] **Step 1: Write the failing tests** — in `CaseListView.test.tsx`:

Add after the vitest/testing-library imports:

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
```

In `beforeEach` add `resetNav(); setUrl("/davalar");` as the first line.

Add a shared fixture near the top (after the import of `CaseListView`):

```tsx
const icraCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Kat Mülkiyeti Aidat Alacağı",
  client_name: "Ayşe Kaya",
  case_type: "icra",
  status: "devam_eden",
  outcome: "ongoing",
  next_hearing_date: null,
  is_archived: false,
};
```

Append inside `describe("CaseListView", ...)`:

```tsx
  it("loads with filters read from the URL and shows them as chips", async () => {
    setUrl("/davalar?kategori=icra&sonuc=kazanilan&arsiv=dahil");
    getCases.mockResolvedValue([icraCase]);

    render(<CaseListView />);

    await waitFor(() => expect(getCases).toHaveBeenCalledWith({ case_type: "icra", outcome: "won", include_archived: true }));
    expect(screen.getByText("Kategori: İcra")).toBeInTheDocument();
    expect(screen.getByText("Sonuç: Kazanılan")).toBeInTheDocument();
    expect(screen.getByText("Arşiv dahil")).toBeInTheDocument();
    expect(screen.getByText("1 sonuç")).toBeInTheDocument();
  });

  it("maps durum=aktif to the active filter", async () => {
    setUrl("/davalar?durum=aktif");
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    await waitFor(() => expect(getCases).toHaveBeenCalledWith({ active: true }));
  });

  it("writes dropdown changes and chip removals to the URL", async () => {
    setUrl("/davalar?kategori=icra");
    getCases.mockResolvedValue([icraCase]);
    render(<CaseListView />);
    await screen.findByText("Kat Mülkiyeti Aidat Alacağı");

    await userEvent.selectOptions(screen.getByLabelText("Durum filtresi"), "aktif");
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?kategori=icra&durum=aktif", { scroll: false });

    await userEvent.click(screen.getByRole("button", { name: "Kategori: İcra filtresini kaldır" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar", { scroll: false });
  });

  it("shows the filtered empty state when filters match nothing", async () => {
    setUrl("/davalar?kategori=kira");
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    expect(await screen.findByText("Bu filtrelere uyan kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(/henüz dava bulunmuyor/i)).not.toBeInTheDocument();
  });

  it("links name to detail, row to preview and badges to filters", async () => {
    getCases.mockResolvedValue([{ ...icraCase, next_hearing_date: "2026-10-12" }]);
    render(<CaseListView />);
    await screen.findByText("Kat Mülkiyeti Aidat Alacağı");

    expect(screen.getByRole("link", { name: "Kat Mülkiyeti Aidat Alacağı" })).toHaveAttribute("href", "/davalar/c1");
    expect(screen.getByRole("link", { name: "Kat Mülkiyeti Aidat Alacağı önizle" })).toHaveAttribute("href", "/davalar?onizle=c1");
    expect(screen.getByRole("link", { name: "İcra" })).toHaveAttribute("href", "/davalar?kategori=icra");
    expect(screen.getByRole("link", { name: "Devam Eden" })).toHaveAttribute("href", "/davalar?durum=devam_eden");
    expect(screen.getByText("12.10.2026")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Ayşe Kaya"));
    expect(nav.push).toHaveBeenCalledWith("/davalar?onizle=c1", { scroll: false });
  });

  it("submits the search box to the URL", async () => {
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    await userEvent.type(screen.getByPlaceholderText(/dava adı, müvekkil/i), "kira");
    await userEvent.click(screen.getByRole("button", { name: "Ara" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?ara=kira", { scroll: false });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseListView.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Replace `frontend/src/components/CaseListView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createCase, getCases } from "@/lib/api";
import {
  CASE_LIST_PARAM_KEYS,
  CASE_STATUSES,
  CASE_TYPES,
  OUTCOME_SLUG_LABELS,
  caseListHref,
  describeCaseListQuery,
  parseCaseListQuery,
  toCaseListFilters,
  type OutcomeSlug,
} from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { Case, CaseType } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

const EMPTY_FORM = {
  case_number: "",
  case_name: "",
  client_name: "",
  opposing_party: "",
  case_type: "diger" as CaseType,
  court: "",
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  devam_eden: "bg-accent-50 text-accent-700",
  durusma_bekleyen: "bg-amber-50 text-amber-700",
  karar_bekleyen: "bg-blue-50 text-blue-700",
  kapali: "bg-surface-muted text-navy-500",
};

const SELECT = "rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";

export function CaseListView() {
  const router = useRouter();
  const { params, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const query = useMemo(() => parseCaseListQuery(params), [params]);
  const queryKey = caseListHref(query);
  const chips = describeCaseListQuery(query);

  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(query.ara ?? "");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getCases(toCaseListFilters(query))
      .then(setCases)
      .catch(() => setError("Davalar yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // queryKey is the serialized query; reload whenever the URL filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setParams({ ara: search.trim() || null });
  }

  function removeFilter(key: string) {
    if (key === "ara") setSearch("");
    setParams({ [key]: null });
  }

  function clearFilters() {
    setSearch("");
    setParams(Object.fromEntries(CASE_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createCase(form);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      load();
    } catch {
      setCreateError("Dava oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setCreating(false);
    }
  }

  function handleRowClick(event: React.MouseEvent, caseId: string) {
    if ((event.target as HTMLElement).closest("a, button, input, select")) return;
    router.push(quickViewHref(caseId), { scroll: false });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Davalar</h1>
          <p className="text-sm text-navy-500">Tüm aktif ve geçmiş davalarınızı yönetin.</p>
        </div>
        <button
          onClick={() => setFormOpen((open) => !open)}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          + Yeni Dava
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="flex min-w-[260px] flex-1 gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dava adı, müvekkil veya karşı taraf ara..."
            className="w-full max-w-md rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
          />
          <button type="submit" className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted">
            Ara
          </button>
        </form>
        <select aria-label="Kategori filtresi" value={query.kategori ?? ""} onChange={(e) => setParams({ kategori: e.target.value || null })} className={SELECT}>
          <option value="">Tüm kategoriler</option>
          {CASE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CASE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select aria-label="Durum filtresi" value={query.durum ?? ""} onChange={(e) => setParams({ durum: e.target.value || null })} className={SELECT}>
          <option value="">Tüm durumlar</option>
          <option value="aktif">Aktif (kapalı hariç)</option>
          {CASE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CASE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select aria-label="Sonuç filtresi" value={query.sonuc ?? ""} onChange={(e) => setParams({ sonuc: e.target.value || null })} className={SELECT}>
          <option value="">Tüm sonuçlar</option>
          {(Object.keys(OUTCOME_SLUG_LABELS) as OutcomeSlug[]).map((slug) => (
            <option key={slug} value={slug}>
              {OUTCOME_SLUG_LABELS[slug]}
            </option>
          ))}
        </select>
      </div>

      <FilterChips chips={chips} onRemove={removeFilter} onClear={clearFilters} resultCount={loading || error ? undefined : cases.length} />

      {formOpen && (
        <form
          onSubmit={handleCreateSubmit}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-surface-border bg-white p-5 shadow-card sm:grid-cols-2"
        >
          <div>
            <label htmlFor="case_number" className="mb-1 block text-xs font-medium text-navy-600">
              Dava No
            </label>
            <input
              id="case_number"
              required
              value={form.case_number}
              onChange={(event) => setForm({ ...form, case_number: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="case_name" className="mb-1 block text-xs font-medium text-navy-600">
              Dava Adı
            </label>
            <input
              id="case_name"
              required
              value={form.case_name}
              onChange={(event) => setForm({ ...form, case_name: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="client_name" className="mb-1 block text-xs font-medium text-navy-600">
              Müvekkil
            </label>
            <input
              id="client_name"
              required
              value={form.client_name}
              onChange={(event) => setForm({ ...form, client_name: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="opposing_party" className="mb-1 block text-xs font-medium text-navy-600">
              Karşı Taraf
            </label>
            <input
              id="opposing_party"
              value={form.opposing_party}
              onChange={(event) => setForm({ ...form, opposing_party: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>
          <div>
            <label htmlFor="case_type" className="mb-1 block text-xs font-medium text-navy-600">
              Kategori
            </label>
            <select
              id="case_type"
              value={form.case_type}
              onChange={(event) => setForm({ ...form, case_type: event.target.value as CaseType })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            >
              {CASE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CASE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="court" className="mb-1 block text-xs font-medium text-navy-600">
              Mahkeme
            </label>
            <input
              id="court"
              value={form.court}
              onChange={(event) => setForm({ ...form, court: event.target.value })}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
          </div>

          {createError && (
            <div className="sm:col-span-2">
              <ErrorState message={createError} />
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {creating ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      )}

      {loading && <LoadingState label="Davalar yükleniyor..." />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && cases.length === 0 && chips.length > 0 && <NoFilterResults onClear={clearFilters} />}
      {!loading && !error && cases.length === 0 && chips.length === 0 && (
        <EmptyState message="Henüz dava bulunmuyor." hint="Yeni bir dava oluşturarak başlayın." />
      )}

      {!loading && !error && cases.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs text-navy-500">
              <tr>
                <th className="px-4 py-3 font-medium">Dava No</th>
                <th className="px-4 py-3 font-medium">Dava Adı</th>
                <th className="px-4 py-3 font-medium">Müvekkil</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Sonraki Duruşma</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Önizle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} onClick={(event) => handleRowClick(event, c.id)} className="cursor-pointer border-t border-surface-border hover:bg-surface-muted">
                  <td className="px-4 py-3 text-navy-500">{c.case_number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/davalar/${c.id}`} className="font-medium text-navy-900 hover:text-accent-600">
                      {c.case_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{c.client_name}</td>
                  <td className="px-4 py-3">
                    <Link href={caseListHref({ ...query, kategori: c.case_type })} className="text-navy-700 hover:text-accent-700 hover:underline">
                      {CASE_TYPE_LABELS[c.case_type] ?? c.case_type}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={caseListHref({ ...query, durum: c.status })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium hover:ring-1 hover:ring-accent-300 ${
                        STATUS_BADGE_STYLES[c.status] ?? "bg-surface-muted text-navy-600"
                      }`}
                    >
                      {CASE_STATUS_LABELS[c.status] ?? c.status}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{c.next_hearing_date ? formatDate(c.next_hearing_date) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={quickViewHref(c.id)}
                      scroll={false}
                      aria-label={`${c.case_name} önizle`}
                      className="rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-navy-600 hover:border-accent-400 hover:text-accent-700"
                    >
                      Önizle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseListView.test.tsx`
Expected: all PASS (including the original 5).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CaseListView.tsx frontend/src/components/__tests__/CaseListView.test.tsx
git commit -m "feat(web): URL-driven case list filters, chips and row preview"
```

---

### Task 11: Görevler — filter cards, overdue, preview links

**Files:**
- Modify (full replacement): `frontend/src/components/TasksView.tsx`
- Test: `frontend/src/components/__tests__/TasksView.test.tsx`

**Interfaces:**
- Consumes: `parseTaskListQuery`, `filterTasks`, `sortTasks`, `isOverdue`, `isDueWithinWeek`, `describeTaskListQuery`, `TASK_LIST_PARAM_KEYS` (Task 6); `useUrlParams`, `useQuickViewHref`; `FilterChips`, `NoFilterResults`.
- Produces: `/gorevler?durum=&vade=&dava=`; task title links open the preview with `odak=gorev:<id>`.

- [ ] **Step 1: Write the failing tests** — in `TasksView.test.tsx`:

Add after the testing-library imports:

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
```

In `beforeEach` add `resetNav(); setUrl("/gorevler");` first.

Add fixtures after `pendingTask`:

```tsx
const overdueTask = { ...pendingTask, id: "t-old", title: "Gecikmiş dilekçe", due_date: "2000-01-01" };
const futureTask = { ...pendingTask, id: "t-new", title: "Uzak görev", due_date: "2999-01-01" };
const doneTask = { ...pendingTask, id: "t-done", title: "Biten görev", status: "completed", due_date: "2000-01-02" };
```

Append inside `describe("TasksView", ...)`:

```tsx
  it("filters by ?vade=gecikmis and lists overdue first by default", async () => {
    listAllTasks.mockResolvedValue([futureTask, overdueTask, doneTask]);

    const { unmount } = render(<TasksView />);
    await screen.findByText("Gecikmiş dilekçe");
    const titles = screen.getAllByTestId("task-title").map((el) => el.textContent);
    expect(titles[0]).toBe("Gecikmiş dilekçe");
    unmount();

    setUrl("/gorevler?vade=gecikmis");
    render(<TasksView />);
    await screen.findByText("Gecikmiş dilekçe");
    expect(screen.queryByText("Uzak görev")).not.toBeInTheDocument();
    expect(screen.queryByText("Biten görev")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Aktif filtreler")).getByText("Gecikmiş")).toBeInTheDocument();
  });

  it("filters by ?durum=tamamlanan", async () => {
    setUrl("/gorevler?durum=tamamlanan");
    listAllTasks.mockResolvedValue([futureTask, doneTask]);
    render(<TasksView />);
    await screen.findByText("Biten görev");
    expect(screen.queryByText("Uzak görev")).not.toBeInTheDocument();
  });

  it("turns the summary cards into toggling filter links", async () => {
    listAllTasks.mockResolvedValue([overdueTask]);
    const { unmount } = render(<TasksView />);
    expect(await screen.findByRole("link", { name: /Gecikmiş\s*1/ })).toHaveAttribute("href", "/gorevler?vade=gecikmis");
    unmount();

    setUrl("/gorevler?vade=gecikmis");
    render(<TasksView />);
    expect(await screen.findByRole("link", { name: /Gecikmiş\s*1/ })).toHaveAttribute("href", "/gorevler");
  });

  it("links the title to the preview and the case name to the case filter", async () => {
    listAllTasks.mockResolvedValue([pendingTask]);
    render(<TasksView />);
    await screen.findByText("Bilirkişi raporunu incele");

    expect(screen.getByRole("link", { name: "Bilirkişi raporunu incele" })).toHaveAttribute("href", "/gorevler?onizle=c1&odak=gorev%3At1");
    expect(screen.getByRole("link", { name: "2026/1 - Sözleşmenin Feshi Davası" })).toHaveAttribute("href", "/gorevler?dava=c1");
  });

  it("does not navigate when the checkbox is toggled", async () => {
    listAllTasks.mockResolvedValue([pendingTask]);
    updateTaskStatus.mockResolvedValue({ ...pendingTask, status: "completed" });
    render(<TasksView />);
    await userEvent.click(await screen.findByRole("checkbox"));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("shows the filtered empty state", async () => {
    setUrl("/gorevler?vade=gecikmis");
    listAllTasks.mockResolvedValue([futureTask]);
    render(<TasksView />);
    expect(await screen.findByText("Bu filtrelere uyan kayıt yok.")).toBeInTheDocument();
  });
```

Add `within` to the `@testing-library/react` import in this file.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/TasksView.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Replace `frontend/src/components/TasksView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { listAllTasks, updateTaskStatus } from "@/lib/api";
import {
  TASK_LIST_PARAM_KEYS,
  describeTaskListQuery,
  filterTasks,
  isDueWithinWeek,
  isOverdue,
  parseTaskListQuery,
  sortTasks,
  type TaskListQuery,
} from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { TaskWithCase } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

type Tone = "navy" | "emerald" | "amber" | "red";
const TONE_TEXT: Record<Tone, string> = {
  navy: "text-navy-900",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

export function TasksView() {
  const { params, hrefWith, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const query = useMemo(() => parseTaskListQuery(params), [params]);

  const [tasks, setTasks] = useState<TaskWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllTasks()
      .then(setTasks)
      .catch(() => setError("Görevler yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(task: TaskWithCase) {
    setToggleError(null);
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const updated = await updateTaskStatus(task.case_id, task.id, nextStatus);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    } catch {
      setToggleError("Görev güncellenemedi. Lütfen tekrar deneyin.");
    }
  }

  function clearFilters() {
    setParams(Object.fromEntries(TASK_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const today = new Date();
  const visible = sortTasks(filterTasks(tasks, query, today), today);
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const pendingCount = tasks.length - completedCount;
  const dueSoonCount = tasks.filter((task) => isDueWithinWeek(task, today)).length;
  const overdueCount = tasks.filter((task) => isOverdue(task, today)).length;
  const chips = describeTaskListQuery(query, (caseId) => tasks.find((t) => t.case_id === caseId)?.case_name);

  function toggleHref<K extends keyof TaskListQuery>(key: K, value: NonNullable<TaskListQuery[K]>) {
    return hrefWith({ [key]: query[key] === value ? null : value });
  }

  const cards: Array<{ label: string; value: number; tone: Tone; href: string; active: boolean }> = [
    { label: "Açık görev", value: pendingCount, tone: "navy", href: toggleHref("durum", "acik"), active: query.durum === "acik" },
    { label: "Tamamlanan", value: completedCount, tone: "emerald", href: toggleHref("durum", "tamamlanan"), active: query.durum === "tamamlanan" },
    { label: "7 gün içinde", value: dueSoonCount, tone: "amber", href: toggleHref("vade", "7gun"), active: query.vade === "7gun" },
    { label: "Gecikmiş", value: overdueCount, tone: "red", href: toggleHref("vade", "gecikmis"), active: query.vade === "gecikmis" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Görevler</h1>
        <p className="text-sm text-navy-500">Büronuzun tüm davalarındaki görevleri tek yerden takip edin.</p>
      </div>

      {toggleError && <ErrorState message={toggleError} />}

      {tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              replace
              scroll={false}
              aria-current={card.active ? "true" : undefined}
              className={`rounded-xl border bg-white p-4 shadow-card transition hover:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                card.active ? "border-accent-500 ring-2 ring-accent-200" : "border-surface-border"
              }`}
            >
              <p className="text-xs text-navy-500">{card.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${TONE_TEXT[card.tone]}`}>{card.value}</p>
            </Link>
          ))}
        </div>
      )}

      <FilterChips chips={chips} onRemove={(key) => setParams({ [key]: null })} onClear={clearFilters} resultCount={visible.length} />

      {tasks.length === 0 ? (
        <EmptyState message="Henüz görev yok." hint="Görevler bir davanın Görevler sekmesinden eklenir." />
      ) : visible.length === 0 ? (
        <NoFilterResults onClear={clearFilters} />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border text-sm">
            {visible.map((task) => {
              const completed = task.status === "completed";
              const overdue = isOverdue(task, today);
              return (
                <li key={task.id} className="flex items-center gap-3 p-4 transition hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={() => handleToggle(task)}
                    className="h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400"
                    aria-label={`${task.title} tamamlandı olarak işaretle`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={quickViewHref(task.case_id, { type: "gorev", id: task.id })}
                      scroll={false}
                      data-testid="task-title"
                      className={`block truncate hover:text-accent-700 ${completed ? "text-navy-400 line-through" : "text-navy-800"}`}
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-navy-500">
                      <Link href={hrefWith({ dava: task.case_id })} replace scroll={false} className="hover:text-accent-700 hover:underline">
                        {task.case_number} - {task.case_name}
                      </Link>
                      {task.due_date && (
                        <span className={overdue ? "font-medium text-red-600" : ""}>
                          {" "}
                          - Son tarih: {formatDate(task.due_date)}
                          {overdue ? " (gecikmiş)" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/TasksView.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TasksView.tsx frontend/src/components/__tests__/TasksView.test.tsx
git commit -m "feat(web): task filter cards, overdue view and preview links"
```

---

### Task 12: Belgeler — filters, preview links, download

**Files:**
- Modify (full replacement): `frontend/src/components/DocumentsView.tsx`
- Test: `frontend/src/components/__tests__/DocumentsView.test.tsx`

**Interfaces:**
- Consumes: `parseDocumentListQuery`, `filterDocuments`, `describeDocumentListQuery`, `DOCUMENT_LIST_PARAM_KEYS` (Task 6); `downloadDocument` (Task 6); `saveBlob` (Task 6); `useUrlParams`, `useQuickViewHref`; `FilterChips`, `NoFilterResults`.
- Produces: `/belgeler?ara=&tur=&dava=`; per-row "İndir" button (accessible name `"<filename> indir"`).

- [ ] **Step 1: Write the failing tests** — in `DocumentsView.test.tsx`:

Add `import userEvent from "@testing-library/user-event";` and, after the imports:

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";
```

Change the api mock to:

```tsx
const listAllDocuments = vi.fn();
const downloadDocument = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllDocuments: (...args: unknown[]) => listAllDocuments(...args),
  downloadDocument: (...args: unknown[]) => downloadDocument(...args),
}));
```

In `beforeEach` add:

```tsx
  resetNav();
  setUrl("/belgeler");
  downloadDocument.mockReset();
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
```

Add a second fixture after `doc`:

```tsx
const txtDoc = { ...doc, id: "d2", case_id: "c2", case_name: "Kiracı Tahliye Davası", case_number: "2026/2", filename: "notlar.txt", file_type: "txt" };
```

Append tests:

```tsx
  it("filters by ?tur= and ?dava= from the URL", async () => {
    setUrl("/belgeler?tur=txt");
    listAllDocuments.mockResolvedValue([doc, txtDoc]);
    const { unmount } = render(<DocumentsView />);
    await screen.findByText("notlar.txt");
    expect(screen.queryByText("sozlesme.pdf")).not.toBeInTheDocument();
    unmount();

    setUrl("/belgeler?dava=c1");
    render(<DocumentsView />);
    await screen.findByText("sozlesme.pdf");
    expect(screen.queryByText("notlar.txt")).not.toBeInTheDocument();
    expect(screen.getByText("Dava: Sözleşmenin Feshi Davası")).toBeInTheDocument();
  });

  it("links the filename to the preview and the case to the case filter", async () => {
    listAllDocuments.mockResolvedValue([doc]);
    render(<DocumentsView />);
    await screen.findByText("sozlesme.pdf");

    expect(screen.getByRole("link", { name: "sozlesme.pdf" })).toHaveAttribute("href", "/belgeler?onizle=c1&odak=belge%3Ad1");
    expect(screen.getByRole("link", { name: "2026/1 - Sözleşmenin Feshi Davası" })).toHaveAttribute("href", "/belgeler?dava=c1");
  });

  it("downloads a document", async () => {
    listAllDocuments.mockResolvedValue([doc]);
    downloadDocument.mockResolvedValue(new Blob(["x"]));
    render(<DocumentsView />);

    await userEvent.click(await screen.findByRole("button", { name: "sozlesme.pdf indir" }));

    await waitFor(() => expect(downloadDocument).toHaveBeenCalledWith("d1"));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it("shows an error when the download fails", async () => {
    listAllDocuments.mockResolvedValue([doc]);
    downloadDocument.mockRejectedValue(new Error("boom"));
    render(<DocumentsView />);

    await userEvent.click(await screen.findByRole("button", { name: "sozlesme.pdf indir" }));

    expect(await screen.findByText(/belge indirilemedi/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/DocumentsView.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Replace `frontend/src/components/DocumentsView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { downloadDocument, listAllDocuments } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { DOCUMENT_LIST_PARAM_KEYS, describeDocumentListQuery, filterDocuments, parseDocumentListQuery } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { DocumentWithCase } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

const CONTROL = "rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";

export function DocumentsView() {
  const { params, hrefWith, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const urlQuery = useMemo(() => parseDocumentListQuery(params), [params]);

  const [documents, setDocuments] = useState<DocumentWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local mirror of ?ara= so typing filters instantly; the URL is updated for persistence.
  const [search, setSearch] = useState(urlQuery.ara ?? "");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllDocuments()
      .then(setDocuments)
      .catch(() => setError("Belgeler yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(doc: DocumentWithCase) {
    setDownloadingId(doc.id);
    setDownloadError(null);
    try {
      saveBlob(await downloadDocument(doc.id), doc.filename);
    } catch {
      setDownloadError("Belge indirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setDownloadingId(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setParams(Object.fromEntries(DOCUMENT_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  function removeFilter(key: string) {
    if (key === "ara") setSearch("");
    setParams({ [key]: null });
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const query = { ...urlQuery, ara: search.trim() || undefined };
  const visible = filterDocuments(documents, query);
  const chips = describeDocumentListQuery(query, (caseId) => documents.find((d) => d.case_id === caseId)?.case_name);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-navy-900">Belgeler</h1>
          {documents.length > 0 && (
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">{documents.length} belge</span>
          )}
        </div>
        <p className="text-sm text-navy-500">Tüm davalardaki belgelere buradan erişin. Belge yükleme dava detay sayfasından yapılır.</p>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Belge ara"
            placeholder="Dosya adı ara..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setParams({ ara: event.target.value.trim() || null });
            }}
            className={`w-full max-w-sm ${CONTROL}`}
          />
          <select aria-label="Tür filtresi" value={urlQuery.tur ?? ""} onChange={(e) => setParams({ tur: e.target.value || null })} className={CONTROL}>
            <option value="">Tüm türler</option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="txt">TXT</option>
          </select>
        </div>
      )}

      <FilterChips chips={chips} onRemove={removeFilter} onClear={clearFilters} resultCount={visible.length} />
      {downloadError && <ErrorState message={downloadError} />}

      {documents.length === 0 ? (
        <EmptyState message="Henüz belge yok." hint="Belgeler bir davanın Belgeler sekmesinden yüklenir." />
      ) : visible.length === 0 ? (
        <NoFilterResults onClear={clearFilters} />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border text-sm">
            {visible.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-4 p-4 transition hover:bg-surface-muted">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-[10px] font-bold uppercase text-accent-700">
                    {doc.file_type}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={quickViewHref(doc.case_id, { type: "belge", id: doc.id })}
                      scroll={false}
                      className="font-medium text-navy-800 hover:text-accent-700"
                    >
                      {doc.filename}
                    </Link>
                    <p className="text-xs text-navy-500">
                      <Link href={hrefWith({ dava: doc.case_id })} replace scroll={false} className="hover:text-accent-700 hover:underline">
                        {doc.case_number} - {doc.case_name}
                      </Link>
                    </p>
                    {doc.extracted_text && <p className="mt-1 max-w-2xl truncate text-xs text-navy-400">{doc.extracted_text}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-navy-400">{formatDate(doc.uploaded_at)}</span>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    aria-label={`${doc.filename} indir`}
                    className="rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-navy-700 hover:border-accent-400 hover:text-accent-700 disabled:opacity-60"
                  >
                    {downloadingId === doc.id ? "İndiriliyor..." : "İndir"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/DocumentsView.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DocumentsView.tsx frontend/src/components/__tests__/DocumentsView.test.tsx
git commit -m "feat(web): document filters, preview links and download"
```

---

### Task 13: Dashboard — clickable cards, charts, hearings and activity

**Files:**
- Modify (full replacement): `frontend/src/components/DashboardView.tsx`
- Test: `frontend/src/components/__tests__/DashboardView.test.tsx`

**Interfaces:**
- Consumes: `analyticsCaseListHref`, `caseListHref`, `UPCOMING_HEARING_DAYS`, `daysUntil` (Task 6); `useQuickViewHref`; `StatCard` href, `ChartLegendLinks` (Task 9); `AnalyticsOverview.by_status` (Tasks 2, 6).
- Produces: category legend with `aria-label="Dava dağılımı kategorileri"` (used by the E2E test in Task 17).

- [ ] **Step 1: Write the failing tests** — in `DashboardView.test.tsx`:

Add after the testing-library import:

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";
```

Add `by_status` to the `overview` fixture:

```tsx
  by_status: [
    { status: "devam_eden", total: 7 },
    { status: "kapali", total: 3 },
  ],
```

In `beforeEach` add `resetNav(); setUrl("/dashboard");` first.

Append tests:

```tsx
  it("fetches upcoming hearings with the 30-day window", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);
    await waitFor(() => expect(getCases).toHaveBeenCalledWith({ hearing_within_days: 30 }));
  });

  it("links stat cards to analytics-consistent filtered lists", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: /Aktif Davalar/ })).toHaveAttribute("href", "/davalar?durum=aktif&arsiv=dahil");
    expect(screen.getByRole("link", { name: /Toplam Davalar/ })).toHaveAttribute("href", "/davalar?arsiv=dahil");
    expect(screen.getByRole("link", { name: /Kazanılan Davalar/ })).toHaveAttribute("href", "/davalar?sonuc=kazanilan&arsiv=dahil");
    expect(screen.getByRole("link", { name: /Kaybedilen Davalar/ })).toHaveAttribute("href", "/davalar?sonuc=kaybedilen&arsiv=dahil");
    expect(screen.getByRole("link", { name: /Kazanma Oranı/ })).toHaveAttribute("href", "/analitik");
  });

  it("gives every chart mark a legend link", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: "İş Hukuku · 20" })).toHaveAttribute("href", "/davalar?kategori=is_hukuku&arsiv=dahil");
    expect(screen.getByRole("link", { name: "Devam Eden · 7" })).toHaveAttribute("href", "/davalar?durum=devam_eden&arsiv=dahil");
    expect(screen.getByRole("list", { name: "Dava dağılımı kategorileri" })).toBeInTheDocument();
  });

  it("opens the preview from hearings and activity", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([
      { id: "c1", case_name: "Ticari Kira Uyarlama Davası", court: null, next_hearing_date: "2999-01-01", status: "durusma_bekleyen" },
    ]);
    getRecentActivity.mockResolvedValue([
      { id: "e1", case_id: "c2", case_name: "Sözleşmenin Feshi Davası", title: "Dava açıldı", event_type: "filing", event_date: "2026-01-12", created_at: "2026-01-12" },
    ]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: "Ticari Kira Uyarlama Davası" })).toHaveAttribute("href", "/dashboard?onizle=c1");
    expect(screen.getByRole("link", { name: /Dava açıldı/ })).toHaveAttribute("href", "/dashboard?onizle=c2&odak=olay%3Ae1");
    expect(screen.getByRole("link", { name: "Tümü →" })).toHaveAttribute("href", "/davalar?durusma=yaklasan");
    expect(screen.getByText("—")).toBeInTheDocument(); // missing court
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/DashboardView.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Replace `frontend/src/components/DashboardView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getAnalyticsOverview, getCases, getRecentActivity } from "@/lib/api";
import { UPCOMING_HEARING_DAYS, analyticsCaseListHref, caseListHref, daysUntil } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { useQuickViewHref } from "@/lib/urlState";
import type { ActivityItem, AnalyticsOverview, Case } from "@/types";
import { ChartLegendLinks } from "@/components/ChartLegendLinks";
import { StatCard } from "@/components/StatCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

const CHART_COLORS = ["#6d43f5", "#8b6bff", "#ac96ff", "#cfc4ff", "#4a25b3", "#2f1a6e"];

function hrefFromChartEvent(data: unknown): string | undefined {
  return (data as { payload?: { href?: string } } | undefined)?.payload?.href;
}

export function DashboardView() {
  const router = useRouter();
  const quickViewHref = useQuickViewHref();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getAnalyticsOverview(), getCases({ hearing_within_days: UPCOMING_HEARING_DAYS }), getRecentActivity()])
      .then(([overviewResult, casesResult, activityResult]) => {
        if (cancelled) return;
        setActivity(activityResult);
        setOverview(overviewResult);
        setCases(casesResult);
      })
      .catch(() => {
        if (!cancelled) setError("Veriler yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState label="Dashboard yükleniyor..." />;
  if (error) return <ErrorState message={error} />;
  if (!overview) return null;

  const upcomingHearings = cases
    .filter((c) => c.next_hearing_date)
    .sort((a, b) => (a.next_hearing_date! < b.next_hearing_date! ? -1 : 1))
    .slice(0, 6);

  const categoryData = overview.by_category.map((row) => ({
    key: row.case_type,
    name: CASE_TYPE_LABELS[row.case_type] ?? row.case_type,
    total: row.total,
    href: analyticsCaseListHref({ kategori: row.case_type }),
  }));

  const statusData = (overview.by_status ?? []).map((row, index) => ({
    key: row.status,
    name: CASE_STATUS_LABELS[row.status] ?? row.status,
    value: row.total,
    href: analyticsCaseListHref({ durum: row.status }),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  function openFromChart(data: unknown) {
    const href = hrefFromChartEvent(data);
    if (href) router.push(href);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Dashboard</h1>
        <p className="text-sm text-navy-500">Bürünüzün genel durumuna hızlı bir bakış.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Aktif Davalar" value={overview.active_cases} href={analyticsCaseListHref({ durum: "aktif" })} />
        <StatCard label="Toplam Davalar" value={overview.total_cases} href={analyticsCaseListHref()} />
        <StatCard label="Kazanılan Davalar" value={overview.won_cases} href={analyticsCaseListHref({ sonuc: "kazanilan" })} />
        <StatCard label="Kaybedilen Davalar" value={overview.lost_cases} href={analyticsCaseListHref({ sonuc: "kaybedilen" })} />
        <StatCard label="Kazanma Oranı" value={`%${overview.win_rate}`} accent href="/analitik" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Dava Dağılımı</p>
          {categoryData.length === 0 ? (
            <EmptyState message="Henüz kategori verisi yok." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#3d5170" />
                  <Tooltip cursor={{ fill: "#f1eeff" }} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#6d43f5" cursor="pointer" onClick={openFromChart} />
                </BarChart>
              </ResponsiveContainer>
              <ChartLegendLinks
                ariaLabel="Dava dağılımı kategorileri"
                items={categoryData.map((row) => ({ key: row.key, label: row.name, value: row.total, href: row.href }))}
              />
            </>
          )}
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Dava Durumu Dağılımı</p>
          {statusData.length === 0 ? (
            <EmptyState message="Henüz durum verisi yok." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} cursor="pointer" onClick={openFromChart}>
                    {statusData.map((row) => (
                      <Cell key={row.key} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ChartLegendLinks
                ariaLabel="Dava durumları"
                items={statusData.map((row) => ({ key: row.key, label: row.name, value: row.value, href: row.href, color: row.color }))}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-navy-700">Yaklaşan Duruşmalar</p>
            <Link href={caseListHref({ durusma: "yaklasan" })} className="text-xs font-medium text-accent-700 hover:text-accent-800">
              Tümü →
            </Link>
          </div>
          {upcomingHearings.length === 0 ? (
            <EmptyState message="Yaklaşan duruşma bulunmuyor." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-navy-500">
                  <th className="pb-2 font-medium">Dava</th>
                  <th className="pb-2 font-medium">Mahkeme</th>
                  <th className="pb-2 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {upcomingHearings.map((c) => {
                  const days = daysUntil(c.next_hearing_date!);
                  return (
                    <tr
                      key={c.id}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a")) return;
                        router.push(quickViewHref(c.id), { scroll: false });
                      }}
                      className="cursor-pointer border-t border-surface-border hover:bg-surface-muted"
                    >
                      <td className="py-2">
                        <Link href={quickViewHref(c.id)} scroll={false} className="text-navy-800 hover:text-accent-700">
                          {c.case_name}
                        </Link>
                      </td>
                      <td className="py-2 text-navy-600">{c.court || "—"}</td>
                      <td className="py-2 text-navy-600">
                        {formatDate(c.next_hearing_date)}
                        {days <= 7 && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Bu hafta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <p className="mb-4 text-sm font-medium text-navy-700">Son Gelişmeler</p>
          {activity.length === 0 ? (
            <EmptyState message="Henüz gelişme yok." />
          ) : (
            <ul className="space-y-1 text-sm">
              {activity.map((item) => (
                <li key={item.id}>
                  <Link
                    href={quickViewHref(item.case_id, { type: "olay", id: item.id })}
                    scroll={false}
                    className="flex items-start justify-between gap-3 rounded-lg p-2 hover:bg-surface-muted"
                  >
                    <div>
                      <p className="font-medium text-navy-800">{item.title}</p>
                      <p className="text-xs text-navy-500">{item.case_name}</p>
                    </div>
                    <span className="shrink-0 text-xs text-navy-400">{formatDate(item.event_date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/DashboardView.test.tsx`
Expected: all PASS. (The existing "renders upcoming hearings" fixture uses `2026-09-20`; it still renders because the backend, not the client, applies the window.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardView.tsx frontend/src/components/__tests__/DashboardView.test.tsx
git commit -m "feat(web): clickable dashboard cards, charts, hearings and activity"
```

---

### Task 14: Takvim — event links, "+n daha", month and type in URL

**Files:**
- Modify (full replacement): `frontend/src/components/CalendarView.tsx`
- Test: `frontend/src/components/__tests__/CalendarView.test.tsx`

**Interfaces:**
- Consumes: `parseCalendarQuery`, `CalendarQuery` (Task 6); `useUrlParams`, `useQuickViewHref`; `CalendarEvent.task_id` (Tasks 3, 6).
- Produces: `/takvim?ay=YYYY-MM&goster=durusma|gorev`; event chips are preview links.

- [ ] **Step 1: Write the failing tests** — in `CalendarView.test.tsx`:

Add after the imports (and add `within` to the testing-library import):

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
```

Add `task_id: null` to `hearingEvent` and `task_id: "t9"` to `taskEvent`. In `beforeEach` add `resetNav(); setUrl("/takvim");` first.

Append tests:

```tsx
  it("opens the month given in ?ay= and links events to the preview", async () => {
    setUrl("/takvim?ay=2026-10");
    getCalendarEvents.mockResolvedValue([hearingEvent, { ...taskEvent, date: "2026-10-06" }]);
    render(<CalendarView />);

    expect(await screen.findByText("Ekim 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Duruşma - Sözleşmenin Feshi Davası/ })).toHaveAttribute("href", "/takvim?ay=2026-10&onizle=c1");
    expect(screen.getByRole("link", { name: /Dilekçe hazırla/ })).toHaveAttribute("href", "/takvim?ay=2026-10&onizle=c2&odak=gorev%3At9");
  });

  it("writes month changes to the URL", async () => {
    setUrl("/takvim?ay=2026-10");
    getCalendarEvents.mockResolvedValue([]);
    render(<CalendarView />);
    await userEvent.click(await screen.findByRole("button", { name: "Sonraki ay" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/takvim?ay=2026-11", { scroll: false });
  });

  it("collapses busy days behind a '+n daha' popover", async () => {
    setUrl("/takvim?ay=2026-10");
    const busy = [1, 2, 3, 4, 5].map((n) => ({ ...taskEvent, date: "2026-10-15", title: `Görev ${n}`, task_id: `t${n}` }));
    getCalendarEvents.mockResolvedValue(busy);
    render(<CalendarView />);

    await screen.findByText("Görev 1");
    expect(screen.queryByText("Görev 4")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+2 daha" }));

    const popover = screen.getByRole("dialog", { name: "15 Ekim olayları" });
    expect(within(popover).getAllByRole("link")).toHaveLength(5);
  });

  it("filters by event type from ?goster=", async () => {
    setUrl("/takvim?ay=2026-10&goster=durusma");
    getCalendarEvents.mockResolvedValue([hearingEvent, { ...taskEvent, date: "2026-10-06" }]);
    render(<CalendarView />);

    await screen.findByText(/Duruşma - Sözleşmenin Feshi Davası/);
    expect(screen.queryByText("Dilekçe hazırla")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duruşma/, pressed: true })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarView.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Replace `frontend/src/components/CalendarView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCalendarEvents } from "@/lib/api";
import { parseCalendarQuery, type CalendarQuery } from "@/lib/filters";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { CalendarEvent } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MAX_EVENTS_PER_DAY = 3;

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(key: string | undefined): Date | null {
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function currentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function CalendarView() {
  const { params, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromKey(parseCalendarQuery(params).ay) ?? currentMonthStart());
  const [show, setShow] = useState<CalendarQuery["goster"]>(() => parseCalendarQuery(params).goster);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCalendarEvents()
      .then(setEvents)
      .catch(() => setError("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const shownEvents = useMemo(
    () => events.filter((event) => !show || (show === "durusma" ? event.event_type === "hearing" : event.event_type === "task")),
    [events, show],
  );

  const eventsByDate = useMemo(() => {
    return shownEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      (acc[event.date] ??= []).push(event);
      return acc;
    }, {});
  }, [shownEvents]);

  const calendarCells = useMemo(() => {
    const leadingEmptyCells = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [
      ...Array.from({ length: leadingEmptyCells }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month, year]);

  const monthPrefix = monthKey(visibleMonth);
  const monthEvents = events.filter((event) => event.date.startsWith(monthPrefix));
  const hearingCount = monthEvents.filter((event) => event.event_type === "hearing").length;
  const taskCount = monthEvents.filter((event) => event.event_type === "task").length;

  function goToMonth(next: Date, writeToUrl: string | null) {
    setVisibleMonth(next);
    setOpenDay(null);
    setParams({ ay: writeToUrl });
  }

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    goToMonth(next, monthKey(next));
  }

  function goToToday() {
    goToMonth(currentMonthStart(), null);
  }

  function toggleShow(kind: NonNullable<CalendarQuery["goster"]>) {
    const next = show === kind ? undefined : kind;
    setShow(next);
    setParams({ goster: next ?? null });
  }

  function eventHref(event: CalendarEvent) {
    return quickViewHref(event.case_id, event.task_id ? { type: "gorev", id: event.task_id } : undefined);
  }

  function renderEvent(event: CalendarEvent, key: string) {
    const hearing = event.event_type === "hearing";
    return (
      <Link
        key={key}
        href={eventHref(event)}
        scroll={false}
        title={`${event.title} — ${event.case_name}`}
        className={`block rounded-md border-l-2 px-2 py-1.5 text-[11px] leading-4 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
          hearing ? "border-red-500 bg-red-50 text-red-800" : "border-accent-500 bg-accent-50 text-accent-800"
        }`}
      >
        <p className="font-semibold">{event.title}</p>
        <p className="truncate opacity-70">{event.case_name}</p>
      </Link>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Takvim</h1>
          <p className="text-sm text-navy-500">Duruşma ve görev tarihlerinizi aylık görünümde takip edin.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-navy-600">
          <button
            type="button"
            aria-pressed={show === "durusma"}
            onClick={() => toggleShow("durusma")}
            className={`flex items-center gap-2 rounded-full px-2.5 py-1 transition ${
              show === "durusma" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "hover:bg-surface-muted"
            } ${show === "gorev" ? "opacity-50" : ""}`}
          >
            <i className="h-2.5 w-2.5 rounded-full bg-red-500" /> Duruşma
          </button>
          <button
            type="button"
            aria-pressed={show === "gorev"}
            onClick={() => toggleShow("gorev")}
            className={`flex items-center gap-2 rounded-full px-2.5 py-1 transition ${
              show === "gorev" ? "bg-accent-50 text-accent-800 ring-1 ring-accent-200" : "hover:bg-surface-muted"
            } ${show === "durusma" ? "opacity-50" : ""}`}
          >
            <i className="h-2.5 w-2.5 rounded-full bg-accent-500" /> Görev
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-col justify-between gap-3 border-b border-surface-border px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-navy-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <p className="mt-0.5 text-xs text-navy-500">
              Bu ay {hearingCount} duruşma ve {taskCount} görev bulunuyor.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Önceki ay"
              className="grid h-9 w-9 place-items-center rounded-lg border border-surface-border text-lg text-navy-600 transition hover:bg-surface-muted"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="h-9 rounded-lg border border-surface-border px-4 text-xs font-medium text-navy-700 transition hover:bg-surface-muted"
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Sonraki ay"
              className="grid h-9 w-9 place-items-center rounded-lg border border-surface-border text-lg text-navy-600 transition hover:bg-surface-muted"
            >
              ›
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7 border-b border-surface-border bg-surface-muted/60">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-navy-500">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarCells.map((day, index) => {
                const key = day ? dateKey(year, month, day) : `empty-${index}`;
                const dayEvents = day ? eventsByDate[key] ?? [] : [];
                const hiddenCount = dayEvents.length - MAX_EVENTS_PER_DAY;
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={`relative min-h-32 border-b border-r border-surface-border p-2.5 ${day ? "bg-white" : "bg-surface-muted/35"}`}
                  >
                    {day && (
                      <>
                        <span
                          className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-medium ${
                            isToday ? "bg-accent-600 text-white" : "text-navy-600"
                          }`}
                        >
                          {day}
                        </span>
                        <div className="space-y-1.5">
                          {dayEvents
                            .slice(0, MAX_EVENTS_PER_DAY)
                            .map((event, eventIndex) => renderEvent(event, `${event.event_type}-${event.task_id ?? event.case_id}-${eventIndex}`))}
                          {hiddenCount > 0 && (
                            <button
                              type="button"
                              aria-expanded={openDay === key}
                              onClick={() => setOpenDay((current) => (current === key ? null : key))}
                              className="w-full rounded-md px-2 py-1 text-left text-[11px] font-medium text-navy-600 hover:bg-surface-muted"
                            >
                              +{hiddenCount} daha
                            </button>
                          )}
                        </div>
                        {openDay === key && (
                          <div
                            role="dialog"
                            aria-label={`${day} ${MONTH_NAMES[month]} olayları`}
                            className="absolute left-1 top-10 z-20 w-64 space-y-1.5 rounded-xl border border-surface-border bg-white p-3 shadow-xl"
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-semibold text-navy-800">
                                {day} {MONTH_NAMES[month]}
                              </p>
                              <button type="button" aria-label="Kapat" onClick={() => setOpenDay(null)} className="text-navy-400 hover:text-navy-700">
                                ✕
                              </button>
                            </div>
                            {dayEvents.map((event, eventIndex) => renderEvent(event, `popover-${event.event_type}-${event.task_id ?? event.case_id}-${eventIndex}`))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {events.length === 0 && (
          <p className="border-t border-surface-border px-5 py-4 text-center text-sm text-navy-500">
            Takvimde henüz yaklaşan tarih yok. Bir davaya duruşma veya görev tarihi ekleyebilirsiniz.
          </p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/CalendarView.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalendarView.tsx frontend/src/components/__tests__/CalendarView.test.tsx
git commit -m "feat(web): clickable calendar events, busy-day popover and URL month"
```

---

### Task 15: Analitik and Simülasyonlar links

**Files:**
- Modify (full replacement): `frontend/src/components/AnalyticsView.tsx`
- Modify: `frontend/src/components/SimulationsView.tsx` (analysis list, ~lines 170–178; imports)
- Test: `frontend/src/components/__tests__/AnalyticsView.test.tsx`, `frontend/src/components/__tests__/SimulationsView.test.tsx`

**Interfaces:**
- Consumes: `analyticsCaseListHref`, `caseDetailHref` (Task 6); `useQuickViewHref`; `StatCard` href, `ChartLegendLinks` (Task 9); `getCases` `outcome` filter (Tasks 1, 6).

- [ ] **Step 1: Write the failing tests**

In `AnalyticsView.test.tsx`: add after the imports

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";
```

add `resetNav(); setUrl("/analitik");` at the top of `beforeEach`, and add `by_status: []` to every overview fixture. Replace the whole test `"lists lost cases with a link to open each one"` with (filtering is now done by the backend, so the mock returns only lost cases):

```tsx
  it("lists lost cases with links to open or preview each one", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 2,
      active_cases: 0,
      won_cases: 1,
      lost_cases: 1,
      win_rate: 50,
      average_case_duration_days: 30,
      by_category: [],
      by_status: [],
    });
    getCases.mockResolvedValue([{ id: "c-lost-1", case_name: "Kaybedilen Dava", case_number: "2025/1", outcome: "lost" }]);

    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getByText("Kaybedilen Dava")).toBeInTheDocument());
    expect(getCases).toHaveBeenCalledWith({ outcome: "lost", include_archived: true });

    expect(screen.getByRole("link", { name: "Kaybedilen Dava" })).toHaveAttribute("href", "/davalar/c-lost-1");
    expect(screen.getByRole("link", { name: "Kaybedilen Dava önizle" })).toHaveAttribute("href", "/analitik?onizle=c-lost-1");
  });
```

Append:

```tsx
  it("links cards and category bars to filtered lists", async () => {
    getAnalyticsOverview.mockResolvedValue({
      total_cases: 10, active_cases: 4, won_cases: 3, lost_cases: 2, win_rate: 60, average_case_duration_days: 90,
      by_category: [{ case_type: "icra", total: 3, won: 1, lost: 1, win_rate: 50 }],
      by_status: [],
    });
    render(<AnalyticsView />);

    expect(await screen.findByRole("link", { name: /Kaybedilen/ })).toHaveAttribute("href", "/davalar?sonuc=kaybedilen&arsiv=dahil");
    expect(screen.queryByRole("link", { name: /Ort. Dava Süresi/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İcra · %50" })).toHaveAttribute("href", "/davalar?kategori=icra&arsiv=dahil");
  });
```

In `SimulationsView.test.tsx`: replace the existing `const push = vi.fn();` and `vi.mock("next/navigation", ...)` block with

```tsx
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
const push = nav.push;
```

add `resetNav(); setUrl("/simulasyonlar");` at the top of its `beforeEach` (create a `beforeEach` if the file has none), and append a test:

```tsx
  it("links case names in file analyses to the preview", async () => {
    listCourtroomScenarios.mockResolvedValue([]);
    listCourtroomSessions.mockResolvedValue([]);
    listAllSimulations.mockResolvedValue([sim]);
    render(<SimulationsView />);

    fireEvent.click(await screen.findByRole("button", { name: "Dosya analizleri" }));

    expect(screen.getByRole("link", { name: "2026/1 - Sözleşmenin Feshi Davası" })).toHaveAttribute("href", "/simulasyonlar?onizle=c1");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/AnalyticsView.test.tsx src/components/__tests__/SimulationsView.test.tsx`
Expected: new/changed tests FAIL.

- [ ] **Step 3: Replace `frontend/src/components/AnalyticsView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getAnalyticsOverview, getCases } from "@/lib/api";
import { analyticsCaseListHref, caseDetailHref } from "@/lib/filters";
import { CASE_TYPE_LABELS } from "@/lib/labels";
import { useQuickViewHref } from "@/lib/urlState";
import type { AnalyticsOverview, Case } from "@/types";
import { ChartLegendLinks } from "@/components/ChartLegendLinks";
import { StatCard } from "@/components/StatCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

export function AnalyticsView() {
  const router = useRouter();
  const quickViewHref = useQuickViewHref();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [lostCases, setLostCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAnalyticsOverview(), getCases({ outcome: "lost", include_archived: true })])
      .then(([overviewResult, lostResult]) => {
        if (cancelled) return;
        setOverview(overviewResult);
        setLostCases(lostResult);
      })
      .catch(() => {
        if (!cancelled) setError("Veriler yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState label="Analitik yükleniyor..." />;
  if (error) return <ErrorState message={error} />;
  if (!overview) return null;

  const categoryData = overview.by_category.map((row) => ({
    key: row.case_type,
    name: CASE_TYPE_LABELS[row.case_type] ?? row.case_type,
    "Kazanma Oranı": row.win_rate,
    href: analyticsCaseListHref({ kategori: row.case_type }),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Analitik</h1>
        <p className="text-sm text-navy-500">Büronuzun tarihsel performansı.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Toplam Dava" value={overview.total_cases} href={analyticsCaseListHref()} />
        <StatCard label="Aktif Dava" value={overview.active_cases} href={analyticsCaseListHref({ durum: "aktif" })} />
        <StatCard label="Kazanılan" value={overview.won_cases} href={analyticsCaseListHref({ sonuc: "kazanilan" })} />
        <StatCard label="Kaybedilen" value={overview.lost_cases} href={analyticsCaseListHref({ sonuc: "kaybedilen" })} />
        <StatCard label="Kazanma Oranı" value={`%${overview.win_rate}`} accent />
        <StatCard label="Ort. Dava Süresi (gün)" value={overview.average_case_duration_days} />
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-medium text-navy-700">Kategoriye Göre Başarı Oranı</p>
        {categoryData.length === 0 ? (
          <EmptyState message="Henüz yeterli veri yok." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ef" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#3d5170" />
                <YAxis tick={{ fontSize: 11 }} stroke="#3d5170" />
                <Tooltip cursor={{ fill: "#f1eeff" }} />
                <Bar
                  dataKey="Kazanma Oranı"
                  radius={[6, 6, 0, 0]}
                  fill="#6d43f5"
                  cursor="pointer"
                  onClick={(data: unknown) => {
                    const href = (data as { payload?: { href?: string } } | undefined)?.payload?.href;
                    if (href) router.push(href);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegendLinks
              ariaLabel="Kategoriler"
              items={categoryData.map((row) => ({ key: row.key, label: row.name, value: `%${row["Kazanma Oranı"]}`, href: row.href }))}
            />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-medium text-navy-700">Kaybedilen Davalar</p>
        {lostCases.length === 0 ? (
          <EmptyState message="Kaybedilen dava bulunmuyor." />
        ) : (
          <ul className="divide-y divide-surface-border text-sm">
            {lostCases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={caseDetailHref(c.id)} className="font-medium text-navy-900 hover:text-accent-600">
                  {c.case_name}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-navy-500">{c.case_number}</span>
                  <Link
                    href={quickViewHref(c.id)}
                    scroll={false}
                    aria-label={`${c.case_name} önizle`}
                    className="rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-navy-600 hover:border-accent-400 hover:text-accent-700"
                  >
                    Önizle
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

Note: "Kazanma Oranı" is intentionally **not** a link on the Analytics page itself (it would link to itself).

- [ ] **Step 4: Update `SimulationsView.tsx`** — add imports:

```tsx
import Link from "next/link";
import { useQuickViewHref } from "@/lib/urlState";
```

Inside `SimulationsView()`, after `const router = useRouter();` add `const quickViewHref = useQuickViewHref();`. Replace the analysis caption line

```tsx
              <p className="text-xs font-medium text-navy-500">{sim.case_number} - {sim.case_name} - {formatDate(sim.started_at)}</p>
```

with

```tsx
              <p className="text-xs font-medium text-navy-500">
                <Link href={quickViewHref(sim.case_id)} scroll={false} className="hover:text-accent-700 hover:underline">
                  {sim.case_number} - {sim.case_name}
                </Link>{" "}
                - {formatDate(sim.started_at)}
              </p>
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/AnalyticsView.test.tsx src/components/__tests__/SimulationsView.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AnalyticsView.tsx frontend/src/components/SimulationsView.tsx frontend/src/components/__tests__/AnalyticsView.test.tsx frontend/src/components/__tests__/SimulationsView.test.tsx
git commit -m "feat(web): clickable analytics and simulation case links"
```

---

### Task 16: Raporlar — live numbers, links and real CSVs

**Files:**
- Modify (full replacement): `frontend/src/components/ReportsView.tsx`
- Test (full replacement): `frontend/src/components/__tests__/ReportsView.test.tsx`

**Interfaces:**
- Consumes: `getReportSummary`, `downloadReportCsv` (Task 6); `saveBlob` (Task 6); `analyticsCaseListHref`, `caseListHref`, `taskListHref` (Task 6); `ReportKind`, `ReportSummary` (Task 6).

- [ ] **Step 1: Write the failing tests** — replace `frontend/src/components/__tests__/ReportsView.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadReportCsv = vi.fn();
const getReportSummary = vi.fn();

vi.mock("@/lib/api", () => ({
  downloadReportCsv: (...args: unknown[]) => downloadReportCsv(...args),
  getReportSummary: (...args: unknown[]) => getReportSummary(...args),
}));

import { ReportsView } from "@/components/ReportsView";

const summary = { total_cases: 20, upcoming_hearings_30d: 12, open_tasks: 9, win_rate: 62.5 };

beforeEach(() => {
  downloadReportCsv.mockReset();
  getReportSummary.mockReset();
  getReportSummary.mockResolvedValue(summary);
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
});

describe("ReportsView", () => {
  it("shows live numbers as links to the matching lists", async () => {
    render(<ReportsView />);

    expect(await screen.findByRole("link", { name: "20 dava kaydı" })).toHaveAttribute("href", "/davalar?arsiv=dahil");
    expect(screen.getByRole("link", { name: "12 yaklaşan duruşma (30 gün)" })).toHaveAttribute("href", "/davalar?durusma=yaklasan");
    expect(screen.getByRole("link", { name: "9 açık görev" })).toHaveAttribute("href", "/gorevler?durum=acik");
    expect(screen.getByRole("link", { name: "%62,5 kazanma oranı" })).toHaveAttribute("href", "/analitik");
    expect(screen.queryByText(/bugün güncellendi/i)).not.toBeInTheDocument();
  });

  it("downloads each report as a real CSV", async () => {
    downloadReportCsv.mockResolvedValue(new Blob(["a,b\n1,2"], { type: "text/csv" }));
    render(<ReportsView />);

    const buttons = await screen.findAllByRole("button", { name: /csv olarak indir/i });
    expect(buttons).toHaveLength(4);
    await userEvent.click(buttons[1]);

    await waitFor(() => expect(downloadReportCsv).toHaveBeenCalledWith("hearings"));
  });

  it("shows an error message when the download fails", async () => {
    downloadReportCsv.mockRejectedValue(new Error("boom"));
    render(<ReportsView />);

    await userEvent.click((await screen.findAllByRole("button", { name: /csv olarak indir/i }))[0]);

    await waitFor(() => expect(screen.getByText(/rapor indirilemedi/i)).toBeInTheDocument());
  });

  it("shows an em dash when the summary cannot be loaded", async () => {
    getReportSummary.mockRejectedValue(new Error("boom"));
    render(<ReportsView />);

    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(4));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/ReportsView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Replace `frontend/src/components/ReportsView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { downloadReportCsv, getReportSummary } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { analyticsCaseListHref, caseListHref, taskListHref } from "@/lib/filters";
import type { ReportKind, ReportSummary } from "@/types";
import { ErrorState } from "@/components/ErrorState";

interface ReportCard {
  id: ReportKind;
  icon: string;
  title: string;
  description: string;
  filename: string;
  detail: (summary: ReportSummary) => string;
  href: string;
}

const REPORTS: ReportCard[] = [
  {
    id: "cases",
    icon: "⚖",
    title: "Dava Listesi Raporu",
    description: "Tüm davaların numarası, tarafları, türü, durumu ve önemli tarihleri.",
    filename: "davalar.csv",
    detail: (s) => `${s.total_cases} dava kaydı`,
    href: analyticsCaseListHref(),
  },
  {
    id: "hearings",
    icon: "◫",
    title: "Duruşma Takvimi",
    description: "Önümüzdeki 30 gündeki duruşmaların tarih ve mahkeme bilgileri.",
    filename: "durusmalar.csv",
    detail: (s) => `${s.upcoming_hearings_30d} yaklaşan duruşma (30 gün)`,
    href: caseListHref({ durusma: "yaklasan" }),
  },
  {
    id: "tasks",
    icon: "✓",
    title: "Görev Durumu Raporu",
    description: "Tüm görevlerin dava, son tarih ve durum bilgileri.",
    filename: "gorevler.csv",
    detail: (s) => `${s.open_tasks} açık görev`,
    href: taskListHref({ durum: "acik" }),
  },
  {
    id: "performance",
    icon: "↗",
    title: "Dava Performans Özeti",
    description: "Kazanma oranı ve kategori bazlı kazanılan/kaybedilen dağılımı.",
    filename: "performans.csv",
    detail: (s) => `%${s.win_rate.toLocaleString("tr-TR")} kazanma oranı`,
    href: "/analitik",
  },
];

export function ReportsView() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"loading" | "ready" | "error">("loading");
  const [downloading, setDownloading] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReportSummary()
      .then((result) => {
        setSummary(result);
        setSummaryState("ready");
      })
      .catch(() => setSummaryState("error"));
  }, []);

  async function handleDownload(report: ReportCard) {
    setDownloading(report.id);
    setError(null);
    try {
      saveBlob(await downloadReportCsv(report.id), report.filename);
    } catch {
      setError("Rapor indirilemedi. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Raporlar</h1>
        <p className="text-sm text-navy-500">Büronuzun güncel durumunu hazır raporlarla inceleyin ve dışa aktarın.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <article key={report.id} className="flex flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-xl font-semibold text-accent-700">{report.icon}</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Canlı veri</span>
            </div>
            <h2 className="text-sm font-semibold text-navy-800">{report.title}</h2>
            <p className="mt-1 min-h-10 text-xs leading-5 text-navy-500">{report.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-4 text-xs">
              <div className="font-medium text-navy-700">
                {summaryState === "loading" && <span className="text-navy-400">…</span>}
                {summaryState === "error" && <span>—</span>}
                {summaryState === "ready" && summary && (
                  <Link href={report.href} className="hover:text-accent-700 hover:underline">
                    {report.detail(summary)}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDownload(report)}
                disabled={downloading !== null}
                className="rounded-xl bg-accent-600 px-3.5 py-2 font-medium text-white transition hover:bg-accent-700 disabled:opacity-60"
              >
                {downloading === report.id ? "Hazırlanıyor..." : "CSV Olarak İndir"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {error && <ErrorState message={error} />}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/ReportsView.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReportsView.tsx frontend/src/components/__tests__/ReportsView.test.tsx
git commit -m "feat(web): live report numbers, links and real CSV downloads"
```

---

### Task 17: End-to-end drill-down test and full verification

**Files:**
- Create: `tests/e2e/specs/05-click-through.spec.ts`

**Interfaces:**
- Consumes: Dashboard legend `aria-label="Dava dağılımı kategorileri"` (Task 13); case list "Önizle" links named `"<case_name> önizle"` (Task 10); drawer `role="dialog"` with "Görevler" shortcut (Task 7); `?sekme=gorevler` (Task 8).

- [ ] **Step 1: Write the E2E test** — `tests/e2e/specs/05-click-through.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 5: Dashboard chart legend -> filtered case list (count matches) ->
// quick view -> case detail on the Görevler tab -> back returns to the list.

test("drill down from a dashboard category to a case's tasks tab", async ({ page }) => {
  await login(page);

  const legend = page.getByRole("list", { name: "Dava dağılımı kategorileri" });
  const firstCategory = legend.getByRole("link").first();
  const label = (await firstCategory.textContent()) ?? "";
  const expectedCount = Number(label.split("·")[1].trim());
  expect(expectedCount).toBeGreaterThan(0);

  await firstCategory.click();
  await expect(page).toHaveURL(/\/davalar\?kategori=[a-z_]+&arsiv=dahil$/);
  await expect(page.locator("tbody tr")).toHaveCount(expectedCount);
  const listUrl = page.url();

  await page.getByRole("link", { name: / önizle$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/onizle=/);

  await dialog.getByRole("link", { name: "Görevler", exact: true }).click();
  await expect(page).toHaveURL(/\/davalar\/[^/?]+\?sekme=gorevler$/);
  await expect(page.getByRole("tab", { name: "Görevler" })).toHaveAttribute("aria-selected", "true");

  await page.goBack();
  await expect(page).toHaveURL(/onizle=/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the full backend suite**

Run: `cd backend && pytest -q`
Expected: all PASS.

- [ ] **Step 3: Run the full frontend suite, type check and production build**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, build succeeds with no "useSearchParams() should be wrapped in a suspense boundary" error.

- [ ] **Step 4: Run the E2E suite**

Run: `cd tests/e2e && npm ci && npx playwright test`
Expected: all 5 specs PASS (01–04 unchanged, 05 new).

- [ ] **Step 5: Manual smoke check** (backend + frontend running, logged in as the demo admin):
  - Dashboard: click "İcra" bar → list shows the same number of rows as the bar.
  - Click "Ticari Kira Uyarlama Davası" in Yaklaşan Duruşmalar → drawer opens without leaving the dashboard; browser back closes it.
  - Takvim: click a task chip → drawer opens with that task highlighted.
  - Görevler: click "Gecikmiş" card → only overdue tasks; click again → filter off.
  - Belgeler: "İndir" downloads the original file.
  - Raporlar: numbers match the lists they open; all 4 CSVs open in Excel with Turkish characters intact.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/specs/05-click-through.spec.ts
git commit -m "test(e2e): dashboard to case tasks drill-down flow"
```

---

## Notes on small refinements vs. the spec

These keep the spec's intent; the spec file is updated to match.

- **Suspense:** added once in `AppShell` instead of in every `app/*/page.tsx` wrapper.
- **`useQuickViewHref()`** returns a builder `(caseId, focus?) => href` instead of taking `caseId` directly, because list screens need one link per row.
- **CSV format:** only the three new CSVs get a UTF-8 BOM and Turkish headers. `/reports/cases.csv` keeps its current English snake_case headers because an existing test and possibly external consumers rely on them.
- **Analytics page:** the "Kazanma Oranı" card is not a link there (it would link to the same page). "Ort. Dava Süresi" is not clickable anywhere.
- **Errors:** `lib/api` now throws `ApiError` (a subclass of `Error` with `status`), so the quick view can tell a 404 from other failures. Existing `catch` blocks keep working unchanged.
