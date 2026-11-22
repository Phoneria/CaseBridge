"""Upgrade only identifiable records owned by a bureau's demonstration catalog."""
from sqlalchemy import select

from app.db.demo_presentation_seed import identity
from app.models.case import Case
from app.models.management import ManagementAudit, WorkspaceAccess
from app.models.user import User


def extend_generated_scope(db, firm, member, previous_ids, new_ids):
    grant = db.query(WorkspaceAccess).filter_by(law_firm_id=firm, user_id=member.id, position="lawyer").first()
    if not grant or not previous_ids or set(grant.case_ids) != set(previous_ids):
        return
    edited = db.query(ManagementAudit.id).filter_by(law_firm_id=firm, entity_id=member.id, action="access.updated").first()
    if not edited:
        grant.case_ids = sorted(set(grant.case_ids) | set(new_ids))


def retire_old_roster(db, admin):
    from app.db.demo_template_removal import removal_plan
    firm = admin.law_firm_id
    retired = {identity(firm, f"team-lawyer:{i}") for i in range(4, 12)} | {identity(firm, "member:lawyer")}
    old = db.query(User).filter(User.law_firm_id == firm, User.id.in_(retired), User.is_active.is_(True)).all()
    if not old:
        return
    removable, _ = removal_plan(db, admin)
    for member in old:
        if member.id in removable.get("users", set()):
            member.is_active = False


def upgrade_numbers(db, firm, numbers):
    from fastapi import HTTPException
    for case in db.scalars(select(Case).where(Case.law_firm_id == firm,
                          Case.case_number.in_(["ÖRNEK-" + n for n in numbers]))):
        if not (case.description or "").startswith("[ÖRNEK ŞABLON] "):
            raise HTTPException(409, "Gösterim dosyasının numarası başka bir kayda ait.")
        new_number = "CB-" + case.case_number.removeprefix("ÖRNEK-")
        if db.query(Case.id).filter_by(law_firm_id=firm, case_number=new_number).first():
            raise HTTPException(409, "Gösterim dosyasının yeni numarası başka bir kayda ait.")
        case.case_number = new_number
        case.description = "[Gösterim] " + case.description.removeprefix("[ÖRNEK ŞABLON] ")
    db.flush()
