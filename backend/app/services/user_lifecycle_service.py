"""Deactivating and re-activating users. A user's open work has to move to
another lawyer in the same operation, so nothing is left with nobody."""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.case import Case, CaseStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.admin_user_lifecycle import TransferCounts, WorkloadCase, WorkloadOut, WorkloadTask
from app.services.user_admin_service import UserAdminError, ensure_not_last_admin
from app.services.user_token_service import invalidate_unused_tokens

OWN_ACCOUNT = "Kendi hesabınızı pasifleştiremezsiniz."
ALREADY_INACTIVE = "Kullanıcı zaten pasif."
TRANSFER_REQUIRED = "Açık davaları ve görevleri devretmek için bir avukat seçin."
TRANSFER_INVALID = "Devredilecek avukat geçersiz."


def _open_cases_filter(user: User):
    """Open = not closed, not archived and not a precedent."""
    return (
        Case.law_firm_id == user.law_firm_id,
        Case.assigned_lawyer_id == user.id,
        Case.is_precedent.is_(False),
        Case.is_archived.is_(False),
        Case.status != CaseStatus.KAPALI,
    )


def _pending_tasks_filter(user: User):
    return (
        Task.law_firm_id == user.law_firm_id,
        Task.assigned_to == user.id,
        Task.status == TaskStatus.PENDING,
    )


def _reviewed_precedents_filter(user: User):
    return (
        Case.law_firm_id == user.law_firm_id,
        Case.is_precedent.is_(True),
        Case.reviewer_lawyer_id == user.id,
    )


def get_workload(db: Session, user: User) -> WorkloadOut:
    cases = db.query(Case).filter(*_open_cases_filter(user)).order_by(Case.case_number).all()
    tasks = (
        db.query(Task, Case.case_name)
        .join(Case, Case.id == Task.case_id)
        .filter(*_pending_tasks_filter(user))
        .order_by(Task.created_at, Task.title)
        .all()
    )
    precedents = db.query(Case).filter(*_reviewed_precedents_filter(user)).count()
    return WorkloadOut(
        open_cases=[WorkloadCase(id=c.id, case_number=c.case_number, case_name=c.case_name) for c in cases],
        pending_tasks=[WorkloadTask(id=t.id, title=t.title, case_name=name) for t, name in tasks],
        precedents_reviewing=precedents,
    )


def _lock_statement(law_firm_id: str, user_ids: list[str]):
    """The user and the transfer target are locked in id order (no deadlock
    between two admins deactivating A->B and B->A); SQLite ignores FOR UPDATE."""
    return (
        select(User)
        .where(User.law_firm_id == law_firm_id, User.id.in_(user_ids))
        .order_by(User.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def _transfer_target(locked: dict[str, User], user: User, transfer_to: str) -> User:
    """An active lawyer of the same firm who has chosen a password, other
    than the user being deactivated (checked on the locked, fresh row)."""
    target = locked.get(transfer_to)
    if (
        target is None
        or target.id == user.id
        or target.law_firm_id != user.law_firm_id
        or target.role != UserRole.LAWYER
        or not target.is_active
        or target.password_set_at is None
    ):
        raise UserAdminError(422, TRANSFER_INVALID)
    return target


def deactivate_user(db: Session, admin: User, user: User, transfer_to: str | None) -> TransferCounts:
    """Moves the open work to `transfer_to` and deactivates the user in one
    transaction (the caller commits). Closed and archived cases stay with the
    user, as history."""
    if user.id == admin.id:
        raise UserAdminError(409, OWN_ACCOUNT)
    if not user.is_active:
        raise UserAdminError(409, ALREADY_INACTIVE)
    # One global lock order: admin rows (by id) first, then user + target (by id).
    ensure_not_last_admin(db, user)
    ids = [user.id] + ([transfer_to] if transfer_to is not None else [])
    locked = {u.id: u for u in db.execute(_lock_statement(user.law_firm_id, ids)).scalars()}
    if not user.is_active:
        raise UserAdminError(409, ALREADY_INACTIVE)

    workload = get_workload(db, user)
    has_work = bool(workload.open_cases or workload.pending_tasks or workload.precedents_reviewing)
    if has_work and transfer_to is None:
        raise UserAdminError(422, TRANSFER_REQUIRED)
    target = _transfer_target(locked, user, transfer_to) if transfer_to is not None else None

    counts = TransferCounts(cases=0, tasks=0, precedents=0)
    if target is not None:
        # Always run: work committed after the workload query is moved too.
        counts.cases = db.execute(
            update(Case).where(*_open_cases_filter(user)).values(assigned_lawyer_id=target.id)
            .execution_options(synchronize_session=False)
        ).rowcount
        counts.tasks = db.execute(
            update(Task).where(*_pending_tasks_filter(user)).values(assigned_to=target.id)
            .execution_options(synchronize_session=False)
        ).rowcount
        counts.precedents = db.execute(
            update(Case).where(*_reviewed_precedents_filter(user)).values(reviewer_lawyer_id=target.id)
            .execution_options(synchronize_session=False)
        ).rowcount

    user.is_active = False
    invalidate_unused_tokens(db, user.id)
    db.flush()
    return counts


def activate_user(db: Session, user: User) -> User:
    """Idempotent. A user who never chose a password stays 'pending'."""
    user.is_active = True
    db.flush()
    return user
