import os
import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document, DocumentType
from app.repositories.document_repository import DocumentRepository
from app.services.text_extraction import extract_text

_EXTENSION_TO_TYPE = {
    ".pdf": DocumentType.PDF,
    ".docx": DocumentType.DOCX,
    ".txt": DocumentType.TXT,
}


class DocumentService:
    def __init__(self, db: Session):
        self.db = db
        self.documents = DocumentRepository(db)

    def _resolve_type(self, filename: str) -> DocumentType:
        _, ext = os.path.splitext(filename.lower())
        if ext not in _EXTENSION_TO_TYPE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{ext}'. Allowed: pdf, docx, txt.",
            )
        return _EXTENSION_TO_TYPE[ext]

    def upload(
        self,
        case_id: str,
        law_firm_id: str,
        filename: str,
        raw_bytes: bytes,
        uploaded_by: Optional[str] = None,
    ) -> Document:
        file_type = self._resolve_type(filename)

        # filename comes straight from the client (multipart Content-
        # Disposition) - strip any path components so a crafted name
        # like "../../../etc/whatever" can never escape this case's
        # storage directory (path traversal).
        safe_filename = os.path.basename(filename)

        firm_dir = os.path.join(settings.storage_dir, law_firm_id, case_id)
        os.makedirs(firm_dir, exist_ok=True)
        stored_name = f"{uuid.uuid4()}_{safe_filename}"
        storage_path = os.path.join(firm_dir, stored_name)
        with open(storage_path, "wb") as f:
            f.write(raw_bytes)

        extracted_text = extract_text(file_type, raw_bytes)

        document = Document(
            case_id=case_id,
            law_firm_id=law_firm_id,
            filename=safe_filename,
            file_type=file_type,
            storage_path=storage_path,
            extracted_text=extracted_text,
            uploaded_by=uploaded_by,
        )
        return self.documents.create(document)

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[Document]:
        return self.documents.list_for_case(case_id, law_firm_id)

    def get(self, document_id: str, law_firm_id: str) -> Optional[Document]:
        return self.documents.get_by_id_in_firm(document_id, law_firm_id)

    def delete(self, document: Document) -> None:
        try:
            if os.path.exists(document.storage_path):
                os.remove(document.storage_path)
        except OSError:
            pass
        self.documents.delete(document)

    def list_for_firm_with_case(self, law_firm_id: str):
        return self.documents.list_for_firm_with_case(law_firm_id)
