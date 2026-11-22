"""Firm-scoped administration of case ownership."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.case_access import require_case_writable
from app.api.deps import get_current_admin
from app.core.timeutil import local_today
from app.db.demo_template import add_demo_template
from app.db.session import get_db
from app.models.case import Case
from app.models.user import User, UserRole
from app.schemas.case import CaseAssignment, CaseOut, PrecedentReviewAssignment
from app.repositories.case_repository import CaseRepository
from app.schemas.user import UserOut, AdminLawyerOut
from app.services.hearing_dates import move_upcoming_hearings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/demo-template")
def import_demo_template(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Populate the current firm with fictional sample records once."""
    try:
        result = add_demo_template(db, admin)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.get("/lawyers", response_model=list[AdminLawyerOut])
def list_lawyers(include_demo: bool = False, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """The lawyers cases can be given to: active and past the invitation
    (a lawyer who has not chosen a password yet is not assignable)."""
    from app.models.management import WorkspaceAccess
    restricted = db.query(WorkspaceAccess.user_id).filter(WorkspaceAccess.law_firm_id == admin.law_firm_id)
    candidates = db.query(User).filter(
        User.law_firm_id == admin.law_firm_id,
        User.role == UserRole.LAWYER,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
    ).order_by(User.full_name).all()

    from app.db.demo_team import demo_case_ids, roster_ids
    sample_ids = roster_ids(admin.law_firm_id)
    restricted_ids = {row[0] for row in restricted.all()}
    result = []
    for lawyer in candidates:
        if lawyer.id in sample_ids and not include_demo:
            continue
        scope = demo_case_ids(db, lawyer)
        if lawyer.id in restricted_ids and not scope:
            continue
        # A known sample ID with a removed grant must never become full-access.
        if lawyer.id in sample_ids and not scope:
            continue
        result.append(AdminLawyerOut.model_validate(lawyer).model_copy(update={"demo_case_ids": scope}))
    return result


@router.patch("/cases/{case_id}/lawyer", response_model=CaseOut)
def assign_case_lawyer(
    case_id: str,
    payload: CaseAssignment,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    case = CaseRepository(db).get_by_id_in_firm_for_update(case_id, admin.law_firm_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Dava bulunamadı.")
    require_case_writable(case)
    lawyer = db.query(User).filter(
        User.id == payload.assigned_lawyer_id,
        User.law_firm_id == admin.law_firm_id,
        User.role == UserRole.LAWYER,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
    ).first()
    if lawyer is None:
        raise HTTPException(status_code=422, detail="Bu büroda aktif bir avukat seçin.")
    from app.services.management_service import access_for, audit
    from app.db.demo_team import demo_case_ids, roster_ids
    scope = demo_case_ids(db, lawyer)
    if lawyer.id in roster_ids(admin.law_firm_id):
        if not scope or case.id not in scope:
            raise HTTPException(422, "Örnek avukat yalnız yetkili olduğu örnek davalara atanabilir.")
    elif access_for(db, lawyer):
        raise HTTPException(422, "Dava sahipliği için tam erişimli bir avukat seçin.")
    previous = case.assigned_lawyer_id
    case.assigned_lawyer_id = lawyer.id
    move_upcoming_hearings(db, case, previous, lawyer.id, local_today())
    audit(db, admin, admin.law_firm_id, "case.assigned", "case", case.id, {"owner_id": previous}, {"owner_id": lawyer.id})
    db.commit()
    db.refresh(case)
    db.expire(case, ["assigned_lawyer"])  # the view-only relationship still points at the previous lawyer
    return case


@router.patch("/precedents/{precedent_id}/reviewer", response_model=CaseOut)
def assign_precedent_reviewer(
    precedent_id: str,
    payload: PrecedentReviewAssignment,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    precedent = db.query(Case).filter(
        Case.id == precedent_id, Case.law_firm_id == admin.law_firm_id,
        Case.is_precedent.is_(True),
    ).first()
    if precedent is None:
        raise HTTPException(status_code=404, detail="Precedent not found")
    reviewer = db.query(User).filter(
        User.id == payload.reviewer_lawyer_id,
        User.law_firm_id == admin.law_firm_id,
        User.role == UserRole.LAWYER,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
    ).first()
    if reviewer is None:
        raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
    from app.db.demo_team import roster_ids
    if reviewer.id in roster_ids(admin.law_firm_id):
        raise HTTPException(422, "Örnek avukat emsal inceleyicisi olarak atanamaz.")
    precedent.reviewer_lawyer_id = reviewer.id
    db.commit()
    db.refresh(precedent)
    return precedent
