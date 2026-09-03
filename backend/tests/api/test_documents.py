"""Document management (section 22 - Documents)."""
import io

VALID_CASE_PAYLOAD = {
    "case_number": "2026/301",
    "case_name": "Sözleşmenin Feshi Davası",
    "client_name": "Deniz Arslan",
    "opposing_party": "Mavi Yapı A.Ş.",
    "case_type": "sozlesme",
    "court": "İstanbul 2. Asliye Hukuk Mahkemesi",
    "status": "devam_eden",
}


def _login(client, email, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(client, fixtures, who="user_a"):
    token = _login(client, fixtures[who].email, fixtures["password"])
    return {"Authorization": f"Bearer {token}"}


def _create_case(client, headers):
    return client.post("/cases", json=VALID_CASE_PAYLOAD, headers=headers).json()


def _build_docx_bytes(text: str) -> bytes:
    from docx import Document as DocxDocument

    buffer = io.BytesIO()
    doc = DocxDocument()
    doc.add_paragraph(text)
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()


def test_upload_txt_document_succeeds(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    file_content = b"Bu davaya iliskin onemli bir not."
    response = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("notlar.txt", file_content, "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "notlar.txt"
    assert body["file_type"] == "txt"
    assert "onemli bir not" in body["extracted_text"]


def test_upload_docx_document_succeeds_and_extracts_text(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    docx_bytes = _build_docx_bytes("Taraflar arasindaki sozlesme 01.01.2025 tarihinde feshedilmistir.")
    response = client.post(
        f"/cases/{case['id']}/documents",
        files={
            "file": (
                "fesih_bildirimi.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["file_type"] == "docx"
    assert "feshedilmistir" in body["extracted_text"]


def test_upload_pdf_document_succeeds(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    # Minimal placeholder bytes: the MVP accepts by extension/content-type
    # and best-effort extracts text; malformed PDFs must not crash upload.
    response = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("dilekce.pdf", b"%PDF-1.4 fake content", "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["file_type"] == "pdf"


def test_upload_sanitizes_path_traversal_in_filename(client, two_firms_two_users, tmp_path):
    """A malicious filename like '../../../etc/evil.txt' must never let
    the stored file land outside this case's storage directory."""
    import os

    from app.core.config import settings

    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("../../../../evil.txt", b"icerik", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "evil.txt"

    expected_case_dir = os.path.join(settings.storage_dir, two_firms_two_users["firm_a"].id, case["id"])
    written_files = []
    for root, _dirs, files in os.walk(settings.storage_dir):
        for f in files:
            written_files.append(os.path.join(root, f))

    assert len(written_files) == 1
    assert os.path.dirname(written_files[0]) == expected_case_dir


def test_reject_unsupported_file_type(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    response = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("virus.exe", b"MZ...", "application/octet-stream")},
        headers=headers,
    )
    assert response.status_code == 400


def test_reject_oversized_upload(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)

    from app.core.config import settings

    oversized = b"x" * (settings.max_upload_size_bytes + 1)
    response = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("buyuk.txt", oversized, "text/plain")},
        headers=headers,
    )
    assert response.status_code == 413


def test_document_associated_with_correct_case(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("not.txt", b"icerik", "text/plain")},
        headers=headers,
    )

    response = client.get(f"/cases/{case['id']}/documents", headers=headers)
    assert response.status_code == 200
    docs = response.json()
    assert len(docs) == 1
    assert docs[0]["filename"] == "not.txt"


def test_document_deletion_removes_it_from_list(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    uploaded = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("silinecek.txt", b"icerik", "text/plain")},
        headers=headers,
    ).json()

    delete_response = client.delete(f"/documents/{uploaded['id']}", headers=headers)
    assert delete_response.status_code == 204

    list_response = client.get(f"/cases/{case['id']}/documents", headers=headers)
    assert list_response.json() == []


def test_unauthorized_firm_cannot_access_document(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")

    case = _create_case(client, headers_a)
    uploaded = client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("gizli.txt", b"icerik", "text/plain")},
        headers=headers_a,
    ).json()

    # Firm B cannot list firm A's case documents, nor delete the document directly.
    assert client.get(f"/cases/{case['id']}/documents", headers=headers_b).status_code == 404
    assert client.delete(f"/documents/{uploaded['id']}", headers=headers_b).status_code == 404


def test_global_document_list_includes_case_name_and_number(client, two_firms_two_users):
    headers = _auth_headers(client, two_firms_two_users)
    case = _create_case(client, headers)
    client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("sozlesme.txt", b"icerik", "text/plain")},
        headers=headers,
    )

    response = client.get("/documents", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["filename"] == "sozlesme.txt"
    assert "case_name" in body[0] and "case_number" in body[0]


def test_global_document_list_isolated_by_law_firm(client, two_firms_two_users):
    fixtures = two_firms_two_users
    headers_a = _auth_headers(client, fixtures, "user_a")
    headers_b = _auth_headers(client, fixtures, "user_b")
    case = _create_case(client, headers_a)
    client.post(
        f"/cases/{case['id']}/documents",
        files={"file": ("gizli.txt", b"icerik", "text/plain")},
        headers=headers_a,
    )

    response = client.get("/documents", headers=headers_b)
    assert response.status_code == 200
    assert response.json() == []
