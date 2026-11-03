"""Add the existing fictional demo portfolio to one customer firm on demand."""
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.courtroom_seed import seed_courtroom_scenarios
from app.db.courtroom_showcase_seed import seed_courtroom_showcases
from app.db.seed import (
    DEMO_CASES, DEMO_DOCUMENTS, DEMO_EVENTS, DEMO_TASKS,
    TICARI_KIRA_DOCUMENTS, TICARI_KIRA_EVENTS, TICARI_KIRA_TASKS,
    _get_or_create_case, _get_or_create_document, _get_or_create_event,
    _get_or_create_task, _seed_case_detail,
)
from app.models.case import Case, CaseType
from app.models.document import DocumentType
from app.models.law_firm import LawFirm
from app.models.task import TaskStatus
from app.models.user import User, UserRole

PREFIX = "ÖRNEK-"
MARKER = "[ÖRNEK ŞABLON] "


def add_demo_template(db: Session, admin: User) -> dict[str, int]:
    """Seed only the authenticated firm; never create accounts or alter real cases."""
    # Serialize imports by two admins of the same firm before checking numbers.
    firm = db.query(LawFirm).filter(LawFirm.id == admin.law_firm_id).with_for_update().one()
    if firm.is_platform:
        raise HTTPException(status_code=403, detail="Platform bürosuna örnek dava eklenemez.")
    expected_numbers = [PREFIX + row["case_number"] for row in DEMO_CASES]
    existing = db.query(Case).filter(
        Case.law_firm_id == firm.id, Case.case_number.in_(expected_numbers)
    ).all()
    if any(not (case.description or "").startswith(MARKER) for case in existing):
        raise HTTPException(status_code=409, detail="Örnek numarası gerçek bir davada kullanılıyor; hiçbir kayıt eklenmedi.")
    before = len(existing)

    lawyers = db.query(User).filter(
        User.law_firm_id == firm.id,
        User.role == UserRole.LAWYER,
        User.is_active.is_(True),
        User.password_set_at.isnot(None),
    ).order_by(User.full_name).all()
    owners = lawyers or [admin]
    author = owners[0]
    demo_cases: dict[str, Case] = {}

    for index, source in enumerate(DEMO_CASES):
        case_type = source["case_type"]
        assigned = (
            owners[0] if case_type == CaseType.TICARET_HUKUKU
            else owners[1] if case_type == CaseType.IS_HUKUKU and len(owners) > 1
            else owners[2] if case_type == CaseType.KIRA and len(owners) > 2
            else owners[index % len(owners)]
        )
        fields = {**source, "case_number": PREFIX + source["case_number"],
                  "description": MARKER + (source.get("description") or "")}
        demo_cases[source["case_number"]] = _get_or_create_case(db, firm, assigned, **fields)

    for case_number, title, due_in_days, status in DEMO_TASKS:
        _get_or_create_task(
            db, demo_cases[case_number], author,
            title=title, description="Demo görev kaydı",
            due_date=date.today() + timedelta(days=due_in_days), status=status,
            completed_at=(datetime.now(timezone.utc) - timedelta(days=1)
                          if status == TaskStatus.COMPLETED else None),
        )
    for index, (case_number, filename, extracted_text) in enumerate(DEMO_DOCUMENTS):
        _get_or_create_document(
            db, demo_cases[case_number], author, filename=filename,
            file_type=DocumentType.TXT, extracted_text=extracted_text,
            uploaded_at=datetime.now(timezone.utc) - timedelta(days=index),
        )
    for case_number, title, event_type, days_ago in DEMO_EVENTS:
        _get_or_create_event(
            db, demo_cases[case_number], author, title=title,
            description="Demo dava gelişmesi", event_type=event_type,
            event_date=date.today() - timedelta(days=days_ago),
            created_at=datetime.now(timezone.utc) - timedelta(hours=days_ago),
        )

    commercial_rent_case = demo_cases["2026/153"]
    for title, description, due_in_days, status in TICARI_KIRA_TASKS:
        _get_or_create_task(
            db, commercial_rent_case, author, title=title, description=description,
            due_date=date.today() + timedelta(days=due_in_days), status=status,
            completed_at=(datetime.now(timezone.utc) - timedelta(days=1)
                          if status == TaskStatus.COMPLETED else None),
        )
    for index, (filename, extracted_text) in enumerate(TICARI_KIRA_DOCUMENTS):
        _get_or_create_document(
            db, commercial_rent_case, author, filename=filename,
            file_type=DocumentType.TXT, extracted_text=extracted_text,
            uploaded_at=datetime.now(timezone.utc) - timedelta(hours=index),
        )
    for title, description, event_type, days_ago in TICARI_KIRA_EVENTS:
        _get_or_create_event(
            db, commercial_rent_case, author, title=title, description=description,
            event_type=event_type, event_date=date.today() - timedelta(days=days_ago),
            created_at=datetime.now(timezone.utc) - timedelta(hours=days_ago),
        )
    for case_number, case in demo_cases.items():
        if case_number != "2026/153":
            assigned = next((user for user in owners if user.id == case.assigned_lawyer_id), author)
            _seed_case_detail(db, case, assigned)

    seed_courtroom_scenarios(db)
    seed_courtroom_showcases(db, admin)
    return {"total_cases": len(DEMO_CASES), "added_cases": len(DEMO_CASES) - before}
