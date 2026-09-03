from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("", response_model=list[UserOut])
def list_users(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
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
