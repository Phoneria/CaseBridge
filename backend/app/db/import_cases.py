"""Import real cases and documents from a folder.

Run with: python -m app.db.import_cases /data/import
(after SEED_DEMO_DATA=false: python -m app.db.import_cases /data/import --firm "<büro adı>" --lawyer <e-posta>)

Folder layout:
    cases.json            {"cases": [ {...}, ... ]}
    documents/            files referenced by cases[].documents[].file

Each case: case_number, case_name, client_name, case_type are required;
opposing_party, court, opening_date, next_hearing_date (YYYY-MM-DD; becomes
an all-day hearing event of the case unless it already has one that day),
status, outcome, case_value, description, events[], tasks[], documents[]
are optional. A document is {"file": "x.pdf"} (pdf/docx/txt in
documents/) or {"filename": "x.txt", "text": "..."}.

Idempotent: existing case numbers are updated, not duplicated; documents
and events are matched by filename/title. A manifest marked
``record_kind: precedent`` is kept out of the firm's case metrics.
"""
import argparse
import json
import os
import sys
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func

from app.core.config import settings
from app.core.timeutil import local_today
from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
from app.db.session import SessionLocal
import app.models  # noqa: F401
from app.models.case import Case, CaseEvent, CaseEventType, CaseOutcome, CaseStatus, CaseType
from app.models.document import Document, DocumentType
from app.models.law_firm import LawFirm
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.services.assignees import is_assignable
from app.services.case_parties import (
    PartyData,
    derive_client_name,
    derive_opposing_party,
    legacy_parties,
    party_models,
)
from app.services.hearing_dates import ensure_all_day_hearing, recompute_next_hearing
from app.services.text_extraction import extract_text

_EXT = {".pdf": DocumentType.PDF, ".docx": DocumentType.DOCX, ".txt": DocumentType.TXT}
_CASE_FIELDS = (
    "case_name", "client_name", "opposing_party", "court", "description", "case_value",
)


class ImportError_(ValueError):
    pass


def _date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    return date.fromisoformat(str(value)[:10])


def _enum(cls, value, default):
    if value in (None, ""):
        return default
    try:
        return cls(str(value).strip().lower())
    except ValueError as exc:
        allowed = ", ".join(m.value for m in cls)
        raise ImportError_(f"Invalid {cls.__name__} '{value}'. Allowed: {allowed}") from exc


def _store(firm_id: str, case_id: str, filename: str, raw: bytes) -> str:
    folder = os.path.join(settings.storage_dir, firm_id, case_id)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{uuid.uuid4()}_{filename}")
    with open(path, "wb") as f:
        f.write(raw)
    return path


def _is_untouched_legacy(case: Case) -> bool:
    current = [(p.name, p.role, p.is_client, p.counsel_name) for p in case.parties]
    legacy = [(p.name, p.role, p.is_client, p.counsel_name)
              for p in legacy_parties(case.client_name, case.opposing_party)]
    return current == legacy


def _import_case(db, firm: LawFirm, lawyer: User, item: dict, docs_dir: str, is_precedent: bool) -> tuple[bool, int]:
    for key in ("case_number", "case_name", "client_name", "case_type"):
        if not item.get(key):
            raise ImportError_(f"Missing required field '{key}'")

    case = db.query(Case).filter(Case.law_firm_id == firm.id, Case.case_number == item["case_number"]).first()
    created = case is None
    if created:
        case = Case(
            law_firm_id=firm.id, case_number=item["case_number"],
            assigned_lawyer_id=None if is_precedent else lawyer.id,
            is_precedent=is_precedent,
        )
        db.add(case)
    elif case.is_precedent != is_precedent:
        if not (is_precedent and case.client_name == "Davacı (anonim)"):
            raise ImportError_("Existing case has a different record kind; refusing to overwrite it")
        case.is_precedent = True
    if is_precedent:
        case.assigned_lawyer_id = None

    names_before = (case.client_name, case.opposing_party)
    untouched = False if created else _is_untouched_legacy(case)
    for field in _CASE_FIELDS:
        if field in item:
            setattr(case, field, item[field])
    if created or (untouched and names_before != (case.client_name, case.opposing_party)):
        # Manifests only know client_name / opposing_party; parties edited in
        # the app survive a re-import, only untouched legacy parties follow
        # a change of those names.
        case.parties = party_models(legacy_parties(case.client_name, case.opposing_party), firm.id)
    elif not untouched:
        kept = [PartyData(p.name, p.role, p.is_client, p.counsel_name) for p in case.parties]
        case.client_name = derive_client_name(kept) or case.client_name
        case.opposing_party = derive_opposing_party(kept, case.client_role)
    case.case_type = _enum(CaseType, item.get("case_type"), CaseType.DIGER)
    case.status = _enum(CaseStatus, item.get("status"), CaseStatus.DEVAM_EDEN)
    case.outcome = _enum(CaseOutcome, item.get("outcome"), CaseOutcome.ONGOING)
    if item.get("opening_date"):
        case.opening_date = _date(item["opening_date"])
    hearing_day = _date(item.get("next_hearing_date"))
    if is_precedent:
        # Precedents are not on the calendar: the date stays a plain value.
        case.next_hearing_date = hearing_day
    else:
        # A hearing is a calendar event; a re-import never adds a second one on the same day.
        db.flush()
        if hearing_day is not None:
            ensure_all_day_hearing(db, case, hearing_day, lawyer.id)
        recompute_next_hearing(db, case, local_today())
    db.flush()

    for ev in item.get("events", []):
        exists = db.query(CaseEvent).filter(CaseEvent.case_id == case.id, CaseEvent.title == ev["title"]).first()
        if exists:
            continue
        db.add(CaseEvent(
            case_id=case.id, law_firm_id=firm.id, created_by=lawyer.id,
            title=ev["title"], description=ev.get("description"),
            event_type=_enum(CaseEventType, ev.get("event_type"), CaseEventType.OTHER),
            event_date=_date(ev.get("event_date")) or date.today(),
        ))

    for t in item.get("tasks", []):
        exists = db.query(Task).filter(Task.case_id == case.id, Task.title == t["title"]).first()
        if exists:
            continue
        status = _enum(TaskStatus, t.get("status"), TaskStatus.PENDING)
        db.add(Task(
            case_id=case.id, law_firm_id=firm.id, assigned_to=lawyer.id, created_by=lawyer.id,
            title=t["title"], description=t.get("description"), due_date=_date(t.get("due_date")),
            status=status,
            completed_at=datetime.now(timezone.utc) if status == TaskStatus.COMPLETED else None,
        ))

    doc_count = 0
    for d in item.get("documents", []):
        if "file" in d:
            filename = os.path.basename(d["file"])
            src = os.path.join(docs_dir, filename)
            if not os.path.isfile(src):
                raise ImportError_(f"Document file not found: documents/{filename}")
            with open(src, "rb") as f:
                raw = f.read()
        else:
            filename = os.path.basename(d.get("filename") or "")
            if not filename or "text" not in d:
                raise ImportError_("Document needs 'file', or 'filename' + 'text'")
            raw = d["text"].encode("utf-8")
        file_type = _EXT.get(os.path.splitext(filename.lower())[1])
        if file_type is None:
            raise ImportError_(f"Unsupported document type: {filename} (pdf, docx, txt)")
        exists = db.query(Document).filter(Document.case_id == case.id, Document.filename == filename).first()
        if exists:
            continue
        db.add(Document(
            case_id=case.id, law_firm_id=firm.id, uploaded_by=lawyer.id, filename=filename,
            file_type=file_type, storage_path=_store(firm.id, case.id, filename, raw),
            extracted_text=extract_text(file_type, raw),
        ))
        doc_count += 1

    db.flush()
    return created, doc_count


def import_folder(folder: str, db=None, firm_name: str = DEMO_FIRM_NAME, lawyer_email: str = LAWYER_EMAIL) -> dict:
    manifest = os.path.join(folder, "cases.json")
    if not os.path.isfile(manifest):
        raise ImportError_(f"{manifest} not found")
    with open(manifest, encoding="utf-8") as f:
        data = json.load(f)
    items = data["cases"] if isinstance(data, dict) else data
    record_kind = data.get("record_kind", "firm_case") if isinstance(data, dict) else "firm_case"
    if record_kind not in {"firm_case", "precedent"}:
        raise ImportError_("record_kind must be firm_case or precedent")

    own_session = db is None
    db = db or SessionLocal()
    try:
        firm = db.query(LawFirm).filter(LawFirm.name == firm_name).first()
        lawyer = None
        if firm:
            lawyer = db.query(User).filter(
                User.law_firm_id == firm.id, func.lower(User.email) == lawyer_email.lower()
            ).first()
        if not firm or not lawyer:
            raise ImportError_(
                "Firm or lawyer not found. Run the seed (python -m app.db.seed) for the demo firm, "
                "or pass --firm and --lawyer for a real one."
            )
        # Same rule as case assignment: only an active lawyer who has chosen a
        # password can own cases (an invitee or a deactivated user cannot).
        if lawyer.role != UserRole.LAWYER or not is_assignable(lawyer):
            raise ImportError_(
                "The --lawyer must be an active lawyer of the firm who has set a password "
                "(not an administrator, an invitee or a deactivated user)."
            )
        stats = {"created": 0, "updated": 0, "documents": 0, "errors": []}
        docs_dir = os.path.join(folder, "documents")
        for index, item in enumerate(items):
            try:
                with db.begin_nested():
                    created, docs = _import_case(db, firm, lawyer, item, docs_dir, record_kind == "precedent")
                stats["created" if created else "updated"] += 1
                stats["documents"] += docs
            except (ImportError_, KeyError, ValueError) as exc:
                stats["errors"].append(f"#{index + 1} {item.get('case_number', '?')}: {exc}")
        db.commit()
        return stats
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import cases and documents from a folder.")
    parser.add_argument("folder", nargs="?", default="/data/import")
    parser.add_argument("--firm", default=DEMO_FIRM_NAME, help="Firm to import into (default: the demo firm)")
    parser.add_argument("--lawyer", default=LAWYER_EMAIL, help="E-mail of the lawyer who will own the cases")
    args = parser.parse_args()
    result = import_folder(args.folder, firm_name=args.firm, lawyer_email=args.lawyer)
    print(f"Imported: {result['created']} new, {result['updated']} updated, {result['documents']} documents")
    for err in result["errors"]:
        print(f"  ERROR {err}")
    sys.exit(1 if result["errors"] else 0)
