"""Commercial/operational metadata only. Never returns customer case content."""
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_platform_admin
from app.core.timeutil import utc_now
from app.db.session import get_db
from app.models.calendar import ReminderDelivery, ReminderDeliveryStatus
from app.models.case import Case
from app.models.document import Document
from app.models.management import FirmProfile, ManagementRecord
from app.models.simulation import Simulation, SimulationStatus
from app.models.user import User, UserStatus
from app.schemas.management import ProfileWrite, RecordWrite, VersionAction
from app.services.ai_credentials import key_status
from app.services.management_service import audit, check_version, commit, fail, flush, get_record, record_out, save_record
from app.services.platform_service import get_customer_firm
from app.services.user_admin_service import UserAdminError
from app.api.routes.bureau import audit_rows

router = APIRouter(prefix="/platform/firms", tags=["platform"])


def firm_or_404(db, firm_id):
    try:
        return get_customer_firm(db, firm_id)
    except UserAdminError as error:
        fail(error.detail, error.status_code)


def usage_metadata(db, firm):
    users = db.query(User).filter(User.law_firm_id == firm.id).all()
    docs = db.query(Document).filter(Document.law_firm_id == firm.id).all()
    # Only stored file sizes are aggregated; paths and document names never leave this route.
    storage_bytes = 0
    missing_files = 0
    from app.services.document_service import DocumentService
    for doc in docs:
        path = DocumentService(db).resolve_download_path(doc)
        if path and Path(path).is_file():
            storage_bytes += Path(path).stat().st_size
        else:
            missing_files += 1
    cutoff = utc_now().replace(tzinfo=None) - timedelta(days=30)
    jobs = db.query(Simulation).filter(Simulation.law_firm_id == firm.id, Simulation.started_at >= cutoff).all()
    return {
        "active_users": sum(u.status == UserStatus.ACTIVE for u in users),
        "pending_invites": sum(u.status == UserStatus.PENDING for u in users),
        "active_7d": sum(bool(u.last_seen_at and u.last_seen_at.replace(tzinfo=None) >= utc_now().replace(tzinfo=None) - timedelta(days=7)) for u in users),
        "active_30d": sum(bool(u.last_seen_at and u.last_seen_at.replace(tzinfo=None) >= cutoff) for u in users),
        "case_count": db.query(Case).filter(Case.law_firm_id == firm.id, Case.is_precedent.is_(False)).count(),
        "document_count": len(docs), "storage_bytes": storage_bytes, "missing_files": missing_files,
        "failed_jobs_30d": sum(j.status == SimulationStatus.FAILED for j in jobs),
        "pending_jobs": db.query(Simulation).filter(Simulation.law_firm_id == firm.id, Simulation.status.in_([SimulationStatus.PENDING, SimulationStatus.RUNNING])).count(),
        "failed_reminders": db.query(ReminderDelivery).filter(ReminderDelivery.law_firm_id == firm.id, ReminderDelivery.status == ReminderDeliveryStatus.FAILED).count(),
    }


@router.get("/{firm_id}/profile")
def profile_detail(firm_id: str, response: Response, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    firm = firm_or_404(db, firm_id)
    profile = db.get(FirmProfile, firm.id)
    metadata = usage_metadata(db, firm)
    ai = key_status(firm.id)
    return {"id": firm.id, "name": firm.name, "is_active": firm.is_active,
        "profile": profile.data if profile else {}, "version": profile.version if profile else 0,
        "usage": metadata, "onboarding": [
            {"label": "Yönetici daveti kabul edildi", "done": any(u.status == UserStatus.ACTIVE and u.role.value == "admin" for u in firm.users), "next_action": "Yönetici davetini takip edin", "owner": "Büro yöneticisi"},
            {"label": "Ekip oluşturuldu", "done": metadata["active_users"] > 1, "next_action": "Ekip üyelerini davet edin", "owner": "Büro yöneticisi"},
            {"label": "Büroya özel AI anahtarı aktif", "done": ai["managed"] and ai["configured"], "next_action": "Ayarlar üzerinden anahtarı test edip aktifleştirin", "owner": "Büro yöneticisi"},
            {"label": "İlk dava kaydı açıldı", "done": metadata["case_count"] > 0, "next_action": "İlk dava kaydını oluşturun", "owner": "Büro ekibi"},
        ], "ai": {"configured": ai["configured"], "pending": ai["pending"]}}


@router.put("/{firm_id}/profile")
def update_profile(firm_id: str, payload: ProfileWrite, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm = firm_or_404(db, firm_id)
    profile = db.query(FirmProfile).filter(FirmProfile.law_firm_id == firm.id).with_for_update().populate_existing().first()
    if profile:
        check_version(profile, payload.version)
    elif payload.version != 0:
        fail("Profil değişti. Yenileyin.", 409)
    before = dict(profile.data) if profile else None
    if profile is None:
        profile = FirmProfile(law_firm_id=firm.id, data={})
        db.add(profile)
    profile.data = {**profile.data, **payload.model_dump(mode="json", exclude={"version", "reason"})}
    flush(db)
    audit(db, actor, firm.id, "profile.updated", "firm", firm.id, before, profile.data, payload.reason)
    commit(db)
    return {"profile": profile.data, "version": profile.version}


@router.get("/{firm_id}/support")
def list_support(firm_id: str, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm_or_404(db, firm_id)
    return [record_out(r) for r in db.query(ManagementRecord).filter(ManagementRecord.law_firm_id == firm_id, ManagementRecord.kind == "support", ManagementRecord.deleted_at.is_(None)).order_by(ManagementRecord.updated_at.desc()).all()]


@router.post("/{firm_id}/support", status_code=201)
def create_support(firm_id: str, payload: RecordWrite, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm_or_404(db, firm_id)
    if payload.case_id:
        fail("Platform destek kaydına dava bağlanamaz.")
    return save_record(db, actor, firm_id, payload, platform=True)


@router.put("/{firm_id}/support/{record_id}")
def update_support(firm_id: str, record_id: str, payload: RecordWrite, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm_or_404(db, firm_id)
    row = get_record(db, firm_id, record_id)
    if row.kind != "support" or payload.case_id:
        fail("Kayıt bulunamadı.", 404)
    return save_record(db, actor, firm_id, payload, row, platform=True)


@router.get("/{firm_id}/history")
def platform_history(firm_id: str, q: str = Query(default="", max_length=200), offset: int = Query(default=0, ge=0), actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    firm_or_404(db, firm_id)
    # Customer records/notes must not be exposed through platform audit history.
    from app.models.management import ManagementAudit
    query = db.query(ManagementAudit).filter(ManagementAudit.law_firm_id == firm_id, ManagementAudit.entity_type.in_(["firm", "support", "platform_admin"]))
    if q:
        query = query.filter((ManagementAudit.action.ilike(f"%{q}%")) | (ManagementAudit.reason.ilike(f"%{q}%")))
    total = query.count()
    rows = query.order_by(ManagementAudit.created_at.desc()).offset(offset).limit(100).all()
    names = {u.id: u.full_name for u in db.query(User).filter(User.id.in_([r.actor_id for r in rows])).all()}
    return {"total": total, "rows": [{"id": r.id, "actor_name": names.get(r.actor_id, "—"), "action": r.action, "entity_type": r.entity_type, "entity_id": r.entity_id, "reason": r.reason, "created_at": r.created_at.isoformat()} for r in rows]}
