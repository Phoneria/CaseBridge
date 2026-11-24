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


def odt_like_zip() -> bytes:
    """An OpenDocument text file also has a root content.xml; it is not a UDF."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", b"application/vnd.oasis.opendocument.text")
        archive.writestr(
            "content.xml",
            b'<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>',
        )
    return out.getvalue()
