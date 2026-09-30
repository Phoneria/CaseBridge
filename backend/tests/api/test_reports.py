"""Reports (Phase 4 - Raporlar): CSV export of the firm's cases."""
import codecs
from datetime import date, timedelta

VALID_CASE_PAYLOAD = {
    "case_number": "2026/901",
    "case_name": "Tazminat Davasi",
    "client_name": "Zeynep Aydin",
    "opposing_party": "Sigorta A.S.",
    "case_type": "diger",
    "court": "Bursa 2. Asliye Hukuk Mahkemesi",
    "status": "devam_eden",
}


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def test_cases_csv_export_includes_created_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers)

    response = client.get("/reports/cases.csv", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "Tazminat Davasi" in response.text
    assert "case_number" in response.text.splitlines()[0]


def test_cases_csv_export_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers_a)

    response = client.get("/reports/cases.csv", headers=headers_b)
    assert "Tazminat Davasi" not in response.text


def _create_case(client, headers, **overrides):
    payload = {**VALID_CASE_PAYLOAD, **overrides}
    response = client.post("/cases", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _csv_lines(response):
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.content.startswith(codecs.BOM_UTF8)
    return response.content.decode("utf-8-sig").splitlines()


def test_hearings_csv_lists_only_the_30_day_window(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    today = date.today()
    _create_case(client, headers, case_number="2026/911", case_name="Yakin Durusma",
                 next_hearing_date=(today + timedelta(days=5)).isoformat())
    _create_case(client, headers, case_number="2026/912", case_name="Uzak Durusma",
                 next_hearing_date=(today + timedelta(days=45)).isoformat())

    lines = _csv_lines(client.get("/reports/hearings.csv", headers=headers))

    assert lines[0] == "Tarih,Dava No,Dava,Müvekkil,Mahkeme"
    assert any("Yakin Durusma" in line for line in lines)
    assert not any("Uzak Durusma" in line for line in lines)


def test_tasks_csv_has_turkish_status_labels(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/921")
    client.post(f"/cases/{case['id']}/tasks", json={"title": "Acik Gorev"}, headers=headers)
    done = client.post(f"/cases/{case['id']}/tasks", json={"title": "Biten Gorev"}, headers=headers).json()
    client.patch(f"/cases/{case['id']}/tasks/{done['id']}", json={"status": "completed"}, headers=headers)

    lines = _csv_lines(client.get("/reports/tasks.csv", headers=headers))

    assert lines[0] == "Görev,Dava No,Dava,Son Tarih,Durum"
    assert any(line.startswith("Acik Gorev,") and line.endswith(",Açık") for line in lines)
    assert any(line.startswith("Biten Gorev,") and line.endswith(",Tamamlandı") for line in lines)


def test_performance_csv_starts_with_total_row(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers, case_number="2026/931")
    client.patch(f"/cases/{case['id']}", json={"outcome": "won", "status": "kapali"}, headers=headers)

    lines = _csv_lines(client.get("/reports/performance.csv", headers=headers))

    assert lines[0] == "Kategori,Toplam,Kazanılan,Kaybedilen,Kazanma Oranı (%)"
    assert lines[1] == "Tümü,1,1,0,100.0"
    assert lines[2] == "Diğer,1,1,0,100.0"


def test_summary_matches_the_lists_it_links_to(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    today = date.today()
    soon = _create_case(client, headers, case_number="2026/941",
                        next_hearing_date=(today + timedelta(days=3)).isoformat())
    _create_case(client, headers, case_number="2026/942")
    client.patch(f"/cases/{soon['id']}", json={"outcome": "won"}, headers=headers)
    client.post(f"/cases/{soon['id']}/tasks", json={"title": "Acik"}, headers=headers)
    done = client.post(f"/cases/{soon['id']}/tasks", json={"title": "Bitti"}, headers=headers).json()
    client.patch(f"/cases/{soon['id']}/tasks/{done['id']}", json={"status": "completed"}, headers=headers)

    summary = client.get("/reports/summary", headers=headers).json()
    overview = client.get("/analytics/overview", headers=headers).json()

    assert summary == {
        "total_cases": len(client.get("/cases?include_archived=true", headers=headers).json()),
        "upcoming_hearings_30d": len(client.get("/cases?hearing_within_days=30", headers=headers).json()),
        "open_tasks": len(client.get("/tasks?status=pending", headers=headers).json()),
        "win_rate": overview["win_rate"],
    }
    assert summary["upcoming_hearings_30d"] == 1
    assert summary["open_tasks"] == 1


def test_summary_isolated_by_law_firm(client, two_firms_two_users):
    headers_a = _auth_headers(client, two_firms_two_users, "user_a")
    headers_b = _auth_headers(client, two_firms_two_users, "user_b")
    _create_case(client, headers_a, case_number="2026/951")

    assert client.get("/reports/summary", headers=headers_b).json()["total_cases"] == 0
