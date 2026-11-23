"""UDF (UYAP Doküman Formatı) text reader."""
import io
import zipfile

import pytest

from app.services.udf_reader import INVALID_UDF, UDF_LIMIT, UdfReadError, is_udf, read_udf_text
from tests.udf_samples import make_udf, odt_like_zip


def _read_error(raw: bytes) -> str:
    with pytest.raises(UdfReadError) as exc:
        read_udf_text(raw)
    return str(exc.value)


def test_reads_turkish_text_from_cdata():
    text = "Davacı: Çağrı Öztürk — İşçilik alacağı"
    assert text in read_udf_text(make_udf(text))


def test_header_and_table_text_are_included():
    text = read_udf_text(make_udf("Gövde", header="T.C. İSTANBUL 3. İŞ MAHKEMESİ", table=["Esas No", "2026/123"]))
    assert "T.C. İSTANBUL 3. İŞ MAHKEMESİ" in text and "Esas No" in text and "2026/123" in text


def test_signed_udf_is_read_and_signature_ignored():
    assert "İmzalı karar" in read_udf_text(make_udf("İmzalı karar", signed=True))


def test_crlf_and_cr_become_lf():
    text = read_udf_text(make_udf("a\r\nb\rc"))
    assert "a\nb\nc" in text and "\r" not in text


def test_escaped_carriage_return_character_references_become_lf():
    xml = b'<template format_id="1.8"><content>a&#13;&#10;b&#13;c</content></template>'
    assert read_udf_text(make_udf(content_xml=xml)) == "a\nb\nc"


def test_escaped_text_without_cdata():
    assert "A & B <C>" in read_udf_text(make_udf("A & B <C>", cdata=False))


def test_declared_windows_1254_encoding():
    text = "Şirket ğüşıöç İĞÜŞÖÇ"
    assert text in read_udf_text(make_udf(text, encoding="windows-1254"))


def test_missing_content_element_reads_as_empty():
    assert read_udf_text(make_udf(content_xml=b'<template format_id="1.8"><elements/></template>')) == ""


@pytest.mark.parametrize("raw", [b"%PDF-1.4 not a zip", b"", b"PK\x03\x04broken"])
def test_non_zip_is_invalid(raw):
    assert _read_error(raw) == INVALID_UDF


def test_zip_without_content_xml_is_invalid():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("sign.sgn", b"\x30\x82")
    assert _read_error(out.getvalue()) == INVALID_UDF


def test_wrong_root_is_invalid():
    xml = b'<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>'
    assert _read_error(make_udf(content_xml=xml)) == INVALID_UDF


def test_malformed_xml_is_invalid():
    assert _read_error(make_udf(content_xml=b"<template><content>yarim")) == INVALID_UDF


def test_doctype_is_rejected_without_leaking_text():
    xml = b'<?xml version="1.0"?><!DOCTYPE t [<!ENTITY a "gizli-icerik">]><template><content>&a;</content></template>'
    message = _read_error(make_udf(content_xml=xml))
    assert message == INVALID_UDF and "gizli-icerik" not in message


def test_too_many_members_hits_the_limit():
    raw = make_udf(extra_members={f"img/{i}.png": b"x" for i in range(512)})  # 513 members
    assert _read_error(raw) == UDF_LIMIT


def test_exactly_the_member_limit_is_read():
    raw = make_udf("Sınırda", extra_members={f"img/{i}.png": b"x" for i in range(511)})  # 512 members
    assert "Sınırda" in read_udf_text(raw)


def test_expanded_size_hits_the_limit():
    raw = make_udf(extra_members={"img/big.bin": b"\0" * (16 * 1024 * 1024 + 1)})
    assert _read_error(raw) == UDF_LIMIT


def test_encrypted_member_is_invalid():
    # zipfile resets flag_bits when writing, so set bit 0 of content.xml's
    # general-purpose flag by hand in the local header and the central directory.
    raw = bytearray(make_udf("Şifreli"))
    local = raw.index(b"PK\x03\x04")
    central = raw.index(b"PK\x01\x02")
    raw[local + 6] |= 1
    raw[central + 8] |= 1
    assert _read_error(bytes(raw)) == INVALID_UDF


def test_is_udf():
    from docx import Document as DocxDocument

    docx_buffer = io.BytesIO()
    DocxDocument().save(docx_buffer)

    assert is_udf(make_udf())
    assert not is_udf(b"%PDF-1.4")
    assert not is_udf(b"PK\x03\x04broken")
    assert not is_udf(docx_buffer.getvalue())
    assert not is_udf(odt_like_zip())
