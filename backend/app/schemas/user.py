from app.models.user import UserRole
from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    department: str | None = None
    gender: str | None = None
    role: UserRole
    law_firm_id: str
    is_active: bool
