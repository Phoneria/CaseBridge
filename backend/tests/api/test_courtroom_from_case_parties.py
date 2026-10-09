"""Starting a hearing from a case that has parties and intake fields."""


def _headers(client, fixtures, who="user_a"):
    response = client.post("/auth/login", json={"email": fixtures[who].email, "password": fixtures["password"]})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_hearing_from_a_case_with_parties_uses_them_and_the_chosen_sides_position(client, two_firms_two_users):
    headers = _headers(client, two_firms_two_users)
    case = client.post(
        "/cases",
        headers=headers,
        json={
            "case_number": "2026/700",
            "case_name": "Alacak Davası",
            "case_type": "ticaret_hukuku",
            "claim": "150.000 TL alacak",
            "plaintiff_position": "Mal teslim edildi.",
            "defendant_position": "Mal ayıplı.",
            "parties": [
                {"name": "Örnek A.Ş.", "role": "plaintiff", "is_client": True},
                {"name": "Mavi Yapı", "role": "defendant"},
            ],
        },
    ).json()

    response = client.post(
        "/courtroom-sessions/from-case", headers=headers, json={"case_id": case["id"], "chosen_role": "defendant"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["scenario"]["plaintiff_name"] == "Örnek A.Ş."
    assert body["scenario"]["defendant_name"] == "Mavi Yapı"
    assert "Kayıtlı talep / dava konusu: 150.000 TL alacak" in body["scenario"]["public_facts"]
    assert "Davalı tarafın kayıtlı savunması: Mal ayıplı." in str(body["role_brief"])
    assert "Mal teslim edildi." not in str(body["role_brief"])
