"""Import the complete fictional files without touching previous portfolios."""
from datetime import datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app.db.base import Base
from app.db.demo_presentation_seed import identity
from app.db.demo_team import seed_demo_lawyers
from app.db.dossier_documents import entries
from app.db.dossier_stories import STORIES
from app.models.case import Case, CaseEvent, CaseEventType, CaseStatus
from app.models.document import Document, DocumentType
from app.models.management import WorkspaceAccess


def case_key(firm, story):
    return identity(firm, "dossier-v1:" + story.code)


def document_key(case_id, key):
    return identity(case_id, "evrak:" + key)


def package_cases(db, firm):
    return db.query(Case).filter(Case.law_firm_id == firm, Case.id.in_([case_key(firm, s) for s in STORIES])).all()


def add_dossiers(db, admin):
    firm = admin.law_firm_id
    members = seed_demo_lawyers(db, admin)
    existing = {c.id for c in package_cases(db, firm)}
    ids = [case_key(firm, s) for s in STORIES]
    scopes = {}
    for member in members:
        grant = db.query(WorkspaceAccess).filter_by(law_firm_id=firm, user_id=member.id).first()
        if grant is None:
            grant = WorkspaceAccess(law_firm_id=firm, user_id=member.id, position="lawyer", case_ids=ids)
            db.add(grant)
        scopes[member.id] = set(grant.case_ids)
    added = 0
    total_docs = 0
    existing_docs = set(db.scalars(select(Document.id).where(Document.law_firm_id == firm, Document.case_id.in_(ids))))
    existing_events = set(db.scalars(select(CaseEvent.id).where(CaseEvent.law_firm_id == firm, CaseEvent.case_id.in_(ids))))
    used = {num: cid for num, cid in db.query(Case.case_number, Case.id).filter(Case.law_firm_id == firm,
            Case.case_number.in_(["ÖRNEK-" + s.code for s in STORIES]))}
    for index, s in enumerate(STORIES):
        cid = ids[index]
        number = "ÖRNEK-" + s.code
        if number in used and used[number] != cid:
            raise HTTPException(409, "Örnek dosya numarası başka bir kayıtta kullanılıyor.")
        records = entries(s)
        owner = members[index % len(members)]
        assigned = owner.id if cid in scopes[owner.id] else admin.id
        if cid not in existing:
            db.add(Case(id=cid, law_firm_id=firm, case_number=number, case_name=s.title, client_name=s.client,
                        opposing_party=s.opponent, court=s.court, case_type=s.category, assigned_lawyer_id=assigned,
                        status=CaseStatus.KAPALI, outcome=s.outcome, opening_date=records[1].day,
                        decision_date=records[-1].day, closing_note=s.end, description="Kurgusal örnek · " + s.facts,
                        claim=s.claim, facts_summary=s.facts, plaintiff_position=s.claim if s.category != "ceza" else None,
                        defendant_position=s.response if s.category != "ceza" else None))
            db.flush()
            added += 1
        for item in records:
            doc_id = document_key(cid, item.key)
            stamp = datetime.combine(item.day, time(10), tzinfo=timezone.utc)
            if doc_id not in existing_docs:
                db.add(Document(id=doc_id, law_firm_id=firm, case_id=cid, filename=item.filename, file_type=DocumentType.PDF,
                                uploaded_at=stamp, uploaded_by=assigned, extracted_text=item.text, storage_path="demo://dossier/" + doc_id))
                added += 1
            # The same stable ID across these two tables pairs each event with its exact exhibit.
            if doc_id not in existing_events:
                db.add(CaseEvent(id=doc_id, law_firm_id=firm, case_id=cid, event_date=item.day, created_at=stamp,
                                 title=item.title, description=f"{item.key} · {item.author}",
                                 event_type=CaseEventType.HEARING if "duruşma" in item.title.lower() else CaseEventType.SUBMISSION,
                                 created_by=assigned))
                added += 1
        total_docs += len(records)
    db.flush()
    return {"total_cases": len(ids), "added_cases": len(ids) - len(existing), "added_records": added,
            "coverage": {"Ceza dosyaları": 10, "Hukuk dosyaları": 10, "PDF evrak": total_docs}}


def removable_dossiers(db, firm):
    """Keep an entire dossier if another workflow or a user record now depends on it."""
    present = set(db.scalars(select(Case.id).where(Case.law_firm_id == firm,
                  Case.id.in_([case_key(firm, s) for s in STORIES])).with_for_update()))
    if not present:
        return set(), set()
    expected = {case_key(firm, s): {document_key(case_key(firm, s), e.key) for e in entries(s)} for s in STORIES}
    protected = set()
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            if fk.column.table.name != "cases":
                continue
            column = fk.parent
            rows = db.execute(select(column, table.c.id).where(column.in_(present)))
            for cid, row_id in rows:
                if table.name not in {"documents", "case_events"} or row_id not in expected[cid]:
                    protected.add(cid)
    return present - protected, protected
