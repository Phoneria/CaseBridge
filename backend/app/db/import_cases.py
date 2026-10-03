"""Import real cases and documents from a folder.

Run with: python -m app.db.import_cases /data/import

Folder layout:
    cases.json            {"cases": [ {...}, ... ]}
    documents/            files referenced by cases[].documents[].file

Each case: case_number, case_name, client_name, case_type are required;
opposing_party, court, opening_date, next_hearing_date (YYYY-MM-DD),
status, outcome, case_value, description, events[], tasks[], documents[]
are optional. A document is {"file": "x.pdf"} (pdf/docx/txt in
documents/) or {"filename": "x.txt", "text": "..."}.

Idempotent: existing case numbers are updated, not duplicated; documents
and events are matched by filename/title. Imports go to the seeded firm
and are assigned to the seeded lawyer.
"""
import json
import os
import sys
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from app.core.config import settings
from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
from app.db.session import SessionLocal
import app.models  # noqa: F401
from app.models.case import Case, CaseEvent, CaseEventType, CaseOutcome, CaseStatus, CaseType
from app.models.document import Document, DocumentType
from app.models.law_firm import LawFirm
from app.models.task import Task, TaskStatus
from app.models.user import User
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


def _import_case(db, firm: LawFirm, lawyer: User, item: dict, docs_dir: str) -> tuple[bool, int]:
    for key in ("case_number", "case_name", "client_name", "case_type"):
        if not item.get(key):
            raise ImportError_(f"Missing required field '{key}'")

    case = db.query(Case).filter(Case.law_firm_id == firm.id, Case.case_number == item["case_number"]).first()
    created = case is None
    if created:
        case = Case(law_firm_id=firm.id, case_number=item["case_number"], assigned_lawyer_id=lawyer.id)
        db.add(case)

    for field in _CASE_FIELDS:
        if field in item:
            setattr(case, field, item[field])
    case.case_type = _enum(CaseType, item.get("case_type"), CaseType.DIGER)
    case.status = _enum(CaseStatus, item.get("status"), CaseStatus.DEVAM_EDEN)
    case.outcome = _enum(CaseOutcome, item.get("outcome"), CaseOutcome.ONGOING)
    if item.get("opening_date"):
        case.opening_date = _date(item["opening_date"])
    case.next_hearing_date = _date(item.get("next_hearing_date"))
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


def import_folder(folder: str, db=None) -> dict:
    manifest = os.path.join(folder, "cases.json")
    if not os.path.isfile(manifest):
        raise ImportError_(f"{manifest} not found")
    with open(manifest, encoding="utf-8") as f:
        data = json.load(f)
    items = data["cases"] if isinstance(data, dict) else data

    own_session = db is None
    db = db or SessionLocal()
    try:
        firm = db.query(LawFirm).filter(LawFirm.name == DEMO_FIRM_NAME).first()
        lawyer = db.query(User).filter(User.email == LAWYER_EMAIL).first()
        if not firm or not lawyer:
            raise ImportError_("Run the seed first (python -m app.db.seed)")
        stats = {"created": 0, "updated": 0, "documents": 0, "errors": []}
        docs_dir = os.path.join(folder, "documents")
        for index, item in enumerate(items):
            try:
                with db.begin_nested():
                    created, docs = _import_case(db, firm, lawyer, item, docs_dir)
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
    target = sys.argv[1] if len(sys.argv) > 1 else "/data/import"
    result = import_folder(target)
    print(f"Imported: {result['created']} new, {result['updated']} updated, {result['documents']} documents")
    for err in result["errors"]:
        print(f"  ERROR {err}")
    sys.exit(1 if result["errors"] else 0)
