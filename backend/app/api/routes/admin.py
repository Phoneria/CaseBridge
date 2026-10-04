"""Firm-scoped administration of case ownership."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.case import Case
from app.models.user import User, UserRole
from app.schemas.case import CaseAssignment, CaseOut, PrecedentReviewAssignment
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/lawyers", response_model=list[UserOut])
def list_lawyers(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(User).filter(
        User.law_firm_id == admin.law_firm_id,
        User.role == UserRole.LAWYER,
    ).order_by(User.full_name).all()


@router.patch("/cases/{case_id}/lawyer", response_model=CaseOut)
def assign_case_lawyer(
    case_id: str,
    payload: CaseAssignment,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    case = db.query(Case).filter(
        Case.id == case_id, Case.law_firm_id == admin.law_firm_id,
        Case.is_precedent.is_(False),
    ).first()
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    lawyer = db.query(User).filter(
        User.id == payload.assigned_lawyer_id,
        User.law_firm_id == admin.law_firm_id,
        User.role == UserRole.LAWYER,
        User.is_active.is_(True),
    ).first()
    if lawyer is None:
        raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
    case.assigned_lawyer_id = lawyer.id
    db.commit()
    db.refresh(case)
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
    ).first()
    if reviewer is None:
        raise HTTPException(status_code=422, detail="Choose an active lawyer in this firm")
    precedent.reviewer_lawyer_id = reviewer.id
    db.commit()
    db.refresh(precedent)
    return precedent
