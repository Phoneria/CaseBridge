from typing import Optional

from pydantic import BaseModel


class AIStatusOut(BaseModel):
    provider: str
    configured: bool
    error: Optional[str] = None
