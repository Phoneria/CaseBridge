"""Read-only, firm-scoped data tools for the CaseBridge AI chat.

The chat model may ask for these tools by name; it never sees SQL and never
chooses a firm. Every handler:

- takes the firm and user from a ToolPrincipal built from the authenticated
  session (never from tool arguments),
- reads through the same services/repositories as the REST routes, so the
  same rules hold: law_firm_id on every query, precedents only through the
  precedent tool, ordinary case tools never return precedents,
- refuses everything for a workspace-restricted account (those accounts may
  not open the case, document, task or calendar routes either),
- returns at most MAX_ROWS rows and MAX_SNIPPET_CHARS of any stored text.

A tool returns ToolOutput: JSON-safe rows for the model, the links the
answer may cite (sources) and the record ids written to the audit log.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app.core.timeutil import local_today
from app.models.case import Case, CaseOutcome, CaseStatus
from app.models.management import WorkspaceAccess
from app.models.task import TaskStatus
from app.models.user import UserRole
from app.services.calendar_service import CalendarService
from app.services.case_service import CaseService
from app.services.client_service import ClientService
from app.services.document_service import DocumentService
from app.services.hearing_service import HearingService
from app.services.similar_cases import fold, turkish_lower
from app.services.task_service import TaskService

MAX_ROWS = 8
MAX_SNIPPET_CHARS = 320
MAX_FIELD_CHARS = 600
MAX_QUERY_CHARS = 100
MAX_CALENDAR_DAYS = 62
DEFAULT_CALENDAR_DAYS = 14
UPCOMING_HEARING_DAYS = 60

NOT_ALLOWED = "Bu hesap CaseBridge AI veri araçlarını kullanamaz."
CASE_NOT_FOUND = "Dava bulunamadı."

STATUS_LABELS = {
    "devam_eden": "Devam ediyor", "durusma_bekleyen": "Duruşma bekliyor",
    "karar_bekleyen": "Karar bekliyor", "kapali": "Kapalı",
}
OUTCOME_LABELS = {"ongoing": "Sürüyor", "won": "Kazanıldı", "lost": "Kaybedildi", "settled": "Sulh"}


class ToolDenied(Exception):
    """The caller may not use data tools at all."""


@dataclass(frozen=True)
class ToolPrincipal:
    """Who is asking. Built from the authenticated user before the request
    session closes; the firm is never taken from the model or the client."""

    user_id: str
    law_firm_id: str
    is_admin: bool

    @classmethod
    def of(cls, user) -> "ToolPrincipal":
        return cls(user_id=user.id, law_firm_id=user.law_firm_id, is_admin=user.role == UserRole.ADMIN)


@dataclass
class Source:
    kind: str  # case | document | precedent | client | calendar
    id: str
    label: str
    href: str

    def as_dict(self) -> dict:
        return {"kind": self.kind, "id": self.id, "label": self.label, "href": self.href}


@dataclass
class ToolOutput:
    rows: list[dict] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    record_ids: list[str] = field(default_factory=list)
    #: True when rows carry text taken from uploaded documents (untrusted).
    document_text: bool = False
    error: Optional[str] = None


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict
    handler: Callable[[Session, ToolPrincipal, dict], ToolOutput]

    def schema(self) -> dict:
        """Provider-neutral JSON schema ({name, description, parameters})."""
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


# ---------- argument helpers: the model's arguments are untrusted input ----------

def _text(args: dict, key: str, limit: int = MAX_QUERY_CHARS) -> Optional[str]:
    value = args.get(key)
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())[:limit]
    return value or None


def _ident(args: dict, key: str) -> Optional[str]:
    value = _text(args, key, 36)
    return value if value and re.fullmatch(r"[A-Za-z0-9-]{1,36}", value) else None


def _enum(args: dict, key: str, enum_cls):
    value = _text(args, key, 32)
    try:
        return enum_cls(value) if value else None
    except ValueError:
        return None


def _date(args: dict, key: str) -> Optional[date]:
    value = _text(args, key, 10)
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


def _clip(value: Optional[str], limit: int = MAX_FIELD_CHARS) -> Optional[str]:
    if not value:
        return None
    value = " ".join(value.split())
    return value if len(value) <= limit else value[:limit].rstrip() + "…"


def _folded(text: Optional[str]) -> str:
    return fold(turkish_lower(text or ""))


def _terms(query: Optional[str]) -> list[str]:
    return [t for t in _folded(query).split() if len(t) >= 2][:6]


def _matches(terms: list[str], *texts: Optional[str]) -> bool:
    haystack = " ".join(_folded(t) for t in texts if t)
    return all(term in haystack for term in terms)


def _snippet(text: Optional[str], terms: list[str]) -> Optional[str]:
    """MAX_SNIPPET_CHARS of stored text around the first matched term."""
    if not text:
        return None
    flat = " ".join(text.split())
    folded = _folded(flat)
    start = 0
    for term in terms:
        position = folded.find(term)
        if position != -1:
            start = max(0, position - MAX_SNIPPET_CHARS // 3)
            break
    piece = flat[start:start + MAX_SNIPPET_CHARS].strip()
    return ("…" if start else "") + piece + ("…" if start + MAX_SNIPPET_CHARS < len(flat) else "")


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


# ---------- links ----------

def case_source(case: Case) -> Source:
    return Source("case", case.id, f"{case.case_number} · {case.case_name}", f"/davalar/{case.id}")


def document_source(document, case_label: str) -> Source:
    return Source(
        "document", document.id, f"{document.filename} · {case_label}",
        f"/davalar/{document.case_id}?sekme=belgeler&belge={document.id}",
    )


def precedent_source(case: Case) -> Source:
    return Source("precedent", case.id, f"Emsal {case.case_number} · {case.case_name}", f"/emsaller?karar={case.id}")


def client_source(client) -> Source:
    return Source("client", client.id, client.name, f"/muvekkiller/{client.id}")


CALENDAR_SOURCE = Source("calendar", "takvim", "Takvim", "/takvim")


def _case_row(case: Case) -> dict:
    lawyer = getattr(case, "assigned_lawyer", None)
    return {
        "id": case.id,
        "dosya_no": case.case_number,
        "dava": case.case_name,
        "muvekkil": case.client_name,
        "karsi_taraf": case.opposing_party,
        "tur": case.case_type.value if case.case_type else None,
        "durum": STATUS_LABELS.get(case.status.value, case.status.value) if case.status else None,
        "sonuc": OUTCOME_LABELS.get(case.outcome.value, case.outcome.value) if case.outcome else None,
        "mahkeme": case.court,
        "sonraki_durusma": _iso(case.next_hearing_date),
        "sorumlu_avukat": lawyer.full_name if lawyer is not None else None,
        "arsivde": bool(case.is_archived),
    }


def _firm_case(db: Session, principal: ToolPrincipal, case_id: Optional[str]) -> Optional[Case]:
    """The firm's ordinary (non-precedent) case, exactly like GET /cases/{id}."""
    if not case_id:
        return None
    return CaseService(db).get_case(case_id, principal.law_firm_id)


# ---------- tools ----------

def search_cases(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    rows = CaseService(db).list_cases(
        principal.law_firm_id,
        search=_text(args, "query"),
        status=_enum(args, "status", CaseStatus),
        outcome=_enum(args, "outcome", CaseOutcome),
        include_archived=args.get("include_archived") is True,
        limit=MAX_ROWS,
    )
    return ToolOutput(
        rows=[_case_row(case) for case in rows],
        sources=[case_source(case) for case in rows],
        record_ids=[case.id for case in rows],
    )


def get_case(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    case = _firm_case(db, principal, _ident(args, "case_id"))
    if case is None:
        return ToolOutput(error=CASE_NOT_FOUND)
    service = CaseService(db)
    timeline = service.get_timeline(case.id, principal.law_firm_id)[-5:]
    row = _case_row(case) | {
        "acilis": _iso(case.opening_date),
        "karar_tarihi": _iso(case.decision_date),
        "dava_degeri": case.case_value,
        "aciklama": _clip(case.description),
        "talep": _clip(case.claim),
        "olaylar": _clip(case.facts_summary),
        "son_kayitlar": [
            {"tarih": _iso(event.event_date), "baslik": _clip(event.title, 160)} for event in timeline
        ],
    }
    return ToolOutput(rows=[row], sources=[case_source(case)], record_ids=[case.id])


def search_documents(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    terms = _terms(_text(args, "query"))
    case_id = _ident(args, "case_id")
    service = DocumentService(db)
    if case_id:
        case = _firm_case(db, principal, case_id)
        if case is None:
            return ToolOutput(error=CASE_NOT_FOUND)
        candidates = [(document, case.case_name, case.case_number) for document in service.list_for_case(case.id, principal.law_firm_id)]
    else:
        # Same listing as GET /documents: the firm's documents of ordinary cases only.
        candidates = service.list_for_firm_with_case(principal.law_firm_id)
    found = [
        (document, case_name, case_number)
        for document, case_name, case_number in candidates
        if _matches(terms, document.filename, document.extracted_text)
    ][:MAX_ROWS]
    rows, sources = [], []
    for document, case_name, case_number in found:
        label = f"{case_number} · {case_name}"
        rows.append({
            "id": document.id,
            "dosya_adi": document.filename,
            "dava": label,
            "dava_id": document.case_id,
            "yuklenme": _iso(document.uploaded_at),
            "alinti": _snippet(document.extracted_text, terms),
        })
        sources.append(document_source(document, case_number))
    return ToolOutput(
        rows=rows, sources=sources, record_ids=[document.id for document, _, _ in found],
        document_text=any(row["alinti"] for row in rows),
    )


def get_hearings(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    case_id = _ident(args, "case_id")
    today = local_today()
    if case_id:
        case = _firm_case(db, principal, case_id)
        if case is None:
            return ToolOutput(error=CASE_NOT_FOUND)
        hearings = HearingService(db).list_for_case(case, today)
        upcoming = [h for h in hearings if not h.is_past] or hearings[-MAX_ROWS:]
        rows = [
            {"id": h.id, "dava": f"{case.case_number} · {case.case_name}", "baslangic": _iso(h.starts_at),
             "yer": h.location, "gecmis": h.is_past, "sonuc_notu": _clip(h.result_note, 240)}
            for h in upcoming[:MAX_ROWS]
        ]
        return ToolOutput(rows=rows, sources=[case_source(case)], record_ids=[case.id] + [row["id"] for row in rows])
    items = [
        item for item in CalendarService(db).list_items(principal.law_firm_id, today, today + timedelta(days=UPCOMING_HEARING_DAYS))
        if item.event_type == "hearing"
    ][:MAX_ROWS]
    rows = [
        {"id": item.event_id or item.id, "dava": item.case_name, "dava_id": item.case_id, "tarih": _iso(item.date),
         "baslangic": _iso(item.start), "yer": item.location}
        for item in items
    ]
    sources = _calendar_case_sources(db, principal, items)
    return ToolOutput(rows=rows, sources=sources or [CALENDAR_SOURCE], record_ids=[row["id"] for row in rows])


def get_tasks(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    case_id = _ident(args, "case_id")
    status = _enum(args, "status", TaskStatus)
    service = TaskService(db)
    if case_id:
        case = _firm_case(db, principal, case_id)
        if case is None:
            return ToolOutput(error=CASE_NOT_FOUND)
        tasks = [(task, case.case_name, case.case_number) for task in service.list_for_case(case.id, principal.law_firm_id)
                 if status is None or task.status == status]
    else:
        tasks = service.list_for_firm_with_case(principal.law_firm_id, status=status or TaskStatus.PENDING)
    tasks = sorted(tasks, key=lambda row: (row[0].status != TaskStatus.PENDING, row[0].due_date or date.max))[:MAX_ROWS]
    rows, sources, seen = [], [], set()
    for task, case_name, case_number in tasks:
        rows.append({
            "id": task.id, "baslik": _clip(task.title, 200), "durum": task.status.value,
            "son_tarih": _iso(task.due_date), "oncelik": task.priority,
            "dava": f"{case_number} · {case_name}", "dava_id": task.case_id,
        })
        if task.case_id not in seen:
            seen.add(task.case_id)
            sources.append(Source("case", task.case_id, f"{case_number} · {case_name}", f"/davalar/{task.case_id}?sekme=gorevler"))
    return ToolOutput(rows=rows, sources=sources, record_ids=[row["id"] for row in rows])


def search_clients(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    rows = ClientService(db).list_clients(principal.law_firm_id, _text(args, "query"), MAX_ROWS, 0)
    # Names and case counts only: contact details stay out of AI prompts.
    return ToolOutput(
        rows=[{"id": client.id, "ad": client.name, "tur": client.client_type, "dava_sayisi": total, "acik_dava": open_}
              for client, total, open_ in rows],
        sources=[client_source(client) for client, _, _ in rows],
        record_ids=[client.id for client, _, _ in rows],
    )


def get_precedents(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    from app.api.routes.precedents import firm_precedents

    case_id = _ident(args, "case_id")
    case = None
    if case_id:
        case = _firm_case(db, principal, case_id)
        if case is None:
            return ToolOutput(error=CASE_NOT_FOUND)
    precedents, linked = firm_precedents(db, principal.law_firm_id, case)
    terms = _terms(_text(args, "query"))
    precedents = [p for p in precedents if _matches(terms, p.case_name, p.court, p.description, p.case_number)][:MAX_ROWS]
    return ToolOutput(
        rows=[{
            "id": p.id, "esas_no": p.case_number, "baslik": p.case_name, "mahkeme": p.court,
            "tur": p.case_type.value if p.case_type else None,
            "sonuc": OUTCOME_LABELS.get(p.outcome.value, p.outcome.value) if p.outcome else None,
            "karar_tarihi": _iso(p.decision_date), "davaya_bagli": p.id in linked,
        } for p in precedents],
        sources=[precedent_source(p) for p in precedents],
        record_ids=[p.id for p in precedents],
    )


def get_calendar(db: Session, principal: ToolPrincipal, args: dict) -> ToolOutput:
    today = local_today()
    start = _date(args, "from") or today
    end = _date(args, "to") or start + timedelta(days=DEFAULT_CALENDAR_DAYS)
    if end < start:
        start, end = end, start
    end = min(end, start + timedelta(days=MAX_CALENDAR_DAYS))
    items = CalendarService(db).list_items(principal.law_firm_id, start, end)[:MAX_ROWS]
    rows = [
        {"id": item.id, "tur": item.event_type, "baslik": _clip(item.title, 200), "tarih": _iso(item.date),
         "baslangic": _iso(item.start), "dava": item.case_name, "dava_id": item.case_id, "sorumlu": item.assignee_name}
        for item in items
    ]
    return ToolOutput(
        rows=rows, sources=[CALENDAR_SOURCE] + _calendar_case_sources(db, principal, items),
        record_ids=[item.event_id or item.task_id or item.id for item in items],
    )


def _calendar_case_sources(db: Session, principal: ToolPrincipal, items) -> list[Source]:
    sources, seen = [], set()
    for item in items:
        if item.case_id and item.case_id not in seen:
            seen.add(item.case_id)
            case = _firm_case(db, principal, item.case_id)
            if case is not None:
                sources.append(case_source(case))
    return sources


def _schema(properties: dict[str, dict], required: tuple[str, ...] = ()) -> dict:
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


_QUERY = {"type": "string", "description": "Aranacak kelimeler (isteğe bağlı)."}
_CASE_ID = {"type": "string", "description": "Davanın kimliği (search_cases veya sayfa bağlamından)."}

TOOLS: dict[str, ToolSpec] = {spec.name: spec for spec in (
    ToolSpec("search_cases", "Büronun davalarını arar (dosya no, dava adı, müvekkil, karşı taraf). Emsalleri içermez.",
             _schema({"query": _QUERY,
                      "status": {"type": "string", "enum": [s.value for s in CaseStatus]},
                      "outcome": {"type": "string", "enum": [o.value for o in CaseOutcome]},
                      "include_archived": {"type": "boolean"}}), search_cases),
    ToolSpec("get_case", "Tek bir davanın özetini, açıklamasını ve son kayıtlarını getirir.",
             _schema({"case_id": _CASE_ID}, ("case_id",)), get_case),
    ToolSpec("search_documents", "Dava belgelerinin metninde arar ve kısa alıntılar döndürür.",
             _schema({"query": _QUERY, "case_id": _CASE_ID}), search_documents),
    ToolSpec("get_hearings", "Bir davanın duruşmalarını veya büronun yaklaşan duruşmalarını getirir.",
             _schema({"case_id": _CASE_ID}), get_hearings),
    ToolSpec("get_tasks", "Bir davanın veya büronun görevlerini getirir (varsayılan: açık görevler).",
             _schema({"case_id": _CASE_ID, "status": {"type": "string", "enum": [s.value for s in TaskStatus]}}), get_tasks),
    ToolSpec("search_clients", "Müvekkilleri adına göre arar; yalnız ad ve dava sayılarını döndürür.",
             _schema({"query": _QUERY}), search_clients),
    ToolSpec("get_precedents", "Büronun emsal karar arşivinde arar; dava verilirse o davanın türündeki emsalleri getirir.",
             _schema({"query": _QUERY, "case_id": _CASE_ID}), get_precedents),
    ToolSpec("get_calendar", "Takvimdeki duruşma, toplantı ve görev tarihlerini getirir (en fazla 62 gün).",
             _schema({"from": {"type": "string", "description": "YYYY-AA-GG"}, "to": {"type": "string", "description": "YYYY-AA-GG"}}),
             get_calendar),
)}


def tool_schemas() -> list[dict]:
    return [spec.schema() for spec in TOOLS.values()]


def ensure_allowed(db: Session, principal: ToolPrincipal) -> None:
    """Workspace-restricted accounts may not read cases, documents, tasks or
    the calendar through the REST routes, so they get no data tools either.
    Checked against the database, not a flag carried on the request."""
    if principal.is_admin:
        return
    grant = db.query(WorkspaceAccess.id).filter(
        WorkspaceAccess.user_id == principal.user_id, WorkspaceAccess.law_firm_id == principal.law_firm_id,
    ).first()
    if grant is not None:
        raise ToolDenied(NOT_ALLOWED)


def run_tool(db: Session, principal: ToolPrincipal, name: str, args: Any) -> ToolOutput:
    spec = TOOLS.get(name)
    if spec is None:
        return ToolOutput(error="Bilinmeyen araç.")
    ensure_allowed(db, principal)
    return spec.handler(db, principal, args if isinstance(args, dict) else {})
