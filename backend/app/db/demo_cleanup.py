"""Removes the seeded demo data when SEED_DEMO_DATA=false.

Only the demo firm is looked at; every other firm and its users are never
touched. A demo user (or the firm) that real work still points at - a case
somebody created, a task, a chat - is kept, so switching the flag never
destroys an office that kept using the demo accounts. A kept account loses
the published demo password: it becomes "Davet bekliyor" (pending) and an
administrator can send it an invite or a reset link."""
import secrets
from dataclasses import dataclass, field

from sqlalchemy import func, null, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.db.purge import delete_cases
from app.models.case import Case
from app.models.courtroom import CourtroomSession
from app.models.law_firm import LawFirm
from app.models.user import User
from app.models.user_token import UserToken
from app.services.user_token_service import invalidate_unused_tokens

SHOWCASE_PROMPT_VERSION = "showcase-v1"


@dataclass
class DemoCleanup:
    cases: int = 0
    hearings: int = 0
    users_removed: list[str] = field(default_factory=list)
    users_kept: list[str] = field(default_factory=list)
    # Kept accounts whose demo password was revoked in this run.
    passwords_revoked: list[str] = field(default_factory=list)
    firm_removed: bool = False


def count_references(db: Session, table_name: str, row_id: str, ignore: tuple[str, ...] = ()) -> int:
    """Rows in all tables whose foreign key points at `table_name`.id = row_id."""
    total = 0
    for table in Base.metadata.sorted_tables:
        if table.name in ignore:
            continue
        for key in table.foreign_keys:
            if key.column.table.name == table_name and key.column.name == "id":
                total += db.execute(
                    select(func.count()).select_from(table).where(table.c[key.parent.name] == row_id)
                ).scalar_one()
    return total


def _revoke_demo_password(db: Session, user: User, demo_password: str) -> bool:
    """A kept demo account that still signs in with the published demo
    password becomes pending: no password (password_set_at NULL, which also
    ends its sessions), an unusable random hash and no usable link. is_active
    is left as it is. An account whose password somebody chose afterwards
    (through an invite or reset link) is left alone, so running the seed again
    never takes a real password away. True when something was revoked."""
    if user.password_set_at is None or not verify_password(demo_password, user.hashed_password):
        return False
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    user.password_set_at = null()
    invalidate_unused_tokens(db, user.id)
    return True


def remove_demo_data(
    db: Session, *, firm_name: str, case_numbers: list[str], emails: list[str], demo_password: str
) -> DemoCleanup:
    result = DemoCleanup()
    firm = db.query(LawFirm).filter(LawFirm.name == firm_name).first()
    if firm is None:
        return result

    stale = db.query(Case).filter(Case.law_firm_id == firm.id, Case.case_number.in_(case_numbers)).all()
    result.cases = delete_cases(db, stale)

    users = db.query(User).filter(User.law_firm_id == firm.id, User.email.in_(emails)).all()
    user_ids = [user.id for user in users]
    if user_ids:
        showcases = db.query(CourtroomSession).filter(
            CourtroomSession.user_id.in_(user_ids),
            CourtroomSession.prompt_version == SHOWCASE_PROMPT_VERSION,
        ).all()
        for session in showcases:
            db.delete(session)
        result.hearings = len(showcases)
        db.flush()

    for user in users:
        if count_references(db, "users", user.id, ignore=("user_tokens",)) > 0:
            result.users_kept.append(user.email)
            if _revoke_demo_password(db, user, demo_password):
                result.passwords_revoked.append(user.email)
            continue
        db.query(UserToken).filter(UserToken.user_id == user.id).delete(synchronize_session=False)
        db.query(UserToken).filter(UserToken.created_by == user.id).update(
            {UserToken.created_by: None}, synchronize_session=False
        )
        db.delete(user)
        result.users_removed.append(user.email)
    db.flush()

    if count_references(db, "law_firms", firm.id) == 0:
        db.delete(firm)
        result.firm_removed = True
        db.flush()
    return result
