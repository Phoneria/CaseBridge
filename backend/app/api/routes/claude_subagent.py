"""Platform admin settings for the owner's Claude setup-token (personal use).

Only the platform admin may read or change it. Responses never contain the
token: only set / last 4 / dates / status and the allowed user accounts.
Every change writes a platform audit row (no value).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.ai.errors import AIProviderError
from app.ai.subagent import runner, store
from app.api.deps import get_current_platform_admin
from app.db.session import get_db
from app.models.law_firm import LawFirm
from app.models.user import User
from app.services.management_service import audit

router = APIRouter(prefix="/platform/claude-subagent", tags=["platform"])
TEST_SYSTEM = "Bu bir bağlantı testidir. Yalnızca OK yaz."


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=500)


class UsersIn(BaseModel):
    user_ids: list[str] = Field(default_factory=list, max_length=store.MAX_USERS)


def _user_rows(db: Session, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    rows = (db.query(User, LawFirm.name).join(LawFirm, LawFirm.id == User.law_firm_id)
            .filter(User.id.in_(ids)).all())
    by_id = {user.id: {"id": user.id, "full_name": user.full_name, "email": user.email, "firm_name": firm,
                       "is_active": bool(user.is_active), "is_platform_admin": bool(user.is_platform_admin)}
             for user, firm in rows}
    return [by_id[i] for i in ids if i in by_id]


def _status(db: Session) -> dict:
    status = store.public_status()
    return {k: v for k, v in status.items() if k != "user_ids"} | {"users": _user_rows(db, status["user_ids"])}


def _audit(db: Session, actor: User, action: str, after: Optional[dict] = None) -> None:
    audit(db, actor, actor.law_firm_id, action, "platform_admin", actor.id, after=after or {})
    db.commit()


def _fail(exc: store.SubagentConfigError):
    raise HTTPException(status_code=422, detail=str(exc)) from None


@router.get("")
def get_settings(actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    return _status(db)


@router.put("/token")
def save_token(payload: TokenIn, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    try:
        store.save_token(payload.token)
    except store.SubagentConfigError as exc:
        _fail(exc)
    _audit(db, actor, "claude_subagent.token_saved")
    return _status(db)


@router.delete("/token")
def remove_token(actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    try:
        store.delete_token()
    except store.SubagentConfigError as exc:
        _fail(exc)
    _audit(db, actor, "claude_subagent.token_removed")
    return _status(db)


@router.post("/test")
def test_token(actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    if not store.get_token():
        raise HTTPException(status_code=409, detail="Önce bir Claude setup-token kaydedin.")
    try:
        result = runner.run_sync(system_prompt=TEST_SYSTEM, prompt="reply with OK", firm_key="platform-test", timeout=60)
    except AIProviderError as exc:
        return {"ok": False, "message": str(exc), "status": store.public_status()["status"]}
    ok = "ok" in result.text.lower()
    store.mark_status("ok" if ok else "error")
    return {"ok": ok, "message": "Bağlantı çalışıyor." if ok else "Beklenmeyen yanıt alındı.", "status": store.public_status()["status"]}


@router.put("/users")
def set_users(payload: UsersIn, actor: User = Depends(get_current_platform_admin), db: Session = Depends(get_db)):
    ids = list(dict.fromkeys(payload.user_ids))
    found = {user.id: user for user in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    for user_id in ids:
        user = found.get(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
        if not user.is_active or user.password_set_at is None:
            raise HTTPException(status_code=422, detail="Aktif ve daveti kabul etmiş bir kullanıcı seçin.")
    try:
        store.set_user_ids(ids)
    except store.SubagentConfigError as exc:
        _fail(exc)
    _audit(db, actor, "claude_subagent.users_set", {"user_ids": ids})
    return _status(db)


@router.get("/users/search")
def search_users(q: str = Query(min_length=2, max_length=100), actor: User = Depends(get_current_platform_admin),
                 db: Session = Depends(get_db)):
    pattern = f"%{q.strip()}%"
    rows = (db.query(User).filter(User.is_active.is_(True), User.password_set_at.isnot(None),
                                  or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))
            .order_by(User.email).limit(10).all())
    return _user_rows(db, [user.id for user in rows])
