from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import ProfileUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Name and department only; role, e-mail and password have their own
    endpoints (admin users, change-password)."""
    fields = payload.model_fields_set
    if "full_name" in fields:
        current_user.full_name = payload.full_name
    if "department" in fields:
        current_user.department = payload.department
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("", response_model=list[UserOut])
def list_users(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    """Colleagues who can be picked as assignee or attendee: active and past
    the invitation. The admin user list is GET /admin/users."""
    return UserRepository(db).list_in_firm(law_firm_id)


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    user = UserRepository(db).get_by_id_in_firm(user_id, law_firm_id)
    if user is None:
        # Deliberately 404, not 403: never confirm the resource exists
        # in another tenant.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
