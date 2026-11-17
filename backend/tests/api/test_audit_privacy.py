"""The exported CSV carries no names, titles, texts or e-mails."""
from datetime import date, timedelta

from tests.api.test_platform_firms import platform  # noqa: F401 - pytest fixture

SECRETS = ["GİZLİ-DAVA-ADI", "GİZLİ-MÜVEKKİL", "GİZLİ-NOT-METNİ", "GİZLİ-GÖREV", "gizli-belge.txt",
           "GİZLİ-ŞİRKET", "GİZLİ-TOPLANTI"]


def test_the_export_contains_no_content(client, db_session, office, auth_headers, platform):
    headers = auth_headers(office.lawyer_a1)
    case = client.post("/cases", headers=headers, json={
        "case_number": "P/1", "case_name": "GİZLİ-DAVA-ADI", "case_type": "kira",
        "parties": [{"name": "GİZLİ-MÜVEKKİL", "role": "plaintiff", "is_client": True}],
    }).json()
    client.patch(f"/cases/{case['id']}", headers=headers, json={"description": "GİZLİ-NOT-METNİ"})
    client.post(f"/cases/{case['id']}/events", headers=headers, json={
        "title": "GİZLİ-NOT-METNİ", "event_type": "note", "description": "GİZLİ-NOT-METNİ",
        "event_date": date.today().isoformat()})
    client.post(f"/cases/{case['id']}/tasks", headers=headers, json={"title": "GİZLİ-GÖREV"})
    client.post(f"/cases/{case['id']}/documents", headers=headers,
                files={"file": ("gizli-belge.txt", "GİZLİ-NOT-METNİ", "text/plain")})
    client.post("/clients", headers=headers, json={"name": "GİZLİ-ŞİRKET", "client_type": "company", "email": "gizli@sirket.example.com"})
    client.post("/calendar/events", headers=headers, json={
        "title": "GİZLİ-TOPLANTI", "event_type": "meeting",
        "starts_at": (date.today() + timedelta(days=2)).isoformat() + "T10:00:00"})

    response = client.get("/platform/audit-events.csv", headers=platform.headers)
    assert response.status_code == 200
    text = response.content.decode("utf-8-sig")
    assert text.count("\n") >= 8
    for secret in [*SECRETS, office.lawyer_a1.email, office.lawyer_a1.full_name, "gizli@sirket.example.com"]:
        assert secret not in text, secret
