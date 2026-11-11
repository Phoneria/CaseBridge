"""Operations owned by a bureau; platform accounts cannot act as customers."""
from datetime import datetime, time

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_user
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models.calendar import CalendarEvent
from app.models.case import Case, CaseStatus
from app.models.document import Document
from app.models.management import ManagementRecord, ManagementAudit, WorkspaceAccess, now
from app.models.management import FirmProfile, WorkTransfer
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.admin_user import AdminUserCreate
from app.schemas.management import AccessWrite, Kind, RecordWrite, ScopedInvite, VersionAction
from app.services.account_service import deliver, prepare_invite_email
from app.services.document_service import DocumentService
from app.services.management_service import (
    access_for, audit, case_in_firm, check_version, commit, conflict_search,
    fail, flush, get_record, money_summary, overview, record_out, save_record, transfer_management_work, transfer_out, user_in_firm,
)
from app.services.user_admin_service import UserAdminError, create_pending_user

router = APIRouter(prefix="/bureau", tags=["bureau"])


def bureau_admin(actor: User = Depends(get_current_admin)):
    if actor.is_platform_admin or actor.law_firm.is_platform:
        fail("Bu alan büro yöneticisine aittir.", 403)
    return actor


@router.get("/overview")
def get_overview(actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return overview(db, actor)


@router.get("/records")
def list_records(kind: Kind | None = None, deleted: bool = False, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    query = db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == actor.law_firm_id)
    query = query.filter(ManagementRecord.deleted_at.isnot(None) if deleted else ManagementRecord.deleted_at.is_(None))
    if kind:
        query = query.filter(ManagementRecord.kind == kind)
    return [record_out(r) for r in query.order_by(ManagementRecord.updated_at.desc(), ManagementRecord.id).all()]


@router.post("/records", status_code=201)
def create_record(payload: RecordWrite, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return save_record(db, actor, actor.law_firm_id, payload)


@router.put("/records/{record_id}")
def edit_record(record_id: str, payload: RecordWrite, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return save_record(db, actor, actor.law_firm_id, payload, get_record(db, actor.law_firm_id, record_id))


@router.post("/records/{record_id}/trash")
def trash_record(record_id: str, payload: VersionAction, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    row = get_record(db, actor.law_firm_id, record_id)
    check_version(row, payload.version)
    if row.deleted_at:
        fail("Kayıt zaten çöp kutusunda.", 409)
    if row.case_id:
        case_in_firm(db, actor.law_firm_id, row.case_id, writable=True)
    before = record_out(row)
    row.deleted_at = now()
    row.updated_at = now()
    flush(db)
    audit(db, actor, actor.law_firm_id, "record.trashed", row.kind, row.id, before, record_out(row), payload.reason)
    commit(db)
    return record_out(row)


@router.post("/records/{record_id}/restore")
def restore_record(record_id: str, payload: VersionAction, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    row = get_record(db, actor.law_firm_id, record_id)
    check_version(row, payload.version)
    if not row.deleted_at:
        fail("Kayıt çöp kutusunda değil.", 409)
    before = record_out(row)
    # Revalidate references: a grant or document may have been removed since trashing.
    from app.services.management_service import check_references
    body = RecordWrite(**{key: before[key] for key in ["kind", "title", "status", "case_id", "owner_id", "due_date", "data", "version"]})
    object.__setattr__(body, "_record_id", row.id)
    check_references(db, actor, actor.law_firm_id, body)
    row.deleted_at = None
    row.updated_at = now()
    flush(db)
    audit(db, actor, actor.law_firm_id, "record.restored", row.kind, row.id, before, record_out(row), payload.reason)
    commit(db)
    return record_out(row)


@router.get("/audit")
def list_audit(q: str = Query(default="", max_length=200), offset: int = Query(default=0, ge=0), actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return audit_rows(db, actor.law_firm_id, q, offset)


def audit_rows(db, firm_id, q="", offset=0):
    query = db.query(ManagementAudit).filter(ManagementAudit.law_firm_id == firm_id)
    if q:
        query = query.filter((ManagementAudit.action.ilike(f"%{q}%")) | (ManagementAudit.reason.ilike(f"%{q}%")) | (ManagementAudit.entity_id == q))
    total = query.count()
    rows = query.order_by(ManagementAudit.created_at.desc(), ManagementAudit.id).offset(offset).limit(100).all()
    names = {u.id: u.full_name for u in db.query(User).filter(User.id.in_([r.actor_id for r in rows])).all()}
    return {"total": total, "rows": [{"id": r.id, "actor_name": names.get(r.actor_id, "—"), "action": r.action, "entity_id": r.entity_id, "entity_type": r.entity_type, "reason": r.reason, "created_at": r.created_at.isoformat(), "before": r.before, "after": r.after} for r in rows]}


@router.get("/conflicts")
def conflicts(q: str = Query(min_length=3, max_length=255), actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return conflict_search(db, actor.law_firm_id, q)


@router.get("/access")
def list_access(actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return [{"user_id": a.user_id, "position": a.position, "case_ids": a.case_ids} for a in db.query(WorkspaceAccess).filter(WorkspaceAccess.law_firm_id == actor.law_firm_id).all()]


def write_access(db, actor, user, payload):
    if user.role == UserRole.ADMIN or user.is_platform_admin:
        fail("Yöneticinin erişimi bu alandan sınırlandırılamaz.")
    from app.services.user_lifecycle_service import get_workload
    workload = get_workload(db, user)
    if payload.position == "client" and (workload.open_cases or workload.pending_tasks or workload.management_work or workload.precedents_reviewing or workload.upcoming_events):
        fail("Bu hesabı müvekkil hesabına dönüştürmeden önce açık işlerini devredin.", 409)
    if any(case.id not in payload.case_ids for case in workload.open_cases):
        fail("Sorumlu olduğu dosyaların erişimini kaldırmadan önce işleri devredin.", 409)
    for case_id in payload.case_ids:
        case_in_firm(db, actor.law_firm_id, case_id)
    db.query(User).filter(User.id == user.id, User.law_firm_id == actor.law_firm_id).with_for_update().populate_existing().first()
    grant = access_for(db, user)
    before = {"position": grant.position, "case_ids": grant.case_ids} if grant else None
    if grant is None:
        grant = WorkspaceAccess(law_firm_id=actor.law_firm_id, user_id=user.id)
        db.add(grant)
    grant.position = payload.position
    grant.case_ids = sorted(set(payload.case_ids))
    audit(db, actor, actor.law_firm_id, "access.updated", "access", user.id, before, {"position": grant.position, "case_ids": grant.case_ids}, payload.reason)
    return grant


@router.put("/access/{user_id}")
def set_access(user_id: str, payload: AccessWrite, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    user = user_in_firm(db, actor.law_firm_id, user_id, active=False)
    grant = write_access(db, actor, user, payload)
    commit(db)
    return {"user_id": user.id, "position": grant.position, "case_ids": grant.case_ids}


@router.post("/access/invite", status_code=201)
def invite_scoped(payload: ScopedInvite, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    # Grant and user are persisted atomically before the invite can be used.
    try:
        user = create_pending_user(db, actor.law_firm_id, AdminUserCreate(full_name=payload.full_name, email=payload.email, role=UserRole.LAWYER))
        grant = write_access(db, actor, user, payload)
        commit(db)
    except UserAdminError as error:
        db.rollback()
        fail(error.detail, error.status_code)
    message = prepare_invite_email(db, user, actor)
    sent = deliver(message)
    return {"user_id": user.id, "position": grant.position, "case_ids": grant.case_ids, "email_sent": sent}


class TransferRequest(BaseModel):
    target_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=3, max_length=1000)


@router.post("/transfer/{user_id}")
def transfer_work(user_id: str, payload: TransferRequest, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    from app.services.user_lifecycle_service import _lock_statement, _open_cases_filter, _pending_tasks_filter, _reviewed_precedents_filter, _upcoming_events_filter
    db.execute(_lock_statement(actor.law_firm_id, sorted({user_id, payload.target_id}))).scalars().all()
    user = user_in_firm(db, actor.law_firm_id, user_id, active=False)
    target = user_in_firm(db, actor.law_firm_id, payload.target_id)
    if target.id == user.id or target.role != UserRole.LAWYER or access_for(db, target):
        fail("Devir için tam erişimli başka bir avukat seçin.")
    counts = {}
    for key, model, filters, values in [
        ("cases", Case, _open_cases_filter(user), {"assigned_lawyer_id": target.id}),
        ("tasks", Task, _pending_tasks_filter(user), {"assigned_to": target.id}),
        ("precedents", Case, _reviewed_precedents_filter(user), {"reviewer_lawyer_id": target.id}),
        ("events", CalendarEvent, _upcoming_events_filter(user), {"assignee_id": target.id}),
    ]:
        counts[key] = db.execute(update(model).where(*filters).values(**values).execution_options(synchronize_session=False)).rowcount
    counts["management"] = transfer_management_work(db, actor, user, target, payload.reason)
    db.add(WorkTransfer(law_firm_id=actor.law_firm_id, from_user_id=user.id, to_user_id=target.id, created_by=actor.id, reason=payload.reason, counts=counts))
    audit(db, actor, actor.law_firm_id, "work.transferred", "user", user.id, None, {"target_id": target.id, "counts": counts}, payload.reason)
    commit(db)
    return counts


@router.get("/transfers")
def list_transfers(actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    return [transfer_out(r) for r in db.query(WorkTransfer).filter(WorkTransfer.law_firm_id == actor.law_firm_id).order_by(WorkTransfer.created_at.desc()).all()]


def workspace_case_ids(db, actor):
    assigned = db.query(Case.id).filter(Case.law_firm_id == actor.law_firm_id, Case.assigned_lawyer_id == actor.id, Case.is_precedent.is_(False)).all()
    work = db.query(ManagementRecord.case_id).filter(ManagementRecord.law_firm_id == actor.law_firm_id, ManagementRecord.owner_id == actor.id, ManagementRecord.kind.in_(["approval", "deadline", "checklist"]), ManagementRecord.deleted_at.is_(None)).all()
    return sorted({r[0] for r in assigned + work if r[0]})


@router.get("/workspace")
def scoped_workspace(response: Response, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    grant = access_for(db, actor)
    if not grant:
        from types import SimpleNamespace
        grant = SimpleNamespace(position="lawyer", case_ids=workspace_case_ids(db, actor))
    cases = db.query(Case).filter(Case.law_firm_id == actor.law_firm_id, Case.id.in_(grant.case_ids), Case.is_precedent.is_(False)).all()
    case_ids = [c.id for c in cases]
    records = db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == actor.law_firm_id, ManagementRecord.case_id.in_(case_ids), ManagementRecord.deleted_at.is_(None)).all()
    if grant.position == "client":
        publications = [r for r in records if r.kind == "publication" and r.status == "published" and actor.id in r.data["audience_ids"]]
        visible_ids = {r.case_id for r in publications}
        documents = {doc_id for r in publications for doc_id in r.data["document_ids"]}
        docs = db.query(Document).filter(Document.id.in_(documents), Document.law_firm_id == actor.law_firm_id, Document.case_id.in_(visible_ids)).all()
        return {"position": "client", "cases": [{"id": c.id, "name": c.case_name} for c in cases if c.id in visible_ids],
            "publications": [{"id": r.id, "title": r.title, "case_id": r.case_id, "message": r.data["message"], "request": r.data["request"], "appointment": r.data["appointment"], "financial_summary": r.data["financial_summary"]} for r in publications],
            "documents": [{"id": d.id, "filename": d.filename, "case_id": d.case_id} for d in docs]}
    visible_kinds = {"deadline", "checklist", "approval"} if grant.position != "accountant" else {"finance", "time"}
    visible_records = [r for r in records if r.kind in visible_kinds]
    tasks = db.query(Task).filter(Task.law_firm_id == actor.law_firm_id, Task.case_id.in_(case_ids)).all() if grant.position != "accountant" else []
    docs = db.query(Document).filter(Document.law_firm_id == actor.law_firm_id, Document.case_id.in_(case_ids)).all() if grant.position != "accountant" else []
    transfers = db.query(WorkTransfer).filter(WorkTransfer.law_firm_id == actor.law_firm_id, WorkTransfer.to_user_id == actor.id).order_by(WorkTransfer.created_at.desc()).all()
    return {"position": grant.position, "transfers": [transfer_out(r) for r in transfers], "cases": [{"id": c.id, "name": c.case_name, "number": c.case_number, "status": c.status.value} for c in cases],
        "documents": [{"id": d.id, "filename": d.filename, "case_id": d.case_id} for d in docs],
        "records": [record_out(r) for r in visible_records], "finance": money_summary(visible_records) if grant.position == "accountant" else [],
        "tasks": [{"id": t.id, "case_id": t.case_id, "title": t.title, "status": t.status.value, "assigned_to": t.assigned_to, "due_date": t.due_date.isoformat() if t.due_date else None} for t in tasks]}


@router.get("/workspace/documents/{document_id}")
def scoped_download(document_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    grant = access_for(db, actor)
    if not grant:
        from types import SimpleNamespace
        grant = SimpleNamespace(position="lawyer", case_ids=workspace_case_ids(db, actor))
    if grant.position == "accountant":
        fail("Belge bulunamadı.", 404)
    permitted = db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == actor.law_firm_id, ManagementRecord.kind == "publication", ManagementRecord.status == "published", ManagementRecord.deleted_at.is_(None), ManagementRecord.case_id.in_(grant.case_ids)).all()
    case_ids = {r.case_id for r in permitted if actor.id in r.data["audience_ids"] and document_id in r.data["document_ids"]} if grant.position == "client" else set(grant.case_ids)
    document = db.query(Document).filter(Document.id == document_id, Document.law_firm_id == actor.law_firm_id, Document.case_id.in_(case_ids)).first()
    path = DocumentService(db).resolve_download_path(document) if document else None
    if path is None:
        fail("Belge bulunamadı.", 404)
    audit(db, actor, actor.law_firm_id, "document.downloaded", "document", document.id)
    commit(db)
    return FileResponse(path, filename=document.filename, headers={"Cache-Control": "no-store"})


class Decision(BaseModel):
    version: int = Field(ge=1)
    status: str = Field(max_length=32)
    note: str = Field(default="", max_length=10000)


@router.post("/workspace/transfers/{transfer_id}/accept")
def accept_transfer(transfer_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    grant = access_for(db, actor)
    if grant and grant.position in {"client", "accountant"}:
        fail("Devir kaydı bulunamadı.", 404)
    row = db.query(WorkTransfer).filter(WorkTransfer.id == transfer_id, WorkTransfer.law_firm_id == actor.law_firm_id, WorkTransfer.to_user_id == actor.id).with_for_update().populate_existing().first()
    if row is None:
        fail("Devir kaydı bulunamadı.", 404)
    if row.accepted_at is None:
        row.accepted_at = now()
        audit(db, actor, actor.law_firm_id, "work.accepted", "transfer", row.id)
        commit(db)
    return transfer_out(row)


@router.post("/workspace/records/{record_id}/decision")
def scoped_decision(record_id: str, payload: Decision, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_record(db, actor.law_firm_id, record_id)
    grant = access_for(db, actor)
    if row.owner_id != actor.id or (grant and (grant.position in {"client", "accountant"} or row.case_id not in grant.case_ids)):
        fail("Bu işlem için yetkiniz yok.", 403)
    data = dict(row.data)
    if row.kind == "approval" and payload.status in {"approved", "changes"}:
        data["review_note"] = payload.note
    elif row.kind == "deadline" and payload.status in {"acknowledged", "completed"}:
        pass
    else:
        fail("Geçersiz işlem.")
    body = RecordWrite(kind=row.kind, title=row.title, status=payload.status, case_id=row.case_id, owner_id=row.owner_id, due_date=row.due_date, data=data, version=payload.version)
    return save_record(db, actor, actor.law_firm_id, body, row)


class ChecklistStepUpdate(BaseModel):
    version: int = Field(ge=1)
    index: int = Field(ge=0, le=99)
    done: bool


@router.post("/workspace/records/{record_id}/step")
def update_checklist_step(record_id: str, payload: ChecklistStepUpdate, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = get_record(db, actor.law_firm_id, record_id)
    grant = access_for(db, actor)
    if row.kind != "checklist" or row.owner_id != actor.id or (grant and (grant.position in {"client", "accountant"} or row.case_id not in grant.case_ids)):
        fail("Bu işlem için yetkiniz yok.", 403)
    items = [dict(item) for item in row.data["items"]]
    if payload.index >= len(items):
        fail("Adım bulunamadı.", 404)
    check_version(row, payload.version)
    prerequisite = items[payload.index]["depends_on"]
    if payload.done and prerequisite is not None and not items[prerequisite]["done"]:
        fail("Önce bağımlı adımı tamamlayın.")
    items[payload.index]["done"] = payload.done
    if not payload.done:
        for index in range(payload.index + 1, len(items)):
            depends = items[index]["depends_on"]
            if depends is not None and not items[depends]["done"]:
                items[index]["done"] = False
    body = RecordWrite(kind=row.kind, title=row.title, status="completed" if all(i["done"] for i in items) else "open", case_id=row.case_id, owner_id=row.owner_id, due_date=row.due_date, data={**row.data, "items": items}, version=payload.version)
    return save_record(db, actor, actor.law_firm_id, body, row)


@router.post("/workspace/tasks/{task_id}/complete")
def complete_workspace_task(task_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id, Task.law_firm_id == actor.law_firm_id).with_for_update().first()
    grant = access_for(db, actor)
    if not task or task.assigned_to != actor.id or (grant and (grant.position in {"client", "accountant"} or task.case_id not in grant.case_ids)):
        fail("Görev bulunamadı.", 404)
    case_in_firm(db, actor.law_firm_id, task.case_id, writable=True)
    task.status = TaskStatus.COMPLETED
    task.completed_at = now()
    audit(db, actor, actor.law_firm_id, "task.completed", "task", task.id)
    commit(db)
    return {"id": task.id, "status": "completed"}


class AIBudget(BaseModel):
    version: int = Field(ge=0)
    token_budget: int = Field(ge=0, le=1000000000000)
    cost_per_million: str = Field(pattern=r"^\d{1,8}(\.\d{1,4})?$")
    currency: str = Field(pattern=r"^(TRY|USD|EUR)$")


@router.get("/ai-usage")
def bureau_ai_usage(actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    from decimal import Decimal
    from app.services.ai_usage_service import get_ai_usage
    from app.models.simulation import Simulation
    from app.models.chat import ChatMessage
    from app.models.courtroom import CourtroomSession
    usage = get_ai_usage(db, actor.law_firm_id)
    start = datetime.fromisoformat(usage["period_start"])
    profile = db.get(FirmProfile, actor.law_firm_id)
    policy = (profile.data if profile else {}).get("ai_budget", {"token_budget": 0, "cost_per_million": "0", "currency": "USD"})
    sims = db.query(Simulation).filter(Simulation.law_firm_id == actor.law_firm_id, Simulation.started_at >= start).all()
    chats = db.query(ChatMessage).filter(ChatMessage.law_firm_id == actor.law_firm_id, ChatMessage.created_at >= start, ChatMessage.role == "assistant").all()
    courts = db.query(CourtroomSession).filter(CourtroomSession.law_firm_id == actor.law_firm_id, CourtroomSession.created_at >= start).all()
    return {**usage, "policy": policy, "version": profile.version if profile else 0,
        "budget_exceeded": bool(policy["token_budget"] and usage["used_tokens"] >= policy["token_budget"]),
        "estimated_cost": str((Decimal(policy["cost_per_million"]) * usage["used_tokens"] / 1000000).quantize(Decimal(".0001"))),
        "operations": [
            {"name": "Dosya analizi", "count": len(sims), "failed": sum(r.status.value == "failed" for r in sims)},
            {"name": "Hukuk asistanı", "count": len(chats), "failed": sum(r.status and r.status.value == "error" for r in chats)},
            {"name": "Duruşma oturumu", "count": len(courts), "failed": sum(r.status.value == "failed" for r in courts)},
        ], "coverage": "Token ve maliyet hesabı kaydedilmiş analiz/sohbet tokenlarını kapsar; ses, belge alımı ve duruşmanın ölçülmeyen kullanımı dahil değildir. Bütçe bir uyarı eşiğidir; sağlayıcı faturasını veya harcama sınırını değiştirmez."}


@router.put("/ai-budget")
def update_budget(payload: AIBudget, actor: User = Depends(bureau_admin), db: Session = Depends(get_db)):
    profile = db.query(FirmProfile).filter(FirmProfile.law_firm_id == actor.law_firm_id).with_for_update().populate_existing().first()
    if profile:
        check_version(profile, payload.version)
    elif payload.version != 0:
        fail("Ayar değişti. Yenileyin.", 409)
    if not profile:
        profile = FirmProfile(law_firm_id=actor.law_firm_id, data={})
        db.add(profile)
    before = profile.data.get("ai_budget")
    policy = payload.model_dump(exclude={"version"})
    profile.data = {**profile.data, "ai_budget": policy}
    audit(db, actor, actor.law_firm_id, "ai.budget_updated", "ai", actor.law_firm_id, before, policy)
    commit(db)
    return bureau_ai_usage(actor, db)
