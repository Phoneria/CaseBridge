"""Import the complete fictional files without touching previous portfolios."""
from datetime import datetime, time, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.core.timeutil import local_today as admin_today
from app.db.base import Base
from app.db.demo_presentation_seed import identity
from app.db.demo_team import seed_demo_lawyers
from app.db.dossier_documents import entries
from app.db.dossier_stories import STORIES
from app.models.case import Case, CaseEvent, CaseEventType, CaseStatus, CaseParty
from app.models.document import Document, DocumentType
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.task import Task, TaskStatus
from app.models.management import WorkspaceAccess


def case_key(firm, story):
    return identity(firm, "dossier-v1:" + story.code)


def document_key(case_id, key):
    return identity(case_id, "evrak:" + key)


def package_cases(db, firm):
    return db.query(Case).filter(Case.law_firm_id == firm, Case.id.in_([case_key(firm, s) for s in STORIES])).all()


def workspace_rows(case, story, records, admin):
    common = dict(law_firm_id=case.law_firm_id, case_id=case.id)
    for index, name in enumerate((story.client, story.opponent)):
        yield CaseParty(id=identity(case.id, f"party:{index}"), name=name, is_client=index == 0,
                        role="other" if story.code.startswith("C") else ("plaintiff", "defendant")[index],
                        sort_order=index, **common)
    owner = case.assigned_lawyer_id
    for item in records:
        if "duruşma" in item.title.lower() and ("tutanağı" in item.title.lower() or "zaptı" in item.title.lower()):
            yield CalendarEvent(id=identity(case.id, "hearing:" + item.key), title=item.title,
                                event_type=CalendarEventType.HEARING, starts_at=datetime.combine(item.day, time(10)),
                                notes=item.filename, result_note=item.title, duration_minutes=30,
                                location=story.court, assignee_id=owner, created_by=admin.id, reminder_days=[], **common)
    yield Task(id=identity(case.id, "task:review"), title="Kararı ve dayanak evrakı karşılaştır",
               description=story.judgment, status=TaskStatus.COMPLETED, created_by=admin.id, assigned_to=owner,
               due_date=records[-1].day, completed_at=datetime.combine(records[-1].day, time(15)),
               reminder_days=[], **common)
    yield Task(id=identity(case.id, "task:archive"), title="Müvekkile kapanış raporunu ilet",
               description=story.end, status=TaskStatus.PENDING, created_by=admin.id, assigned_to=owner,
               due_date=admin_today() + timedelta(days=3), reminder_days=[], **common)


def add_dossiers(db, admin):
    firm = admin.law_firm_id
    members = seed_demo_lawyers(db, admin)
    existing = {c.id for c in package_cases(db, firm)}
    ids = [case_key(firm, s) for s in STORIES]
    from app.db.demo_team import sample_cases
    from app.db.demo_upgrade import extend_generated_scope
    bureau_ids = [c.id for c in sample_cases(db, firm)]
    scopes = {}
    for member in members:
        grant = db.query(WorkspaceAccess).filter_by(law_firm_id=firm, user_id=member.id).first()
        if grant is None:
            grant = WorkspaceAccess(law_firm_id=firm, user_id=member.id, position="lawyer", case_ids=ids + bureau_ids)
            db.add(grant)
        else:
            extend_generated_scope(db, firm, member, bureau_ids, ids)
        scopes[member.id] = set(grant.case_ids) if grant.position == "lawyer" and member.is_active else set()
    added = 0
    total_docs = 0
    existing_docs = set(db.scalars(select(Document.id).where(Document.law_firm_id == firm, Document.case_id.in_(ids))))
    existing_events = set(db.scalars(select(CaseEvent.id).where(CaseEvent.law_firm_id == firm, CaseEvent.case_id.in_(ids))))
    used = {num: cid for num, cid in db.query(Case.case_number, Case.id).filter(Case.law_firm_id == firm,
            Case.case_number.in_(["CB-" + s.code for s in STORIES]))}
    distribution = {}
    for index, s in enumerate(STORIES):
        cid = ids[index]
        number = "CB-" + s.code
        if number in used and used[number] != cid:
            raise HTTPException(409, "Gösterim dosyasının numarası başka bir kayıtta kullanılıyor.")
        records = entries(s)
        eligible = [member for member in members if cid in scopes[member.id]] + [admin]
        sequence = distribution.get(s.outcome, 0)
        assigned = eligible[sequence % len(eligible)].id
        distribution[s.outcome] = sequence + 1
        if cid not in existing:
            db.add(Case(id=cid, law_firm_id=firm, case_number=number, case_name=s.title, client_name=s.client,
                        opposing_party=s.opponent, court=s.court, case_type=s.category, assigned_lawyer_id=assigned,
                        status=CaseStatus.KAPALI, outcome=s.outcome, opening_date=records[1].day,
                        decision_date=records[-1].day, closing_note=s.end, description="Kurgusal dosya · " + s.facts,
                        claim=s.claim, facts_summary=s.facts, plaintiff_position=s.claim if s.category != "ceza" else None,
                        defendant_position=s.response if s.category != "ceza" else None))
            db.flush()
            added += 1
        else:
            case = db.get(Case, cid)
            if case.case_number == "ÖRNEK-" + s.code:
                case.case_number = number
                if case.assigned_lawyer_id in {admin.id, *[identity(firm, f"team-lawyer:{i}") for i in range(12)]}:
                    case.assigned_lawyer_id = assigned
            if case.description == "Kurgusal örnek · " + s.facts:
                case.description = "Kurgusal dosya · " + s.facts
        for item in records:
            doc_id = document_key(cid, item.key)
            stamp = datetime.combine(item.day, time(10), tzinfo=timezone.utc)
            if doc_id not in existing_docs:
                db.add(Document(id=doc_id, law_firm_id=firm, case_id=cid, filename=item.filename, file_type=DocumentType.PDF,
                                uploaded_at=stamp, uploaded_by=assigned, extracted_text=item.text, storage_path="demo://dossier/" + doc_id))
                added += 1
            else:
                doc = db.get(Document, doc_id)
                if doc.storage_path == "demo://dossier/" + doc_id and doc.extracted_text:
                    normalized = doc.extracted_text.replace("Kurgusal örnek ·", "Kurgusal dosya ·").replace("Vekâletname örneği", "Vekâletname").replace("Örnek Kıyı Belediyesi", "Kıyı Belediyesi")
                    if normalized == item.text:
                        doc.extracted_text, doc.filename = item.text, item.filename
            # The same stable ID across these two tables pairs each event with its exact exhibit.
            if doc_id not in existing_events:
                db.add(CaseEvent(id=doc_id, law_firm_id=firm, case_id=cid, event_date=item.day, created_at=stamp,
                                 title=item.title, description=f"{item.key} · {item.author}",
                                 event_type=CaseEventType.HEARING if "duruşma" in item.title.lower() else CaseEventType.SUBMISSION,
                                 created_by=assigned))
                added += 1
        for row in workspace_rows(db.get(Case, cid), s, records, admin):
            if db.get(type(row), row.id) is None:
                db.add(row)
                added += 1
        total_docs += len(records)
    db.flush()
    from app.db.demo_upgrade import retire_old_roster
    retire_old_roster(db, admin)
    return {"total_cases": len(ids), "added_cases": len(ids) - len(existing), "added_records": added,
            "coverage": {"Ceza dosyaları": 10, "Hukuk dosyaları": 10, "PDF evrak": total_docs}}


def removable_dossiers(db, firm):
    """Keep an entire dossier if another workflow or a user record now depends on it."""
    present = set(db.scalars(select(Case.id).where(Case.law_firm_id == firm,
                  Case.id.in_([case_key(firm, s) for s in STORIES])).with_for_update()))
    if not present:
        return set(), set()
    expected = {case_key(firm, s): {document_key(case_key(firm, s), e.key) for e in entries(s)} for s in STORIES}
    owned = {}
    for s in STORIES:
        cid = case_key(firm, s)
        owned[cid] = {
            "case_parties": {identity(cid, f"party:{i}") for i in range(2)},
            "tasks": {identity(cid, "task:review"), identity(cid, "task:archive")},
            "calendar_events": {identity(cid, "hearing:" + e.key) for e in entries(s)},
            "documents": expected[cid], "case_events": expected[cid],
        }
    protected = set()
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            if fk.column.table.name != "cases":
                continue
            column = fk.parent
            rows = db.execute(select(column, table.c.id).where(column.in_(present)))
            for cid, row_id in rows:
                if row_id not in owned[cid].get(table.name, set()):
                    protected.add(cid)
    return present - protected, protected
