from pydantic import BaseModel

from app.ai.case_intake import CaseIntakeDraft


class CaseIntakeExtractOut(BaseModel):
    draft: CaseIntakeDraft
    truncated: bool
    source_chars: int
