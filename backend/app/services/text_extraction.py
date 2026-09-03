"""Best-effort text extraction for supported document types.

Extraction failures must never crash the upload flow — a malformed or
unparseable file simply ends up with extracted_text=None. Log the
failure (without file content) for later manual review.
"""
import io
import logging

from app.models.document import DocumentType

logger = logging.getLogger("casebridge")


def extract_text(file_type: DocumentType, raw_bytes: bytes) -> str | None:
    try:
        if file_type == DocumentType.TXT:
            return raw_bytes.decode("utf-8", errors="replace")

        if file_type == DocumentType.DOCX:
            from docx import Document as DocxDocument

            doc = DocxDocument(io.BytesIO(raw_bytes))
            return "\n".join(p.text for p in doc.paragraphs if p.text)

        if file_type == DocumentType.PDF:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(raw_bytes))
            return "\n".join(page.extract_text() or "" for page in reader.pages)

    except Exception:
        logger.warning("Text extraction failed for a %s document", file_type.value)
        return None

    return None
