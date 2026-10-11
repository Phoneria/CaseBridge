"""PATCH /cases/{id}: editable fields, the open-status rules (closing and reopening
have their own endpoints) and who may change a case."""
import pytest

from app.models.case import Case, CaseStatus, CaseType

NOT_MANAGER = "Bu davayı yalnızca sorumlu avukat veya yönetici değiştirebilir."
ARCHIVED = "Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın."
USE_CLOSE = "Davayı kapatmak için 'Davayı kapat' işlemini kullanın."
NO_OUTCOME = "Sonuç yalnızca dava kapatılırken girilebilir."
USE_REOPEN = "Kapalı davayı açmak için 'Yeniden aç' işlemini kullanın."


def _new_case(client, headers, number="2026/1", **overrides):
    payload = {"case_number": number, "case_name": "Alacak Davası", "client_name": "Müvekkil", "case_type": "kira", **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def lawyer(office, auth_headers):
    return auth_headers(office.lawyer_a1)


@pytest.fixture()
def case(client, lawyer):
    return _new_case(client, lawyer)


def _patch(client, headers, case_id, **body):
    return client.patch(f"/cases/{case_id}", json=body, headers=headers)


# --- status and outcome ------------------------------------------------------------------

def test_patch_cannot_close_a_case(client, lawyer, case):
    response = _patch(client, lawyer, case["id"], status="kapali")
    assert (response.status_code, response.json()["detail"]) == (422, USE_CLOSE)
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["status"] == "devam_eden"


def test_patch_cannot_set_the_outcome(client, lawyer, case):
    for body in ({"outcome": "won"}, {"outcome": "ongoing"}, {"outcome": None}, {"outcome": "won", "case_name": "X"}):
        response = client.patch(f"/cases/{case['id']}", json=body, headers=lawyer)
        assert (response.status_code, response.json()["detail"]) == (422, NO_OUTCOME), body
    detail = client.get(f"/cases/{case['id']}", headers=lawyer).json()
    assert (detail["outcome"], detail["case_name"]) == ("ongoing", "Alacak Davası")


def test_closing_and_outcome_together_report_the_closing_message(client, lawyer, case):
    response = _patch(client, lawyer, case["id"], status="kapali", outcome="won")
    assert (response.status_code, response.json()["detail"]) == (422, USE_CLOSE)


def test_open_statuses_can_be_changed_freely(client, lawyer, case):
    for status in ("durusma_bekleyen", "karar_bekleyen", "devam_eden", "karar_bekleyen"):
        response = _patch(client, lawyer, case["id"], status=status)
        assert response.status_code == 200 and response.json()["status"] == status


def test_a_closed_case_rejects_a_status_but_accepts_other_edits(client, lawyer, case, close_case):
    close_case(lawyer, case["id"], outcome="lost", decision_date="2026-10-01", note="Ret")

    for status in ("devam_eden", "durusma_bekleyen", "kapali"):
        response = _patch(client, lawyer, case["id"], status=status)
        assert response.status_code == 422, status
    assert _patch(client, lawyer, case["id"], status="devam_eden").json()["detail"] == USE_REOPEN

    edited = _patch(client, lawyer, case["id"], case_name="Düzeltilmiş ad", court="Ankara 3. Asliye Hukuk")
    assert edited.status_code == 200
    body = edited.json()
    assert (body["case_name"], body["court"]) == ("Düzeltilmiş ad", "Ankara 3. Asliye Hukuk")
    assert (body["status"], body["outcome"], body["decision_date"], body["closing_note"]) == (
        "kapali", "lost", "2026-10-01", "Ret",
    )


# --- editable fields -----------------------------------------------------------------------

def test_the_basic_fields_can_be_edited_and_cleared(client, lawyer, case):
    response = _patch(
        client, lawyer, case["id"],
        case_name="  Yeni Ad  ", case_type="icra", court="İzmir 1. İcra Hukuk", court_file_number="2026/5 E.",
        opening_date="2026-02-03", case_value=12500.5, description="Not",
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["case_name"], body["case_type"], body["court"]) == ("Yeni Ad", "icra", "İzmir 1. İcra Hukuk")
    assert (body["court_file_number"], body["opening_date"], body["case_value"]) == ("2026/5 E.", "2026-02-03", 12500.5)
    assert body["case_number"] == case["case_number"]

    cleared = _patch(client, lawyer, case["id"], court=None, case_value=None, court_file_number=None).json()
    assert (cleared["court"], cleared["case_value"], cleared["court_file_number"]) == (None, None, None)


def test_a_blank_court_is_stored_as_none(client, lawyer, case):
    assert _patch(client, lawyer, case["id"], court="   ").json()["court"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"case_name": ""},
        {"case_name": "   "},
        {"case_name": "a" * 256},
        {"case_name": None},
        {"case_type": None},
        {"case_type": "bilinmeyen"},
        {"status": None},
        {"opening_date": None},
        {"opening_date": "dün"},
        {"court": "a" * 256},
        {"case_value": -1},
    ],
)
def test_invalid_edits_are_rejected_and_change_nothing(client, lawyer, case, body):
    assert client.patch(f"/cases/{case['id']}", json=body, headers=lawyer).status_code == 422
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["case_name"] == "Alacak Davası"


def test_the_responsible_lawyer_cannot_be_changed_here(client, lawyer, case, office):
    response = _patch(client, lawyer, case["id"], assigned_lawyer_id=office.lawyer_a2.id)
    assert response.status_code == 403


# --- who may edit ----------------------------------------------------------------------------

def test_responsible_lawyer_and_admin_may_edit_other_lawyers_may_not(client, office, auth_headers, lawyer, case):
    admin = auth_headers(office.admin_a)
    other = auth_headers(office.lawyer_a2)

    assert _patch(client, lawyer, case["id"], case_name="A").status_code == 200
    assert _patch(client, admin, case["id"], case_name="B").status_code == 200
    denied = _patch(client, other, case["id"], case_name="C")
    assert (denied.status_code, denied.json()["detail"]) == (403, NOT_MANAGER)
    assert client.get(f"/cases/{case['id']}", headers=lawyer).json()["case_name"] == "B"


def test_the_parties_and_dispute_edits_follow_the_same_rule(client, office, auth_headers, case):
    other = auth_headers(office.lawyer_a2)
    parties = [{"name": "Yeni Müvekkil", "role": "plaintiff", "is_client": True}]
    assert _patch(client, other, case["id"], parties=parties).status_code == 403
    assert _patch(client, other, case["id"], claim="Talep", facts_summary="Olay").status_code == 403
    assert _patch(client, other, case["id"], description=None).status_code == 403


def test_a_case_without_a_responsible_lawyer_is_only_edited_by_an_admin(client, db_session, office, auth_headers, lawyer):
    orphan = Case(
        law_firm_id=office.firm_a.id, case_number="2026/77", case_name="Sahipsiz", client_name="M",
        case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN, assigned_lawyer_id=None,
    )
    db_session.add(orphan)
    db_session.commit()

    assert _patch(client, lawyer, orphan.id, case_name="Denendi").status_code == 403
    assert _patch(client, auth_headers(office.admin_a), orphan.id, case_name="Düzenlendi").status_code == 200


def test_another_firm_gets_a_404_and_no_login_a_401(client, office, auth_headers, case):
    assert _patch(client, auth_headers(office.admin_b), case["id"], case_name="X").status_code == 404
    assert _patch(client, auth_headers(office.admin_b), case["id"], status="kapali").status_code == 404
    assert client.patch(f"/cases/{case['id']}", json={"case_name": "X"}).status_code == 401


def test_permission_is_checked_before_the_state_rules(client, office, auth_headers, case):
    other = auth_headers(office.lawyer_a2)
    assert _patch(client, other, case["id"], status="kapali").status_code == 403
    assert _patch(client, other, case["id"], outcome="won").status_code == 403


# --- archived cases -----------------------------------------------------------------------------

def test_an_archived_case_cannot_be_edited_until_it_is_unarchived(client, office, auth_headers, lawyer, case, close_case):
    close_case(lawyer, case["id"])
    client.post(f"/cases/{case['id']}/archive", headers=lawyer)

    for headers in (lawyer, auth_headers(office.admin_a)):
        response = _patch(client, headers, case["id"], case_name="Değişti")
        assert (response.status_code, response.json()["detail"]) == (409, ARCHIVED)
    # the archived guard answers before the status rules
    assert _patch(client, lawyer, case["id"], status="kapali").status_code == 409

    client.post(f"/cases/{case['id']}/unarchive", headers=lawyer)
    assert _patch(client, lawyer, case["id"], case_name="Değişti").status_code == 200
