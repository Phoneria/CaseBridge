from typing import Optional

from sqlalchemy.orm import Session

from app.models.document import Document


class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, document: Document) -> Document:
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[Document]:
        return (
            self.db.query(Document)
            .filter(Document.case_id == case_id, Document.law_firm_id == law_firm_id)
            .order_by(Document.uploaded_at.desc())
            .all()
        )

    def get_by_id_in_firm(self, document_id: str, law_firm_id: str) -> Optional[Document]:
        return (
            self.db.query(Document)
            .filter(Document.id == document_id, Document.law_firm_id == law_firm_id)
            .first()
        )

    def list_for_firm_with_case(self, law_firm_id: str) -> list[tuple[Document, str, str]]:
        from app.models.case import Case

        return (
            self.db.query(Document, Case.case_name, Case.case_number)
            .join(Case, Document.case_id == Case.id)
            .filter(Document.law_firm_id == law_firm_id)
            .order_by(Document.uploaded_at.desc())
            .all()
        )

    def delete(self, document: Document) -> None:
        self.db.delete(document)
        self.db.commit()
