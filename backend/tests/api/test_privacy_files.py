import io
import logging
import zipfile

import pytest
from app.api.deps import get_current_user
from app.main import app
from app.privacy import ner
from app.privacy.files import MAX_BYTES


@pytest.fixture
def reader_user(client, office, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: office.admin_a
    monkeypatch.setattr(ner, '_pipe', None)
    return office.admin_a


def make_document(kind, text='sentetik@example.test'):
    out = io.BytesIO()
    if kind == 'pdf':
        from reportlab.pdfgen.canvas import Canvas
        doc = Canvas(out); doc.drawString(30, 700, text); doc.save()
    elif kind == 'docx':
        from docx import Document
        doc = Document(); doc.add_paragraph(text)
        doc.add_table(rows=1, cols=1).cell(0, 0).text = 'tablo@example.test'
        doc.sections[0].header.paragraphs[0].text = 'ustbilgi@example.test'
        doc.save(out)
    else:
        return text.encode('utf-8')
    return out.getvalue()


def upload(client, raw):
    return client.post('/privacy/extract-text', content=raw, headers={'Content-Type': 'application/octet-stream'})


@pytest.mark.parametrize('kind', ['pdf', 'docx', 'text'])
def test_real_document_extract_then_mask(client, reader_user, kind, tmp_path, caplog):
    # Actual PDF/DOCX/TXT bytes, not mocked readers. Files remain synthetic.
    raw = make_document(kind)
    response = upload(client, raw)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['format'] == kind and 'sentetik@example.test' in body['text']
    assert response.headers['cache-control'] == 'no-store'
    assert set(body) == {'text', 'format', 'warnings'}
    if kind == 'docx':
        assert 'tablo@example.test' in body['text'] and 'ustbilgi@example.test' in body['text']
    masked = client.post('/privacy/anonymize', json={'text': body['text']})
    assert masked.status_code == 200 and 'sentetik@example.test' not in masked.text
    assert '[E-POSTA-' in masked.json()['text']
    assert 'sentetik@example.test' not in caplog.text
    from app.core.config import settings
    from pathlib import Path
    assert not Path(settings.storage_dir).exists()


@pytest.mark.parametrize('raw', ['İstanbul\n0532 123 45 67'.encode('utf-8-sig'), 'İstanbul\n0532 123 45 67'.encode('utf-16')])
def test_plain_text_encodings(client, reader_user, raw):
    r = upload(client, raw)
    assert r.status_code == 200 and r.json()['text'] == 'İstanbul\n0532 123 45 67'


@pytest.mark.parametrize('raw, expected', [(b'\x89PNG\r\n\x1a\n\x00data', 'metin'), (b'\x00\x01test', 'ikili'), (b'%PDF-broken', 'okunamadı'), (b'PK\x03\x04broken', 'okunamadı'), (b'', 'boş'), (b' '*20, 'OCR')])
def test_unreadable_errors_are_safe(client, reader_user, raw, expected):
    r = upload(client, raw)
    assert r.status_code == 422 and expected in r.json()['detail']
    assert 'input' not in r.json() and 'Traceback' not in r.text


def test_limits_reject_without_truncation(client, reader_user):
    assert upload(client, b'x' * (MAX_BYTES + 1)).status_code == 413
    r = upload(client, b'x' * 30001)
    assert r.status_code == 422 and 'kırpılmadı' in r.text
    assert upload(client, b'x'*30000).json()['text'] == 'x'*30000
    out=io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('word/document.xml', b'x'*(16*1024*1024+1))
    r=upload(client,out.getvalue())
    assert r.status_code == 422 and '16 MB' in r.text


def test_pdf_scanned_encrypted_and_page_limit(client, reader_user):
    from pypdf import PdfWriter
    def pdf(pages, encrypted=False):
        out=io.BytesIO(); writer=PdfWriter()
        for _ in range(pages): writer.add_blank_page(width=100, height=100)
        if encrypted: writer.encrypt('synthetic-password')
        writer.write(out); return out.getvalue()
    r=upload(client,pdf(1)); assert r.status_code==422 and 'OCR' in r.text
    r=upload(client,pdf(1,True)); assert r.status_code==422 and 'Şifreli PDF' in r.text
    r=upload(client,pdf(101)); assert r.status_code==422 and '100 sayfa' in r.text


def test_docx_entity_expansion_denied(client, reader_user):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w') as z:
        z.writestr('word/document.xml', b'<!DOCTYPE root [<!ENTITY private "secret@example.test">]><root>&private;</root>')
    r=upload(client,out.getvalue())
    assert r.status_code==422 and 'secret@example.test' not in r.text


def test_parser_diagnostics_not_logged_or_returned(client, reader_user, monkeypatch, caplog):
    import pypdf
    def bad(*args, **kwargs):
        logging.getLogger('pypdf').warning('private@example.test')
        raise ValueError('private@example.test')
    monkeypatch.setattr(pypdf,'PdfReader',bad)
    from app.privacy.files import ExtractionError, extract_document
    with pytest.raises(ExtractionError) as error:
        extract_document(b'%PDF-1.4\n')
    assert 'private@example.test' not in str(error.value)+caplog.text


def test_extract_anonymous_and_platform_denied(client, reader_user):
    reader_user.is_platform_admin=True
    assert upload(client,b'text').status_code==403
    app.dependency_overrides.pop(get_current_user)
    assert upload(client,b'text').status_code==401


def test_extract_real_session_scope(client, office, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(ner,'_pipe',None)
    from app.models.management import WorkspaceAccess
    for user in [office.admin_a,office.lawyer_a1,office.admin_b,office.lawyer_b]:
        assert client.post('/privacy/extract-text',content=b'synthetic@example.test',headers=auth_headers(user)).status_code==200
    headers=auth_headers(office.lawyer_a2)
    db_session.add(WorkspaceAccess(user_id=office.lawyer_a2.id,law_firm_id=office.firm_a.id,position='client'));db_session.commit()
    assert client.post('/privacy/extract-text',content=b'text',headers=headers).status_code==403


# --- UDF (UYAP Doküman Formatı) ---------------------------------------------

def test_udf_extract_through_isolated_worker(client, reader_user):
    from app.privacy.files import UDF_WARNING
    from tests.udf_samples import make_udf

    raw = make_udf("sentetik@example.test", header="ustbilgi@example.test", table=["tablo@example.test"])
    response = upload(client, raw)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['format'] == 'udf' and body['warnings'] == [UDF_WARNING]
    assert all(s in body['text'] for s in ('sentetik@example.test', 'ustbilgi@example.test', 'tablo@example.test'))


def test_odt_like_zip_is_not_treated_as_udf(client, reader_user):
    from tests.udf_samples import odt_like_zip

    response = upload(client, odt_like_zip())
    assert response.status_code == 422
    assert response.json()['detail'] == 'Bu ikili dosyadan metin çıkarılamadı. PDF, DOCX veya düz metin dosyası seçin.'


def test_invalid_udf_returns_fixed_message(client, reader_user):
    from app.services.udf_reader import INVALID_UDF
    from tests.udf_samples import make_udf

    xml = b'<?xml version="1.0"?><!DOCTYPE t [<!ENTITY a "gizli-icerik">]><template><content>&a;</content></template>'
    response = upload(client, make_udf(content_xml=xml))
    assert response.status_code == 422 and response.json()['detail'] == INVALID_UDF
    assert 'gizli-icerik' not in response.text


def test_udf_without_text_needs_ocr(client, reader_user):
    from tests.udf_samples import make_udf

    response = upload(client, make_udf("   "))
    assert response.status_code == 422
    assert response.json()['detail'].startswith('Belgede okunabilir metin bulunamadı.')
