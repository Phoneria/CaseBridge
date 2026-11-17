from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.case_access import require_case_id_writable, require_case_writable
from app.api.deps import get_current_law_firm_id, get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.case import Case
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentWithCaseOut
from app.services.audit import record_audit
from app.services.case_service import CaseService
from app.services.document_service import DocumentService

cases_router = APIRouter(prefix="/cases", tags=["documents"])
documents_router = APIRouter(prefix="/documents", tags=["documents"])


def _get_owned_case_or_404(db: Session, case_id: str, law_firm_id: str):
    case = CaseService(db).get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _file_flags(document) -> dict:
    kind = document.file_type.value if document.file_type.value in {"pdf", "docx", "txt"} else "other"
    return {"file_kind": kind, "text_extracted": "yes" if (document.extracted_text or "").strip() else "no"}


@cases_router.post("/{case_id}/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    case_id: str,
    file: UploadFile = File(...),
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = _get_owned_case_or_404(db, case_id, law_firm_id)
    require_case_writable(case)
    raw_bytes = await file.read()
    if len(raw_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.max_upload_size_bytes} byte upload limit.",
        )
    document = DocumentService(db).upload(
        case_id=case_id,
        law_firm_id=law_firm_id,
        filename=file.filename,
        raw_bytes=raw_bytes,
        uploaded_by=current_user.id,
    )
    record_audit(db, current_user, "document.uploaded", case=case, target_type="document", target_id=document.id,
                 counts={"size_kb": max(1, len(raw_bytes) // 1024)}, flags=_file_flags(document))
    return document


@cases_router.get("/{case_id}/documents", response_model=list[DocumentOut])
def list_documents(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    _get_owned_case_or_404(db, case_id, law_firm_id)
    return DocumentService(db).list_for_case(case_id, law_firm_id)


@documents_router.get("", response_model=list[DocumentWithCaseOut])
def list_all_documents(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    rows = DocumentService(db).list_for_firm_with_case(law_firm_id)
    return [
        DocumentWithCaseOut(
            **DocumentOut.model_validate(document, from_attributes=True).model_dump(),
            case_name=case_name,
            case_number=case_number,
        )
        for document, case_name, case_number in rows
    ]


_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain; charset=utf-8",
}


@documents_router.get("/{document_id}/download")
def download_document(
    document_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    service = DocumentService(db)
    document = service.get(document_id, law_firm_id)
    path = service.resolve_download_path(document) if document is not None else None
    if path is None:
        # Same answer for "not yours" and "file gone" - no information leak.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return FileResponse(
        path,
        media_type=_MEDIA_TYPES.get(document.file_type.value, "application/octet-stream"),
        filename=document.filename,
    )


@documents_router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = DocumentService(db)
    document = service.get(document_id, law_firm_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    require_case_id_writable(db, document.case_id, law_firm_id)
    case = db.get(Case, document.case_id)
    flags = _file_flags(document)
    service.delete(document)
    record_audit(db, current_user, "document.deleted", case=case, target_type="document", target_id=document_id,
                 flags=flags)
