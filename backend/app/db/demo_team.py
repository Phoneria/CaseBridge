"""Tenant-scoped fictional lawyers; never ordinary full-bureau accounts."""
from sqlalchemy.orm import Session

from app.db.demo_presentation_seed import LABEL, identity, put
from app.models.case import Case
from app.models.management import ManagementAudit, WorkspaceAccess
from app.models.user import User, UserRole

DEMO_LAWYERS = (
    ("Deniz Aydın", "Ticaret Hukuku"), ("Zeynep Ergin", "İş Hukuku"),
    ("Emre Sezer", "Kira ve Gayrimenkul"), ("Elif Yalçın", "Sözleşmeler"),
    ("Kerem Aksoy", "İcra ve İflas"), ("Selin Eren", "Tüketici Hukuku"),
    ("Mert Tekin", "Ticari Uyuşmazlıklar"), ("Derya Uslu", "İş ve Sosyal Güvenlik"),
    ("Bora Güneş", "Gayrimenkul Uyuşmazlıkları"), ("Ece Demirci", "Borçlar Hukuku"),
    ("Arda Kılıç", "Alacak Takibi"), ("İpek Sönmez", "Dava ve Uyuşmazlık Çözümü"),
)


def roster_ids(firm_id: str) -> set[str]:
    return {identity(firm_id, f"team-lawyer:{index}") for index in range(4)}


def scoped_lawyer_ids(firm_id: str) -> set[str]:
    """Include retired catalog identities when enforcing tenant and case scope."""
    return {identity(firm_id, f"team-lawyer:{index}") for index in range(len(DEMO_LAWYERS))}


def sample_cases(db: Session, firm_id: str) -> list[Case]:
    from app.db.demo_outcomes import template_numbers
    return db.query(Case).filter(
        Case.law_firm_id == firm_id,
        Case.case_number.in_([prefix + number for number in template_numbers() for prefix in ("ÖRNEK-", "CB-")]),
        (Case.description.startswith("[ÖRNEK ŞABLON] ") | Case.description.startswith("[Gösterim] ")),
        Case.is_precedent.is_(False),
    ).all()


def demo_case_ids(db: Session, user: User) -> list[str] | None:
    """None means this is NOT a validated scoped sample lawyer (never full access)."""
    if user.id not in scoped_lawyer_ids(user.law_firm_id):
        return None
    grant = db.query(WorkspaceAccess).filter_by(law_firm_id=user.law_firm_id, user_id=user.id, position="lawyer").first()
    if grant is None:
        return None
    from app.db.dossier_pack import package_cases
    allowed = {case.id for case in sample_cases(db, user.law_firm_id) + package_cases(db, user.law_firm_id)}
    return sorted(allowed.intersection(grant.case_ids))


def seed_demo_lawyers(db: Session, admin: User) -> list[User]:
    from app.services.auth_service import DUMMY_PASSWORD_HASH
    members = []
    for index, (name, department) in enumerate(DEMO_LAWYERS[:4]):
        members.append(put(db, User, admin.law_firm_id, f"team-lawyer:{index}",
            law_firm_id=admin.law_firm_id, full_name=name, department=department,
            email=f"sample-{identity(admin.law_firm_id, f'team-email:{index}')}@example.invalid",
            role=UserRole.LAWYER, is_platform_admin=False, hashed_password=DUMMY_PASSWORD_HASH))
        if members[-1].full_name == "ÖRNEK · " + name:
            members[-1].full_name = name
    return members


def scope_and_distribute(db: Session, admin: User, members: list[User], cases: list[Case], previous_ids: list[str]):
    firm_id = admin.law_firm_id
    from app.db.dossier_pack import package_cases
    from app.db.demo_upgrade import extend_generated_scope
    historical = [c.id for c in package_cases(db, firm_id)]
    allowed = [case.id for case in cases] + historical
    for index, member in enumerate(members):
        grant = db.query(WorkspaceAccess).filter_by(law_firm_id=firm_id, user_id=member.id).first()
        if grant is None:
            put(db, WorkspaceAccess, firm_id, f"team-grant:{index}", law_firm_id=firm_id,
                user_id=member.id, position="lawyer", case_ids=allowed)
        else:
            for previous in (historical, previous_ids, previous_ids + historical):
                extend_generated_scope(db, firm_id, member, previous, allowed)
    marker_id = identity(firm_id, "team-distribution:v2")
    if db.get(ManagementAudit, marker_id) is not None:
        return
    scopes = {u.id: set(demo_case_ids(db, u) or []) for u in members if u.is_active and u.password_set_at is not None}
    assigned_counts = {}
    for case in cases:
        candidates = [u for u in members if case.id in scopes.get(u.id, ())]
        if candidates:
            candidates.append(admin)
            previous = case.assigned_lawyer_id
            group = case.outcome if case.status.value == "kapali" else "active"
            count = assigned_counts.get(group, 0)
            case.assigned_lawyer_id = candidates[count % len(candidates)].id
            assigned_counts[group] = count + 1
            from app.models.task import Task
            if previous and previous != case.assigned_lawyer_id:
                db.query(Task).filter_by(case_id=case.id, law_firm_id=firm_id, assigned_to=previous,
                                         description="Demo görev kaydı").update({"assigned_to": case.assigned_lawyer_id}, synchronize_session=False)
            from app.services.hearing_dates import move_upcoming_hearings
            from app.core.timeutil import local_today
            move_upcoming_hearings(db, case, previous, case.assigned_lawyer_id, local_today())
    put(db, ManagementAudit, firm_id, "team-distribution:v2", law_firm_id=firm_id,
        actor_id=admin.id, action="demo.team_distributed", entity_type="demo", entity_id=firm_id,
        reason="Dört avukat arasında gösterim dosyaları dağıtıldı.")
