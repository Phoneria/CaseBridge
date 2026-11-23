"""Plain text of a UDF (UYAP Doküman Formatı) file.

A UDF is a ZIP archive whose content.xml holds the whole document text in
<template><content> (usually CDATA); <elements> only points into that text by
offset, so headers, footers and table cells are already in it. Only this text
is read: the e-signature (sign.sgn), documentproperties.xml and embedded media
are never opened.

Standard library only, so the privacy tool's isolated worker can import it.
Errors carry one of two fixed messages and never document content.
"""
import io
import zipfile
from xml.etree import ElementTree

MAX_MEMBERS = 512
MAX_EXPANDED = 16 * 1024 * 1024

INVALID_UDF = "Bu dosya geçerli bir UDF değil. Belgeyi UYAP'tan yeniden indirip yükleyin."
UDF_LIMIT = "UDF açılmış içerik sınırını aşıyor (16 MB / 512 öğe); belge işlenmedi."


class UdfReadError(ValueError):
    """A UDF that cannot be read; the message is INVALID_UDF or UDF_LIMIT."""


class _NoDtdTreeBuilder(ElementTree.TreeBuilder):
    def doctype(self, name, pubid, system):
        raise UdfReadError(INVALID_UDF)


def read_udf_text(raw: bytes) -> str:
    """The document text with line endings normalized to "\\n" ("" when it has none)."""
    try:
        return _read(raw)
    except UdfReadError:
        raise
    except Exception:
        raise UdfReadError(INVALID_UDF) from None


def is_udf(raw: bytes) -> bool:
    """True for a ZIP with content.xml that is neither DOCX nor OpenDocument. Never raises."""
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = set(archive.namelist())
    except Exception:
        return False
    return "content.xml" in names and "word/document.xml" not in names and "mimetype" not in names


def _read(raw: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = archive.infolist()
        if len(members) > MAX_MEMBERS or sum(member.file_size for member in members) > MAX_EXPANDED:
            raise UdfReadError(UDF_LIMIT)
        names = [member.filename for member in members]
        if len(set(names)) != len(names) or any(member.flag_bits & 1 for member in members):
            raise UdfReadError(INVALID_UDF)
        if "content.xml" not in names:
            raise UdfReadError(INVALID_UDF)
        with archive.open("content.xml") as stream:
            xml = stream.read(MAX_EXPANDED + 1)
    if len(xml) > MAX_EXPANDED:
        raise UdfReadError(UDF_LIMIT)

    root = ElementTree.fromstring(xml, parser=ElementTree.XMLParser(target=_NoDtdTreeBuilder()))
    if root.tag != "template":
        raise UdfReadError(INVALID_UDF)
    content = root.find("content")
    text = content.text if content is not None and content.text else ""
    return text.replace("\r\n", "\n").replace("\r", "\n")
