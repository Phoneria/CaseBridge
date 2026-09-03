from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.document import DocumentType


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    filename: str
    file_type: DocumentType
    extracted_text: Optional[str] = None
    uploaded_at: datetime


class DocumentWithCaseOut(DocumentOut):
    case_name: str
    case_number: str
