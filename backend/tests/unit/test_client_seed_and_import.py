"""Demo data, case imports and demo cleanup keep client parties linked to clients."""
import json

from app.db.import_cases import import_folder
from app.models.case import Case, CaseParty
from app.models.client import Client
from app.models.law_firm import LawFirm


def _seed(db_session, monkeypatch, tmp_path):
    import app.db.seed as seed_module

    monkeypatch.setattr(seed_module, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed_module, "upgrade_to_head", lambda engine: None)
    monkeypatch.setattr(seed_module.settings, "storage_dir", str(tmp_path))
    seed_module.seed()
    return seed_module


def test_seed_links_every_demo_client_party_and_fills_demo_contacts(db_session, monkeypatch, tmp_path):
    seed_module = _seed(db_session, monkeypatch, tmp_path)
    firm = db_session.query(LawFirm).filter_by(name=seed_module.DEMO_FIRM_NAME).one()
    unlinked = (
        db_session.query(CaseParty).join(Case, Case.id == CaseParty.case_id)
        .filter(CaseParty.is_client.is_(True), CaseParty.client_id.is_(None), Case.is_precedent.is_(False)).count()
    )
    assert unlinked == 0
    for name, (client_type, phone, email) in seed_module.DEMO_CLIENT_CONTACTS.items():
        client = db_session.query(Client).filter_by(law_firm_id=firm.id, name=name).one()
        assert (client.client_type, client.phone, client.email) == (client_type, phone, email)

    count = db_session.query(Client).count()
    _seed(db_session, monkeypatch, tmp_path)
    assert db_session.query(Client).count() == count


def test_seed_keeps_contact_details_a_user_changed(db_session, monkeypatch, tmp_path):
    seed_module = _seed(db_session, monkeypatch, tmp_path)
    name = next(iter(seed_module.DEMO_CLIENT_CONTACTS))
    client = db_session.query(Client).filter_by(name=name).one()
    client.phone = "0000"
    db_session.commit()
    _seed(db_session, monkeypatch, tmp_path)
    db_session.expire_all()
    assert db_session.query(Client).filter_by(name=name).one().phone == "0000"


def _firm(db_session):
    from app.db.seed import DEMO_FIRM_NAME, LAWYER_EMAIL
    from app.models.user import User, UserRole

    firm = LawFirm(name=DEMO_FIRM_NAME)
    db_session.add(firm)
    db_session.flush()
    db_session.add(User(law_firm_id=firm.id, email=LAWYER_EMAIL, hashed_password="x", full_name="A",
                        role=UserRole.LAWYER, is_active=True))
    db_session.commit()
    return firm


def _write(folder, cases, record_kind=None):
    (folder / "documents").mkdir(parents=True, exist_ok=True)
    manifest = {"cases": cases, **({"record_kind": record_kind} if record_kind else {})}
    (folder / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")


CASE = {"case_number": "2024/9", "case_name": "Alacak", "client_name": "Rota Gıda A.Ş.",
        "opposing_party": "Mavi Ltd.", "case_type": "ticaret_hukuku"}


def test_import_links_firm_case_clients_but_not_precedents(db_session, tmp_path):
    _firm(db_session)
    _write(tmp_path / "firm", [CASE])
    import_folder(str(tmp_path / "firm"), db=db_session)
    _write(tmp_path / "prec", [{**CASE, "case_number": "Y 2024/9", "client_name": "Davacı (anonim)"}], record_kind="precedent")
    import_folder(str(tmp_path / "prec"), db=db_session)

    assert [c.name for c in db_session.query(Client).all()] == ["Rota Gıda A.Ş."]
    precedent_party = (
        db_session.query(CaseParty).join(Case, Case.id == CaseParty.case_id)
        .filter(Case.is_precedent.is_(True), CaseParty.is_client.is_(True)).one()
    )
    assert precedent_party.client_id is None


def test_removing_the_demo_firm_removes_its_clients(db_session, monkeypatch, tmp_path):
    from app.db.demo_cleanup import remove_demo_data

    seed_module = _seed(db_session, monkeypatch, tmp_path)
    firm = db_session.query(LawFirm).filter_by(name=seed_module.DEMO_FIRM_NAME).one()
    result = remove_demo_data(
        db_session,
        firm_name=seed_module.DEMO_FIRM_NAME,
        case_numbers=[c["case_number"] for c in seed_module.DEMO_CASES],
        emails=[seed_module.ADMIN_EMAIL, *(email for email, *_ in seed_module.DEMO_LAWYERS)],
        demo_password=seed_module.DEMO_PASSWORD,
    )
    db_session.commit()
    assert result.cases > 0
    # The firm goes only when nothing but its clients still points at it.
    if result.firm_removed:
        assert db_session.query(Client).filter_by(law_firm_id=firm.id).count() == 0
    else:
        assert db_session.query(Client).filter_by(law_firm_id=firm.id).count() > 0
