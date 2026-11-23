# UDF İçe Aktarma — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Belge kabul eden her yerde `.udf` (UYAP Doküman Formatı) dosyalarını kabul etmek, metnini çıkarmak ve orijinal dosyayı olduğu gibi saklamak.

**Architecture:** Yalnızca Python'un kendi kütüphanelerini kullanan tek bir okuyucu modülü yazılır (`app/services/udf_reader.py`). Bu modül ZIP'i açar, `content.xml` içindeki `<template><content>` metnini döndürür ve gizlilik aracının DOCX sınırlarını uygular. Belge yükleme, AI ile doldurma ve CLI içe aktarma bu okuyucuyu `text_extraction.extract_text` üzerinden kullanır. Gizlilik aracı ise doğrudan `privacy/files.extract_document` içinden, mevcut izole işçi süreçte kullanır. Veritabanındaki `documenttype` listesine `udf` eklenir. Frontend'de dosya kabul listeleri, metinler ve türler güncellenir.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, pytest (backend); Next.js 14, TypeScript, Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-11-24-udf-import-design.md`

## Global Constraints

- Yeni bağımlılık eklenmez. Okuyucu yalnızca `zipfile`, `io` ve `xml.etree.ElementTree` kullanır, `app.*` içinden hiçbir şey import etmez (gizlilik aracının 512 MB / 10 sn sınırlı izole işçisinde de çalışmalı).
- Sınırlar: en fazla **512** ZIP öğesi; açılmış toplam boyut en fazla **16 MB** (`16 * 1024 * 1024`). Şifreli öğe, yinelenen öğe adı ve XML `DOCTYPE` reddedilir. Kök öğe `template` olmalıdır.
- Metin yalnızca `content.xml` → `<template>` altındaki doğrudan `<content>` öğesinin metninden (CDATA ya da kaçışlı metin) alınır. Normalizasyon yalnızca şudur: `\r\n` ve `\r` → `\n`. `sign.sgn`, `documentproperties.xml` ve diğer öğeler okunmaz.
- Hata mesajlarında ve kayıtlarda (log) belge içeriği yer almaz.
- Orijinal dosya baytları değiştirilmeden saklanır ve indirilir. İndirmede media type `application/octet-stream` olur.
- Yükleme sınırları değişmez: genel 10 MB, gizlilik aracı 5 MB, gizlilik aracında 30.000 karakter.
- Kullanıcıya görünen metinler Türkçedir; mesajlar bu plandaki metinlerin birebir aynısı olmalıdır.
- Ortam hazırlığı (ilk görevden önce bir kez): `cd backend && pip install --break-system-packages -r requirements.txt reportlab` ve `cd frontend && npm ci`. Backend testleri `backend/` içinden `python -m pytest`, frontend testleri `frontend/` içinden `npx vitest run` ile çalıştırılır.

## Review Focus

1. **Büyük harfli uzantı (`KARAR.UDF`):** Windows indirmelerinde sık görülür. Tür `udf` olarak tanınmalı. Test: Görev 2 `test_upload_uppercase_udf_extension`.
2. **Türkçe dosya adıyla indirme (`Bilirkişi Raporu.udf`):** indirilen baytlar orijinalle aynı olmalı, ad `.udf` olarak korunmalı. Test: Görev 2 `test_upload_udf_extracts_text_and_downloads_original`.
3. **UTF-8 dışında kodlanmış `content.xml`** (`<?xml version="1.0" encoding="windows-1254"?>`): Türkçe karakterler bozulmadan gelmeli. Test: Görev 1 `test_declared_windows_1254_encoding`.
4. **CDATA'sız, kaçışlı metin** (`A &amp; B &lt;C&gt;`): metin `A & B <C>` olarak gelmeli. Test: Görev 1 `test_escaped_text_without_cdata`.
5. **Gizlilik aracına yüklenen ODT dosyası:** ODT dosyalarında da kökte bir `content.xml` bulunur. Bu dosya UDF sanılmamalı; mevcut genel hata dönmeli. Test: Görev 3 `test_odt_like_zip_is_not_treated_as_udf`.

---

### Task 1: UDF okuyucu

**Files:**
- Create: `backend/app/services/udf_reader.py`
- Create: `backend/tests/udf_samples.py` (testlerde kullanılan sentetik UDF üretici)
- Test: `backend/tests/unit/test_udf_reader.py`

**Interfaces:**
- Produces:
  - `class UdfReadError(ValueError)` — yalnızca aşağıdaki iki sabit mesajdan birini taşır.
  - `INVALID_UDF = "Bu dosya geçerli bir UDF değil. Belgeyi UYAP'tan yeniden indirip yükleyin."`
  - `UDF_LIMIT = "UDF açılmış içerik sınırını aşıyor (16 MB / 512 öğe); belge işlenmedi."`
  - `MAX_MEMBERS = 512`, `MAX_EXPANDED = 16 * 1024 * 1024`
  - `def read_udf_text(raw: bytes) -> str` — normalize edilmiş metni döndürür. `<content>` öğesi yoksa ya da boşsa `""` döner. Geçersiz dosyada `UdfReadError(INVALID_UDF)`, sınır aşımında `UdfReadError(UDF_LIMIT)` fırlatır.
  - `def is_udf(raw: bytes) -> bool` — dosya ZIP ise, `content.xml` içeriyorsa, `word/document.xml` ve `mimetype` öğelerinden hiçbirini içermiyorsa `True` döner. Her türlü ZIP hatasında `False` döner; hiçbir zaman hata fırlatmaz.
  - `tests/udf_samples.make_udf(text="Davacı vekili dilekçesidir.", *, header=None, table=None, signed=False, extra_members=None, content_xml=None, cdata=True, encoding="utf-8") -> bytes`

- [ ] **Adım 1: Test yardımcısını yaz (`backend/tests/udf_samples.py`)**

Oluşturulan XML'in biçimi bir karar olduğu için yardımcının gövdesi aşağıda verilmiştir:

```python
"""Synthetic UDF files shaped like UYAP Doküman Editörü output (format 1.8)."""
import io
import zipfile
from xml.sax.saxutils import escape


def make_udf(text="Davacı vekili dilekçesidir.", *, header=None, table=None, signed=False,
             extra_members=None, content_xml=None, cdata=True, encoding="utf-8") -> bytes:
    if content_xml is None:
        parts = ([header] if header else []) + [text] + list(table or [])
        raw_text = "\n".join(parts) + "\n"
        offset, elements = 0, []
        def leaf(part):
            nonlocal offset
            xml = f'<paragraph><content startOffset="{offset}" length="{len(part)}"/></paragraph>'
            offset += len(part) + 1
            return xml
        if header:
            elements.append(f"<header>{leaf(header)}</header>")
        elements.append(leaf(text))
        if table:
            cells = "".join(f"<cell>{leaf(c)}</cell>" for c in table)
            elements.append(f"<table><row>{cells}</row></table>")
        body = f"<![CDATA[{raw_text}]]>" if cdata else escape(raw_text)
        content_xml = (
            f'<?xml version="1.0" encoding="{encoding}"?>\n'
            f'<template format_id="1.8"><content>{body}</content>'
            '<properties><pageFormat mediaSizeName="1" leftMargin="70.86" rightMargin="70.86" '
            'topMargin="56.69" bottomMargin="56.69" paperOrientation="1"/></properties>'
            f'<elements resolver="hvl-default">{"".join(elements)}</elements>'
            '<styles><style name="default" family="Times New Roman" size="12"/></styles></template>'
        ).encode(encoding)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("content.xml", content_xml)
        if signed:
            archive.writestr("documentproperties.xml", b'<properties><entry key="dogrulamaKodu">ABC123</entry></properties>')
            archive.writestr("sign.sgn", b"\x30\x82\x01\x00" + b"\x00" * 64)
        for name, data in (extra_members or {}).items():
            archive.writestr(name, data)
    return out.getvalue()
```

- [ ] **Adım 2: Hata vermesi beklenen testleri yaz (`backend/tests/unit/test_udf_reader.py`)**

Tüm testler `from app.services.udf_reader import INVALID_UDF, UDF_LIMIT, UdfReadError, is_udf, read_udf_text` ve `from tests.udf_samples import make_udf` kullanır.

```python
def test_reads_turkish_text_from_cdata():
    assert "Davacı: Çağrı Öztürk — İşçilik alacağı" in read_udf_text(make_udf("Davacı: Çağrı Öztürk — İşçilik alacağı"))

def test_header_and_table_text_are_included():
    text = read_udf_text(make_udf("Gövde", header="T.C. İSTANBUL 3. İŞ MAHKEMESİ", table=["Esas No", "2026/123"]))
    assert "T.C. İSTANBUL 3. İŞ MAHKEMESİ" in text and "Esas No" in text and "2026/123" in text

def test_signed_udf_is_read_and_signature_ignored():
    assert "İmzalı karar" in read_udf_text(make_udf("İmzalı karar", signed=True))

def test_crlf_and_cr_become_lf():
    text = read_udf_text(make_udf("a\r\nb\rc"))
    assert "a\nb\nc" in text and "\r" not in text

def test_escaped_text_without_cdata():                      # Review Focus 4
    assert "A & B <C>" in read_udf_text(make_udf("A & B <C>", cdata=False))

def test_declared_windows_1254_encoding():                  # Review Focus 3
    assert "Şirket ğüşıöç İĞÜŞÖÇ" in read_udf_text(make_udf("Şirket ğüşıöç İĞÜŞÖÇ", encoding="windows-1254"))

def test_missing_content_element_reads_as_empty():
    assert read_udf_text(make_udf(content_xml=b'<template format_id="1.8"><elements/></template>')) == ""

@pytest.mark.parametrize("raw", [b"%PDF-1.4 not a zip", b"", b"PK\x03\x04broken"])
def test_non_zip_is_invalid(raw):
    with pytest.raises(UdfReadError) as exc:
        read_udf_text(raw)
    assert str(exc.value) == INVALID_UDF

def test_zip_without_content_xml_is_invalid():
    # zipfile ile yalnızca "sign.sgn" içeren bir ZIP.
    ...assert str(exc.value) == INVALID_UDF

def test_wrong_root_is_invalid():
    with pytest.raises(UdfReadError) as exc:
        read_udf_text(make_udf(content_xml=b'<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>'))
    assert str(exc.value) == INVALID_UDF

def test_doctype_is_rejected_without_leaking_text():
    xml = b'<?xml version="1.0"?><!DOCTYPE t [<!ENTITY a "gizli-icerik">]><template><content>&a;</content></template>'
    with pytest.raises(UdfReadError) as exc:
        read_udf_text(make_udf(content_xml=xml))
    assert str(exc.value) == INVALID_UDF and "gizli-icerik" not in str(exc.value)

def test_too_many_members_hits_the_limit():
    raw = make_udf(extra_members={f"img/{i}.png": b"x" for i in range(512)})   # 513 members
    with pytest.raises(UdfReadError) as exc:
        read_udf_text(raw)
    assert str(exc.value) == UDF_LIMIT

def test_expanded_size_hits_the_limit():
    raw = make_udf(extra_members={"img/big.bin": b"\0" * (16 * 1024 * 1024 + 1)})
    with pytest.raises(UdfReadError) as exc:
        read_udf_text(raw)
    assert str(exc.value) == UDF_LIMIT

def test_encrypted_member_is_invalid():
    # zipfile yazarken flag_bits'i sıfırladığı için: make_udf() baytlarında content.xml'in
    # genel amaçlı bayrağının 0. bitini hem yerel başlıkta (b"PK\x03\x04" + 6)
    # hem merkezi dizinde (b"PK\x01\x02" + 8) elle 1 yap.
    ...assert str(exc.value) == INVALID_UDF

def test_is_udf():
    assert is_udf(make_udf())
    assert not is_udf(b"%PDF-1.4")
    assert not is_udf(docx_bytes)                 # python-docx Document().save(...)
    assert not is_udf(odt_like_zip)               # members: "mimetype", "content.xml"
```

- [ ] **Adım 3: Testlerin hata verdiğini doğrula**

Çalıştır: `python -m pytest tests/unit/test_udf_reader.py -q`
Beklenen: `ModuleNotFoundError: No module named 'app.services.udf_reader'` ile FAIL.

- [ ] **Adım 4: `backend/app/services/udf_reader.py` dosyasını yaz**

- `read_udf_text`, `zipfile.ZipFile(io.BytesIO(raw))` ile açılır; `BadZipFile` ve `ValueError` hataları `INVALID_UDF`'ye çevrilir.
- Öğe listesi sırayla şöyle kontrol edilir:
  1. `len > 512` ya da `sum(file_size) > 16 MB` ise `UDF_LIMIT`;
  2. yinelenen ad ya da `flag_bits & 1` ise `INVALID_UDF`;
  3. `content.xml` yoksa `INVALID_UDF`.
- `content.xml`, `archive.open(...).read(MAX_EXPANDED + 1)` ile okunur; `MAX_EXPANDED`'den uzun çıkarsa `UDF_LIMIT`.
- XML, `ElementTree.XMLParser(target=<doctype'ta hata fırlatan TreeBuilder>)` ile ayrıştırılır. Bu, `privacy/files._NoDtdTreeBuilder` ile aynı yöntemdir; sınıf `app.privacy` içinden import edilmeden yerelde yeniden tanımlanır.
- Baytlar doğrudan verildiği için XML'de bildirilen kodlama (encoding) uygulanır.
- Kök `template` değilse `INVALID_UDF`.
- Metin `root.find("content")` öğesinin `.text` değeridir (`None` ise `""`); ardından `\r\n` ve `\r` → `\n` dönüştürülür.
- Okuyucu dışındaki her hata `INVALID_UDF`'ye çevrilir; `from None` kullanıldığı için ayrıştırıcının ayrıntısı mesaja sızmaz.

- [ ] **Adım 5: Testlerin geçtiğini doğrula**

Çalıştır: `python -m pytest tests/unit/test_udf_reader.py -q`
Beklenen: tümü PASS.

- [ ] **Adım 6: Commit**

```bash
git add backend/app/services/udf_reader.py backend/tests/udf_samples.py backend/tests/unit/test_udf_reader.py
git commit -m "feat: UDF text reader with archive and XML safety limits"
```

---

### Task 2: Dava belgeleri, AI ile doldurma ve CLI içe aktarmada UDF

**Files:**
- Modify: `backend/app/models/document.py` (`DocumentType.UDF = "udf"`)
- Create: `backend/alembic/versions/e2b4d6f8a1c3_document_type_udf.py` (`down_revision = "0244bf696c5e"`)
- Modify: `backend/app/services/document_service.py` (`".udf": DocumentType.UDF`; 400 mesajı `"Unsupported file type '{ext}'. Allowed: pdf, docx, txt, udf."`)
- Modify: `backend/app/services/text_extraction.py` (UDF dalı)
- Modify: `backend/app/api/routes/documents.py` (`_MEDIA_TYPES["udf"] = "application/octet-stream"`)
- Modify: `backend/app/db/import_cases.py` (`_EXT` içine `".udf": DocumentType.UDF`; mesaj `"(pdf, docx, txt, udf)"`)
- Test: `backend/tests/api/test_documents.py`, `backend/tests/api/test_case_intake.py`, `backend/tests/unit/test_import_cases.py`, `backend/tests/integration/test_document_type_udf_migration.py`

**Interfaces:**
- Consumes: `read_udf_text(raw: bytes) -> str`, `UdfReadError`, `make_udf(...)` (Görev 1).
- Produces: `DocumentType.UDF` (`"udf"`). API'de `file_type: "udf"`. `extract_text(DocumentType.UDF, raw) -> str | None`: metin boşsa (yalnızca boşluk) ya da okunamıyorsa `None` döner.

- [ ] **Adım 1: Hata vermesi beklenen testleri yaz**

`tests/api/test_documents.py` (mevcut `_auth_headers`, `_create_case` yardımcıları kullanılır):

```python
def test_upload_udf_extracts_text_and_downloads_original(client, two_firms_two_users):   # Review Focus 2
    headers = _auth_headers(client, two_firms_two_users); case = _create_case(client, headers)
    raw = make_udf("Bilirkişi incelemesi tamamlanmıştır.", signed=True)
    body = client.post(f"/cases/{case['id']}/documents",
                       files={"file": ("Bilirkişi Raporu.udf", raw, "application/octet-stream")}, headers=headers).json()
    assert body["file_type"] == "udf" and body["filename"] == "Bilirkişi Raporu.udf"
    assert "Bilirkişi incelemesi tamamlanmıştır." in body["extracted_text"]
    download = client.get(f"/documents/{body['id']}/download", headers=headers)
    assert download.status_code == 200 and download.content == raw
    assert download.headers["content-type"] == "application/octet-stream"
    assert "Bilirki%C5%9Fi%20Raporu.udf" in download.headers["content-disposition"]

def test_upload_uppercase_udf_extension(client, two_firms_two_users):                    # Review Focus 1
    ... ("KARAR.UDF", make_udf("Karar"), ...) → 201, file_type == "udf"

def test_broken_or_scanned_udf_is_saved_without_text(client, two_firms_two_users):
    # parametrize: b"not a zip" ve make_udf("   ")
    ... → 201, file_type == "udf", extracted_text is None

def test_unsupported_type_message_lists_udf(client, two_firms_two_users):
    ... ("notlar.rtf", b"x", ...) → 400, "Allowed: pdf, docx, txt, udf." in detail
```

`tests/api/test_case_intake.py` (mevcut `_headers`, `_extract` yardımcıları kullanılır):

```python
def test_a_udf_file_is_read(client, two_firms_two_users):
    → files={"file": ("dilekce.udf", make_udf("Kira alacağı davası"), "application/octet-stream")} → 200

def test_an_unreadable_udf_is_rejected_with_the_hint(client, two_firms_two_users):
    → b"not a zip" as "bozuk.udf" → 422, detail == NOT_READABLE (routes.case_intake'tan import edilir)
```

`tests/unit/test_import_cases.py`: `test_imports_udf_document` — mevcut `_write(tmp_path, [{**CASE, "documents": [{"file": "karar.udf"}]}], files={"karar.udf": make_udf("İlk derece kararı")})`. Beklenti: içe aktarılan `Document`'ın `file_type == DocumentType.UDF` olması ve `"İlk derece kararı" in extracted_text`.

`tests/integration/test_document_type_udf_migration.py`: `test_udf_migration_upgrades_and_downgrades_on_sqlite`. `test_clients_migration.py`'deki `_alembic_config` ve `monkeypatch.setattr(settings, "database_url", ...)` deseni kullanılır. Adımlar: `upgrade("0244bf696c5e")` → `upgrade("head")` → `alembic_version` `e2b4d6f8a1c3` olmalı → `downgrade("0244bf696c5e")` hatasız çalışmalı.

- [ ] **Adım 2: Testlerin hata verdiğini doğrula**

Çalıştır: `python -m pytest tests/api/test_documents.py tests/api/test_case_intake.py tests/unit/test_import_cases.py tests/integration/test_document_type_udf_migration.py -q`
Beklenen: yeni testler FAIL (`.udf` için 400, migration revizyonu bulunamıyor); eski testler PASS.

- [ ] **Adım 3: Kodu yaz**

- Migration: `upgrade()` yalnızca PostgreSQL'de `op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'udf'")` çalıştırır; `downgrade()` hiçbir şey yapmaz. `fa28b1d90311_criminal_case_type.py`'deki desen ve açıklama satırı aynen kullanılır.
- `extract_text`: `DocumentType.UDF` dalında `read_udf_text(raw_bytes)` çağrılır; sonuç `.strip()` sonrası boşsa `None` döner. `UdfReadError` mevcut `except Exception` bloğuna düşer; bu blok içerik yazmadan `udf` türünü kaydeder ve `None` döndürür.
- `case_intake.py` rotası değişmez; `resolve_document_type` ve `extract_text` üzerinden kendiliğinden çalışır.
- Mevcut `test_an_unsupported_file_type_is_a_400` (`"Unsupported file type '.png'" in detail`) olduğu gibi geçmeye devam etmelidir.

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: Adım 2'deki komut.
Beklenen: tümü PASS.

- [ ] **Adım 5: Commit**

```bash
git add backend/app backend/alembic/versions/e2b4d6f8a1c3_document_type_udf.py backend/tests
git commit -m "feat: accept UDF documents in case uploads, intake and CLI import"
```

---

### Task 3: Gizlilik aracında UDF

**Files:**
- Modify: `backend/app/privacy/files.py` (`extract_document` içinde UDF tespiti ve `_udf`)
- Modify: `backend/app/api/routes/privacy.py` (`ExtractedText.format: Literal["pdf", "docx", "udf", "text"]`)
- Test: `backend/tests/api/test_privacy_files.py`

**Interfaces:**
- Consumes: `is_udf`, `read_udf_text`, `UdfReadError`, `INVALID_UDF` (Görev 1); `make_udf` (Görev 1).
- Produces:
  - `/privacy/extract-text` yanıtı `{"text", "format": "udf", "warnings": [UDF_WARNING]}`.
  - `app.privacy.files` içinde `UDF_WARNING = "UDF içindeki tablolar düz metin olarak alındı; görseller ve biçimlendirme okunmadı."`

- [ ] **Adım 1: Hata vermesi beklenen testleri yaz (`tests/api/test_privacy_files.py`; `reader_user` ve `upload` yardımcıları kullanılır)**

```python
def test_udf_extract_through_isolated_worker(client, reader_user):
    response = upload(client, make_udf("sentetik@example.test", header="ustbilgi@example.test", table=["tablo@example.test"]))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["format"] == "udf" and body["warnings"] == [UDF_WARNING]
    assert all(s in body["text"] for s in ("sentetik@example.test", "ustbilgi@example.test", "tablo@example.test"))

def test_odt_like_zip_is_not_treated_as_udf(client, reader_user):                       # Review Focus 5
    # zip with "mimetype" = b"application/vnd.oasis.opendocument.text" and an office:document-content content.xml
    assert response.status_code == 422
    assert response.json()["detail"] == "Bu ikili dosyadan metin çıkarılamadı. PDF, DOCX veya düz metin dosyası seçin."

def test_invalid_udf_returns_fixed_message(client, reader_user):
    # make_udf(content_xml=<DOCTYPE with "gizli-icerik">)
    assert response.status_code == 422 and response.json()["detail"] == INVALID_UDF
    assert "gizli-icerik" not in response.text

def test_udf_without_text_needs_ocr(client, reader_user):
    response = upload(client, make_udf("   "))
    assert response.status_code == 422
    assert response.json()["detail"].startswith("Belgede okunabilir metin bulunamadı.")
```

- [ ] **Adım 2: Testlerin hata verdiğini doğrula**

Çalıştır: `python -m pytest tests/api/test_privacy_files.py -q`
Beklenen: yeni testler FAIL (UDF şu an DOCX sanılıyor ve 422 veriyor); eski testler PASS.

- [ ] **Adım 3: Kodu yaz**

- `extract_document`: `raw.startswith(b'PK\x03\x04')` dalında önce `is_udf(raw)` kontrol edilir. Doğruysa `text, warnings = _udf(raw); kind = 'udf'`; değilse bugünkü `_docx` yolu izlenir.
- `_udf(raw)`: `read_udf_text` çağrılır; `UdfReadError` gelirse `ExtractionError(str(exc))` `from None` ile fırlatılır. Ardından `_check_length(len(text))` uygulanır ve `text, [UDF_WARNING]` döndürülür.
- Mevcut boş metin ve 30.000 karakter kontrolleri değişmez.

- [ ] **Adım 4: Testlerin geçtiğini doğrula**

Çalıştır: `python -m pytest tests/api/test_privacy_files.py tests/api/test_privacy.py -q`
Beklenen: tümü PASS.

- [ ] **Adım 5: Commit**

```bash
git add backend/app/privacy/files.py backend/app/api/routes/privacy.py backend/tests/api/test_privacy_files.py
git commit -m "feat: read UDF files in the privacy tool"
```

---

### Task 4: Frontend

**Files:**
- Modify: `frontend/src/types/index.ts:466`. `file_type: "pdf" | "docx" | "txt" | "udf"`.
- Modify: `frontend/src/lib/api.ts:872`. `format: "pdf" | "docx" | "udf" | "text"`.
- Modify: `frontend/src/lib/filters.ts:226`. `DOCUMENT_TYPES` listesine `"udf"` eklenir.
- Modify: `frontend/src/components/DocumentsView.tsx`. `<option value="udf">UDF</option>` eklenir.
- Modify: `frontend/src/lib/caseIntake.ts`:
  - `DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".udf"]`;
  - mesaj: `` `${file.name} desteklenmeyen bir dosya türü (pdf, docx, txt, udf).` ``
- Modify: `frontend/src/components/CaseDocumentsPanel.tsx`:
  - `accept={DOCUMENT_EXTENSIONS.join(",")}`;
  - etiket: `"Belge Yükle (PDF, DOCX, TXT, UDF)"`;
  - boş liste ipucu: `"Bu davaya PDF, DOCX, TXT veya UDF belge yükleyin."`
- Modify: `frontend/src/components/CaseCloseModal.tsx`. `accept={DOCUMENT_EXTENSIONS.join(",")}`.
- Modify: `frontend/src/components/case-form/IntakeFillBox.tsx`. Metin: `"pdf, docx, txt veya udf · en fazla 10 MB"`.
- Modify: `frontend/src/components/case-form/FollowUpFields.tsx`. Metin: `"pdf, docx, txt veya udf · her biri en fazla 10 MB"`.
- Modify: `frontend/src/components/ai/AnonymizationView.tsx`. İki metin değişir:
  - açıklama: `"PDF, DOCX, UDF, TXT ve okunabilir metin içeren diğer dosyalar. En fazla 5 MB, 100 PDF sayfası ve 30.000 karakter. DOCX ve UDF açılmış içerik sınırı 16 MB / 512 öğedir. Taranmış görseller için önce OCR gerekir; bu araç OCR yapmaz. Dosyalar kaydedilmez."`
  - yedek hata mesajı: `"Dosya okunamadı. PDF, DOCX, UDF veya düz metin kopyası deneyin."`
- Test (eski metinleri güncelle, yeni durumları ekle):
  - `src/lib/__tests__/caseIntake.test.ts`
  - `src/lib/__tests__/filters.test.ts`
  - `src/components/__tests__/CaseCloseModal.test.tsx`
  - `src/components/__tests__/CaseFormSections.test.tsx`
  - `src/components/__tests__/IntakeFillBox.test.tsx`
  - `src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx`
  - `src/components/__tests__/AnonymizationView.test.tsx`

**Interfaces:**
- Consumes: backend'in `file_type: "udf"` ve `format: "udf"` değerleri (Görev 2 ve 3).

- [ ] **Adım 1: Testleri güncelle ve yenilerini ekle**

- `caseIntake.test.ts`:
  - "accepts pdf, docx and txt up to 10 MB" testinin adı "accepts pdf, docx, txt and udf up to 10 MB" olur;
  - `checkDocumentFile(new File(["x"], "karar.udf"))` ve `"KARAR.UDF"` için sonuç `null` olmalı;
  - `.png` mesajı `"resim.png desteklenmeyen bir dosya türü (pdf, docx, txt, udf)."` olur.
- `filters.test.ts`: `parseDocumentListQuery(new URLSearchParams("tur=udf"))` sonucu `{ tur: "udf" }` olmalı; `filterDocuments` yalnızca `file_type === "udf"` olan belgeleri bırakmalı.
- `CaseFormSections.test.tsx:276`: `accept` değeri `".pdf,.docx,.txt,.udf"` olur. Satır 284 ve 368'deki mesaj yeni metinle değişir.
- `CaseCloseModal.test.tsx:129` ve `IntakeFillBox.test.tsx:93`: mesajlar yeni metinle değişir. `CaseCloseModal`'a yeni bir test eklenir: dosya girdisinin `accept` değeri `".pdf,.docx,.txt,.udf"` olmalı.
- `CaseDocumentsPanelReadOnly.test.tsx:34`: ipucu metni yeni metinle değişir. Yazılabilir (salt okunur olmayan) durumda dosya girdisinin `accept` değeri `".pdf,.docx,.txt,.udf"` olmalı.
- `AnonymizationView.test.tsx`: mevcut "loads a document…" testinin kalıbıyla yeni bir test eklenir. `extractPrivacyFile` `{format: "udf", warnings: ["UDF içindeki tablolar düz metin olarak alındı; görseller ve biçimlendirme okunmadı."]}` döndürdüğünde ekranda "Okunan biçim: UDF" ve uyarı metni görünmeli.

- [ ] **Adım 2: Testlerin hata verdiğini doğrula**

Çalıştır: `npx vitest run src/lib/__tests__/caseIntake.test.ts src/lib/__tests__/filters.test.ts src/components/__tests__/CaseCloseModal.test.tsx src/components/__tests__/CaseFormSections.test.tsx src/components/__tests__/IntakeFillBox.test.tsx src/components/__tests__/CaseDocumentsPanelReadOnly.test.tsx src/components/__tests__/AnonymizationView.test.tsx`
Beklenen: değişen ve yeni testler FAIL.

- [ ] **Adım 3: Yukarıdaki Files listesindeki değişiklikleri yap**

Değişen tek metin kaynağı bu plandaki metinlerdir. `grep -rn "pdf, docx\|PDF, DOCX\|\.pdf,\.docx" frontend/src` komutuyla eski metnin kalmadığını kontrol et. Yalnızca `AnonymizationView`'daki "DOCX açılmış" ifadesi bilinçli olarak "DOCX ve UDF açılmış" şeklinde değişmiştir.

- [ ] **Adım 4: Testlerin ve tür kontrolünün geçtiğini doğrula**

Çalıştır: Adım 2'deki komut, ardından `npx tsc --noEmit`.
Beklenen: tümü PASS, tür hatası yok.

- [ ] **Adım 5: Commit**

```bash
git add frontend/src
git commit -m "feat: accept UDF files in the web app"
```

---

### Task 5: Tüm doğrulama

- [ ] **Adım 1:** `backend/` içinde `python -m pytest -q` çalıştır. Beklenen: tümü PASS (gerçek sağlayıcı testleri varsayılan olarak hariçtir).
- [ ] **Adım 2:** `frontend/` içinde `npx vitest run` ve `npx tsc --noEmit` çalıştır. Beklenen: tümü PASS.
