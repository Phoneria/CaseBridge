"""Removes the seeded demo data when SEED_DEMO_DATA=false.

Only the demo firm is looked at; every other firm and its users are never
touched. A demo user (or the firm) that real work still points at - a case
somebody created, a task, a chat - is kept, so switching the flag never
destroys an office that kept using the demo accounts."""
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.purge import delete_cases
from app.models.case import Case
from app.models.courtroom import CourtroomSession
from app.models.law_firm import LawFirm
from app.models.user import User
from app.models.user_token import UserToken

SHOWCASE_PROMPT_VERSION = "showcase-v1"


@dataclass
class DemoCleanup:
    cases: int = 0
    hearings: int = 0
    users_removed: list[str] = field(default_factory=list)
    users_kept: list[str] = field(default_factory=list)
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


def remove_demo_data(
    db: Session, *, firm_name: str, case_numbers: list[str], emails: list[str]
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
