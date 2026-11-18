"""record_audit writes metadata-only rows and refuses anything that could carry text."""
import logging

import pytest
from sqlalchemy.exc import OperationalError

from app.models.audit import AuditEvent
from app.models.case import Case, CaseStatus, CaseType
from app.services.audit import AuditDetailError, build_details, changed_fields, record_audit, snapshot


def _case(db_session, office):
    case = Case(law_firm_id=office.firm_a.id, case_number="A/1", case_name="Gizli Dava", client_name="X",
                case_type=CaseType.KIRA)
    db_session.add(case)
    db_session.commit()
    return case


def test_record_writes_one_metadata_row(db_session, office):
    case = _case(db_session, office)
    row = record_audit(
        db_session, office.lawyer_a1, "case.updated", case=case,
        fields=["description", "court"], transitions={"status": (CaseStatus.DEVAM_EDEN, CaseStatus.KARAR_BEKLEYEN)},
    )
    stored = db_session.query(AuditEvent).one()
    assert stored.id == row.id
    assert (stored.law_firm_id, stored.actor_user_id, stored.actor_role) == (office.firm_a.id, office.lawyer_a1.id, "lawyer")
    assert (stored.action, stored.case_id, stored.case_type) == ("case.updated", case.id, "kira")
    assert stored.details == {"fields": ["court", "description"], "transitions": {"status": ["devam_eden", "karar_bekleyen"]}}
    assert stored.occurred_at.tzinfo is None


def test_firm_comes_from_the_actor_when_there_is_no_case(db_session, office):
    record_audit(db_session, office.admin_a, "client.created", target_type="client",
                 target_id="0b6f6a4e-1f0e-4b51-9a49-5f4f1c9a9a01", flags={"client_type": "company"})
    stored = db_session.query(AuditEvent).one()
    assert stored.law_firm_id == office.firm_a.id and stored.case_id is None
    assert stored.details == {"flags": {"client_type": "company"}}


@pytest.mark.parametrize(
    "kwargs",
    [
        {"action": "case.renamed"},
        {"action": "case.updated", "fields": ["case_name_text"]},
        {"action": "case.updated", "transitions": {"status": ("serbest metin", None)}},
        {"action": "case.updated", "transitions": {"case_name": (None, None)}},
        {"action": "document.uploaded", "counts": {"size_kb": "12"}},
        {"action": "document.uploaded", "counts": {"size_kb": True}},
        {"action": "document.uploaded", "counts": {"pages": 3}},
        {"action": "document.uploaded", "flags": {"file_kind": "exe"}},
        {"action": "document.uploaded", "flags": {"title": "pdf"}},
        {"action": "document.uploaded", "target_type": "folder"},
    ],
)
def test_anything_outside_the_allow_lists_is_a_programmer_error(db_session, office, kwargs):
    action = kwargs.pop("action")
    with pytest.raises(AuditDetailError):
        record_audit(db_session, office.lawyer_a1, action, **kwargs)
    assert db_session.query(AuditEvent).count() == 0


def test_build_details_accepts_uuids_and_none_in_transitions():
    uid = "0b6f6a4e-1f0e-4b51-9a49-5f4f1c9a9a01"
    assert build_details(transitions={"assigned_lawyer_id": (None, uid)}) == {
        "transitions": {"assigned_lawyer_id": [None, uid]}
    }
    assert build_details() == {}


def test_a_database_error_is_logged_and_swallowed(db_session, office, monkeypatch, caplog):
    def broken_commit():
        raise OperationalError("INSERT", {}, Exception("disk full"))

    monkeypatch.setattr(db_session, "commit", broken_commit)
    with caplog.at_level(logging.ERROR, logger="casebridge"):
        assert record_audit(db_session, office.lawyer_a1, "case.reopened", law_firm_id=office.firm_a.id) is None
    assert "Hareket kaydı yazılamadı" in caplog.text


def test_changed_fields_compares_a_snapshot_with_the_object(db_session, office):
    case = _case(db_session, office)
    before = snapshot(case, ["court", "description", "case_type"])
    case.court = "İstanbul 3. Asliye Hukuk"
    assert changed_fields(case, before) == ["court"]
