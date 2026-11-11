"""Bureau workflows. No customer lookup is ever performed without its firm."""
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import unicodedata

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.exc import IntegrityError

from app.api.case_access import require_case_writable
from app.core.timeutil import local_today
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseParty, CaseStatus
from app.models.document import Document
from app.models.management import ManagementRecord, ManagementAudit, WorkspaceAccess, WorkTransfer, now
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.management import RecordWrite


def fail(message, code=422):
    raise HTTPException(status_code=code, detail=message)


def commit(db):
    try:
        db.commit()
    except (StaleDataError, IntegrityError):
        db.rollback()
        fail("Kayıt başka bir oturumda değişti. Yenileyip tekrar deneyin.", 409)


def flush(db):
    try:
        db.flush()
    except (StaleDataError, IntegrityError):
        db.rollback()
        fail("Kayıt başka bir oturumda değişti. Yenileyip tekrar deneyin.", 409)


def record_out(row):
    return {
        "id": row.id, "kind": row.kind, "title": row.title, "status": row.status,
        "case_id": row.case_id, "owner_id": row.owner_id,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "data": row.data, "version": row.version, "created_by": row.created_by,
        "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat(),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
    }


def audit(db, actor, firm_id, action, entity_type, entity_id, before=None, after=None, reason=""):
    db.add(ManagementAudit(
        law_firm_id=firm_id, actor_id=actor.id, action=action, entity_type=entity_type,
        entity_id=entity_id, before=before, after=after, reason=reason,
    ))


def user_in_firm(db, firm_id, user_id, *, active=True):
    user = db.query(User).filter(User.id == user_id, User.law_firm_id == firm_id).first()
    if user is None:
        fail("Kullanıcı bulunamadı.", 404)
    if active and (not user.is_active or user.password_set_at is None):
        fail("Aktif ve daveti kabul etmiş bir kullanıcı seçin.")
    return user


def case_in_firm(db, firm_id, case_id, *, writable=False):
    row = db.query(Case).filter(Case.id == case_id, Case.law_firm_id == firm_id, Case.is_precedent.is_(False)).first()
    if row is None:
        fail("Dava bulunamadı.", 404)
    if writable:
        require_case_writable(row)
    return row


def get_record(db, firm_id, record_id):
    row = db.query(ManagementRecord).filter(ManagementRecord.id == record_id, ManagementRecord.law_firm_id == firm_id).with_for_update().populate_existing().first()
    if row is None:
        fail("Kayıt bulunamadı.", 404)
    return row


def check_version(row, expected):
    if expected is None or row.version != expected:
        fail("Kayıt başka bir oturumda değişti. Yenileyip tekrar deneyin.", 409)


def access_for(db, user):
    return db.query(WorkspaceAccess).filter(WorkspaceAccess.user_id == user.id, WorkspaceAccess.law_firm_id == user.law_firm_id).first()


def transfer_management_work(db, actor, user, target, reason):
    rows = db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == user.law_firm_id, ManagementRecord.owner_id == user.id, ManagementRecord.kind.in_(["deadline", "approval", "checklist"]), ManagementRecord.status.notin_(["completed", "approved"]), ManagementRecord.deleted_at.is_(None)).all()
    archived = {c.id for c in db.query(Case).filter(Case.law_firm_id == user.law_firm_id, Case.is_archived.is_(True)).all()}
    rows = [r for r in rows if r.case_id not in archived]
    for row in rows:
        previous = record_out(row)
        row.owner_id = target.id
        if row.kind == "deadline" and row.data["backup_id"] == target.id:
            row.data = {**row.data, "backup_id": actor.id}
        row.updated_at = now()
        audit(db, actor, user.law_firm_id, "record.transferred", row.kind, row.id, previous, {"owner_id": target.id}, reason)
    return len(rows)


def transfer_out(row):
    return {"id": row.id, "from_user_id": row.from_user_id, "to_user_id": row.to_user_id, "reason": row.reason, "counts": row.counts, "created_at": row.created_at.isoformat(), "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None}


def check_references(db, actor, firm_id, payload):
    if payload.case_id:
        case_in_firm(db, firm_id, payload.case_id, writable=True)
    if payload.owner_id:
        owner = user_in_firm(db, firm_id, payload.owner_id)
        owner_access = access_for(db, owner)
        if owner_access and owner_access.position == "client":
            fail("Müvekkil operasyon sorumlusu olamaz.")
        if owner_access and payload.case_id and payload.case_id not in owner_access.case_ids:
            fail("Sorumlunun ilgili dosyaya erişimi olmalı.")
    data = payload.data
    if payload.kind == "client":
        for case_id in data["case_ids"]:
            case_in_firm(db, firm_id, case_id)
    if payload.kind in {"leave", "deadline"}:
        backup = user_in_firm(db, firm_id, data["backup_id"])
        if data["backup_id"] == payload.owner_id:
            fail("Yedek sorumlu farklı bir kişi olmalı.")
        grant = access_for(db, backup)
        if grant and (grant.position == "client" or (payload.case_id and payload.case_id not in grant.case_ids)):
            fail("Yedek sorumlunun ilgili dosyaya erişimi olmalı.")
    if payload.kind == "leave" and payload.status == "approved":
        start, end = date.fromisoformat(data["starts_on"]), date.fromisoformat(data["ends_on"])
        for other in db.query(ManagementRecord).filter(
            ManagementRecord.law_firm_id == firm_id, ManagementRecord.kind == "leave",
            ManagementRecord.status == "approved", ManagementRecord.owner_id == payload.owner_id,
            ManagementRecord.deleted_at.is_(None),
        ).all():
            if other.id != getattr(payload, "_record_id", None) and other.data["starts_on"] <= end.isoformat() and other.data["ends_on"] >= start.isoformat():
                fail("Bu kullanıcı için çakışan onaylı izin var.", 409)
    if payload.kind == "communication":
        client = get_record(db, firm_id, data["client_id"])
        if client.kind != "client" or client.deleted_at:
            fail("Geçerli müvekkil kaydı seçin.")
    document_ids = []
    if payload.kind == "approval" and data.get("document_id"):
        document_ids = [data["document_id"]]
    if payload.kind == "publication":
        document_ids = data["document_ids"]
        for audience in data["audience_ids"]:
            recipient = user_in_firm(db, firm_id, audience, active=False)
            access = access_for(db, recipient)
            if not access or access.position != "client" or payload.case_id not in access.case_ids:
                fail("Yayın alıcısının bu dosya için müvekkil erişimi olmalı.")
    for document_id in document_ids:
        document = db.query(Document).filter(Document.id == document_id, Document.law_firm_id == firm_id, Document.case_id == payload.case_id).first()
        if document is None:
            fail("Belge bu davaya ait değil.", 404)
    if payload.kind == "lead" and payload.status in {"contract", "documents", "opened"}:
        if data["conflict_decision"] != "clear" or not data["conflict_reason"].strip():
            fail("Önce taraf kontrolünü değerlendirip gerekçe kaydedin.")
        if payload.status == "opened" and not payload.case_id:
            fail("Açılan dava kaydını ilişkilendirin.")


def save_record(db, actor, firm_id, payload: RecordWrite, row=None, *, platform=False):
    if platform and payload.kind != "support":
        fail("Platform bu alanda yalnızca destek kaydı yönetebilir.", 403)
    before = record_out(row) if row else None
    if row:
        check_version(row, payload.version)
        if row.deleted_at:
            fail("Önce kaydı geri yükleyin.", 409)
        if row.kind != payload.kind:
            fail("Kayıt türü değiştirilemez.")
        # Leave overlap validation must not count the same row.
        object.__setattr__(payload, "_record_id", row.id)
    check_references(db, actor, firm_id, payload)
    if payload.kind == "approval":
        transitions = {"draft": {"draft", "review"}, "review": {"review", "changes", "approved"}, "changes": {"changes", "review"}, "approved": {"approved"}}
        if row is None and payload.status != "draft":
            fail("Onay kaydı taslak olarak başlamalı.")
        if row:
            if payload.status == "review" and payload.owner_id == row.created_by:
                fail("İnceleyici, kaydı hazırlayan kişiden farklı olmalı.")
            if payload.status not in transitions[row.status]:
                fail("Geçersiz onay aşaması.", 409)
            if row.status == "approved":
                fail("Onaylı sürüm değiştirilemez. Yeni bir inceleme kaydı açın.", 409)
            if row.status == "review" and payload.status in {"approved", "changes"}:
                if actor.id != row.owner_id:
                    fail("Kararı atanan inceleyici vermeli.", 403)
                if not payload.data["review_note"].strip():
                    fail("İnceleme notu yazın.")
                if payload.data["content"] != row.data["content"] or payload.data["document_id"] != row.data["document_id"] or payload.owner_id != row.owner_id:
                    fail("Karar sırasında içerik veya inceleyici değiştirilemez.")
            if payload.data["content"] != row.data["content"] or payload.data["document_id"] != row.data["document_id"]:
                if row.status == "review":
                    fail("İncelemedeki içerik değiştirilemez. Önce düzeltme isteyin.", 409)
                payload.data["revision"] = row.data["revision"] + 1
            else:
                payload.data["revision"] = row.data["revision"]
    if payload.kind == "deadline":
        if row is None and payload.status != "open":
            fail("Kritik süre açık olarak başlamalı.")
        if payload.status != "open" and not payload.data["verified"]:
            fail("Önce süre dayanağını doğrulayın.")
    if row is None:
        row = ManagementRecord(law_firm_id=firm_id, created_by=actor.id)
        db.add(row)
    for field in ("kind", "title", "status", "case_id", "owner_id", "due_date", "data"):
        setattr(row, field, getattr(payload, field))
    row.updated_at = now()
    flush(db)
    audit(db, actor, firm_id, "record.updated" if before else "record.created", row.kind, row.id, before, record_out(row))
    commit(db)
    return record_out(row)


def money_summary(records):
    groups = {}
    for row in records:
        if row.kind not in {"finance", "time"} or row.deleted_at:
            continue
        currency = row.data["currency"]
        key = (row.case_id, currency)
        bucket = groups.setdefault(key, {"case_id": row.case_id, "currency": currency, **{name: Decimal("0") for name in ["fee", "payment", "expense", "reimbursement", "advance", "advance_spend", "labor_cost"]}, "minutes": 0})
        if row.kind == "finance":
            bucket[row.data["entry_type"]] += Decimal(row.data["amount"])
        else:
            bucket["minutes"] += row.data["minutes"]
            bucket["labor_cost"] += Decimal(row.data["hourly_cost"]) * Decimal(row.data["minutes"]) / 60
    result = []
    for bucket in groups.values():
        bucket["fee_balance"] = bucket["fee"] - bucket["payment"]
        bucket["expense_balance"] = bucket["expense"] - bucket["reimbursement"]
        bucket["advance_balance"] = bucket["advance"] - bucket["advance_spend"]
        bucket["estimated_margin"] = bucket["fee"] - bucket["labor_cost"] - bucket["expense"] + bucket["reimbursement"]
        result.append({key: str(value.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)) if isinstance(value, Decimal) else value for key, value in bucket.items()})
    return result


def overview(db, actor):
    firm = actor.law_firm_id
    today = local_today()
    week_end = today + timedelta(days=7)
    cases = db.query(Case).filter(Case.law_firm_id == firm, Case.is_precedent.is_(False), Case.is_archived.is_(False)).all()
    active_cases = [c for c in cases if c.status != CaseStatus.KAPALI]
    case_map = {c.id: c for c in cases}
    tasks = db.query(Task).filter(Task.law_firm_id == firm, Task.status == TaskStatus.PENDING, Task.case_id.in_(case_map)).all()
    events = db.query(CalendarEvent).filter(CalendarEvent.law_firm_id == firm, CalendarEvent.starts_at >= datetime.combine(today, datetime.min.time()), CalendarEvent.starts_at < datetime.combine(week_end + timedelta(days=1), datetime.min.time())).all()
    events = [e for e in events if not e.case_id or (e.case_id in case_map and (e.event_type != CalendarEventType.HEARING or case_map[e.case_id].status != CaseStatus.KAPALI))]
    records = db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == firm, ManagementRecord.deleted_at.is_(None)).all()
    users = db.query(User).filter(User.law_firm_id == firm, User.is_active.is_(True), User.password_set_at.isnot(None)).all()
    grants = {a.user_id: a for a in db.query(WorkspaceAccess).filter(WorkspaceAccess.law_firm_id == firm).all()}
    alerts = []
    for c in active_cases:
        if not c.assigned_lawyer_id:
            alerts.append({"id": c.id, "title": c.case_name, "detail": "Sorumlu atanmamış", "tone": "warning", "href": f"/davalar/{c.id}"})
        if c.updated_at and c.updated_at.date() < today - timedelta(days=30):
            # This is explicitly record-update age, not proof no legal work happened.
            alerts.append({"id": f"stale:{c.id}", "title": c.case_name, "detail": "Dava ana kaydı 30 gündür güncellenmedi", "tone": "info", "href": f"/davalar/{c.id}"})
    for t in tasks:
        if t.due_date and t.due_date <= week_end:
            alerts.append({"id": t.id, "title": t.title, "detail": f"{'Gecikmiş görev' if t.due_date < today else 'Yaklaşan görev'} · {t.due_date.isoformat()}", "tone": "danger" if t.due_date < today else "warning", "href": f"/davalar/{t.case_id}"})
    for r in records:
        if r.kind == "deadline" and r.status != "completed" and r.due_date and r.due_date <= week_end:
            alerts.append({"id": r.id, "title": r.title, "detail": f"Kritik süre · {r.due_date.isoformat()} · {'Doğrulandı' if r.data['verified'] else 'Doğrulama bekliyor'}", "tone": "danger" if r.due_date <= today else "warning", "href": "/buro?tab=deadline"})
        if r.kind == "approval" and r.status == "review":
            alerts.append({"id": r.id, "title": r.title, "detail": "İnceleme bekliyor", "tone": "warning", "href": "/buro?tab=approval"})
        if r.kind == "client" and r.status == "active":
            contacts = [x.data["contact_date"] for x in records if x.kind == "communication" and x.data["client_id"] == r.id]
            last = max(contacts + ([r.data["contact_date"]] if r.data.get("contact_date") else []), default=None)
            if not last or last < (today - timedelta(days=30)).isoformat():
                alerts.append({"id": r.id, "title": r.title, "detail": "Son 30 gün için iletişim kaydı yok", "tone": "info", "href": "/buro?tab=client"})
    capacity = []
    for user in users:
        grant = grants.get(user.id) if user.role != UserRole.ADMIN else None
        if grant and grant.position == "client":
            continue
        leaves = [r for r in records if r.kind == "leave" and r.status == "approved" and r.owner_id == user.id and r.data["starts_on"] <= week_end.isoformat() and r.data["ends_on"] >= today.isoformat()]
        user_tasks = [t for t in tasks if t.assigned_to == user.id]
        week_events = [e for e in events if e.assignee_id == user.id]
        capacity.append({"id": user.id, "name": user.full_name, "department": user.department, "position": grant.position if grant else user.role.value,
            "active_cases": sum(c.assigned_lawyer_id == user.id for c in active_cases), "pending_tasks": len(user_tasks),
            "overdue_tasks": sum(bool(t.due_date and t.due_date < today) for t in user_tasks),
            "due_this_week": sum(bool(t.due_date and today <= t.due_date <= week_end) for t in user_tasks),
            "hearings": sum(e.event_type == CalendarEventType.HEARING for e in week_events),
            "scheduled_minutes": sum(e.duration_minutes for e in week_events), "leaves": [record_out(r) for r in leaves]})
    return {"today": today.isoformat(), "active_cases": len(active_cases), "pending_tasks": len(tasks),
        "overdue_tasks": sum(bool(t.due_date and t.due_date < today) for t in tasks),
        "unassigned_cases": sum(not c.assigned_lawyer_id for c in active_cases),
        "pending_approvals": sum(r.kind == "approval" and r.status == "review" for r in records),
        "upcoming_hearings": sum(e.event_type == CalendarEventType.HEARING for e in events),
        "alerts": sorted(alerts, key=lambda a: {"danger": 0, "warning": 1, "info": 2}[a["tone"]]),
        "capacity": capacity, "finance": money_summary(records)}


def normalized(text):
    return " ".join(unicodedata.normalize("NFKD", text.replace("ı", "i").replace("İ", "i")).casefold().split())


def conflict_search(db, firm_id, term):
    needle = normalized(term)
    if len(needle) < 3:
        fail("En az üç karakter girin.")
    cases = {c.id: c for c in db.query(Case).filter(Case.law_firm_id == firm_id, Case.is_precedent.is_(False)).all()}
    matches = []
    for party in db.query(CaseParty).filter(CaseParty.case_id.in_(cases)).all():
        if needle in normalized(party.name) or normalized(party.name) in needle:
            matches.append({"name": party.name, "role": party.role.value, "is_client": party.is_client, "case_id": party.case_id, "case_name": cases[party.case_id].case_name})
    # Include older cases without a populated parties relationship.
    for c in cases.values():
        for name, client in [(c.client_name, True), (c.opposing_party, False)]:
            if name and needle in normalized(name) and not any(m["case_id"] == c.id and m["name"] == name for m in matches):
                matches.append({"name": name, "role": "other", "is_client": client, "case_id": c.id, "case_name": c.case_name})
    return {"matches": matches, "notice": "Bu arama yalnızca bürodaki kayıtlı adları karşılaştırır. Sonucu bir avukat değerlendirmeli."}
