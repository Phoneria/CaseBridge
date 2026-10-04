"""Read-only archive of imported, anonymized judicial decisions.

Precedents are stored separately from the firm's caseload in all queries and
statistics. Their original rows and attached documents are preserved.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.models.case import Case, CaseEvent
from app.models.document import Document
from app.schemas.case import CaseDetailOut, CaseEventOut, CaseOut
from app.schemas.document import DocumentOut

router = APIRouter(prefix="/precedents", tags=["precedents"])


def _precedent_or_404(db: Session, precedent_id: str, law_firm_id: str) -> Case:
    precedent = db.query(Case).filter(
        Case.id == precedent_id, Case.law_firm_id == law_firm_id,
        Case.is_precedent.is_(True),
    ).first()
    if precedent is None:
        raise HTTPException(status_code=404, detail="Precedent not found")
    return precedent


@router.get("", response_model=list[CaseOut])
def list_precedents(
    law_firm_id: str = Depends(get_current_law_firm_id), db: Session = Depends(get_db),
):
    return db.query(Case).filter(
        Case.law_firm_id == law_firm_id, Case.is_precedent.is_(True),
    ).order_by(Case.opening_date.desc(), Case.case_number).all()


@router.get("/{precedent_id}", response_model=CaseDetailOut)
def get_precedent(
    precedent_id: str, law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    precedent = _precedent_or_404(db, precedent_id, law_firm_id)
    events = db.query(CaseEvent).filter(
        CaseEvent.case_id == precedent.id, CaseEvent.law_firm_id == law_firm_id,
    ).order_by(CaseEvent.event_date).all()
    return CaseDetailOut.model_validate(precedent).model_copy(
        update={"timeline": [CaseEventOut.model_validate(event) for event in events]}
    )


@router.get("/{precedent_id}/documents", response_model=list[DocumentOut])
def list_precedent_documents(
    precedent_id: str, law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    _precedent_or_404(db, precedent_id, law_firm_id)
    return db.query(Document).filter(
        Document.case_id == precedent_id, Document.law_firm_id == law_firm_id,
    ).order_by(Document.uploaded_at.desc()).all()
