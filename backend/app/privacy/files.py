"""Bounded, in-memory document readers for the privacy tool. No storage or network."""
import io
import logging
import json
import os
import subprocess
import sys
from pathlib import Path
import re
import zipfile
from contextvars import ContextVar
from xml.etree import ElementTree

MAX_BYTES = 5 * 1024 * 1024
MAX_TEXT = 30000
MAX_PAGES = 100
MAX_EXPANDED = 16 * 1024 * 1024
_PRIVATE_READER = ContextVar('privacy_reader', default=False)


class ExtractionError(ValueError):
    """Only fixed user-safe messages; never include parser details."""


class _ReaderLogFilter(logging.Filter):
    def filter(self, record):
        return not (_PRIVATE_READER.get() and record.name.startswith('pypdf'))


_FILTER = _ReaderLogFilter()


def _check_length(length):
    if length > MAX_TEXT:
        raise ExtractionError('Belgedeki metin 30.000 karakter sınırını aşıyor. Daha küçük bir belge seçin; metin kırpılmadı.')



def _pdf(raw):
    from pypdf import PdfReader
    # Parser diagnostics may contain document fragments. Filter only this
    # extraction context, leaving other threads and application logs unchanged.
    for handler in logging.getLogger().handlers:
        handler.addFilter(_FILTER)
    token = _PRIVATE_READER.set(True)
    try:
        reader = PdfReader(io.BytesIO(raw), strict=True)
        if reader.is_encrypted:
            raise ExtractionError('Şifreli PDF okunamıyor. Şifresiz bir kopya yükleyin.')
        if len(reader.pages) > MAX_PAGES:
            raise ExtractionError('PDF en fazla 100 sayfa olabilir; belge kırpılmadı.')
        parts, empty, length = [], 0, 0
        for page in reader.pages:
            text = page.extract_text() or ''
            empty += not text.strip()
            length += len(text) + bool(parts)
            _check_length(length)
            parts.append(text)
        warnings = ['PDF içindeki görseller OCR ile okunmaz. Çıkarılan metni belgeyle karşılaştırın.']
        if empty:
            warnings.append(f'{empty} sayfada okunabilir metin bulunamadı. Bu sayfalar boş veya taranmış olabilir; gerekiyorsa önce OCR uygulayın.')
        return '\n'.join(parts), warnings
    finally:
        _PRIVATE_READER.reset(token)


class _NoDtdTreeBuilder(ElementTree.TreeBuilder):
    def doctype(self, name, pubid, system):
        raise ExtractionError('Bu DOCX güvenli biçimde okunamıyor. Belgeyi yeniden DOCX olarak kaydedin.')


def _docx(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = archive.infolist()
        if len(members) > 512 or sum(p.file_size for p in members) > MAX_EXPANDED:
            raise ExtractionError('DOCX açılmış içerik sınırını aşıyor (16 MB / 512 öğe); belge işlenmedi.')
        if len({p.filename for p in members}) != len(members) or any(p.flag_bits & 1 for p in members):
            raise ExtractionError('Şifreli veya geçersiz DOCX okunamıyor. Geçerli, şifresiz bir kopya yükleyin.')
        names = {p.filename for p in members}
        if 'word/document.xml' not in names:
            raise ExtractionError('Bu ikili dosyadan metin çıkarılamadı. PDF, DOCX veya düz metin dosyası seçin.')
        parts = sorted(n for n in names if re.fullmatch(r'word/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml', n))
        parts.remove('word/document.xml'); parts.insert(0, 'word/document.xml')
        out, length = [], 0
        w = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        for part in parts:
            xml = archive.read(part)
            root = ElementTree.fromstring(xml, parser=ElementTree.XMLParser(target=_NoDtdTreeBuilder()))
            for node in root.iter():
                if node.tag in {w+'t', w+'delText', w+'instrText'}:
                    text = node.text or ''
                elif node.tag in {w+'p', w+'br', w+'cr'}:
                    text = '\n'
                elif node.tag == w+'tab':
                    text = '\t'
                else:
                    continue
                length += len(text)
                _check_length(length)
                out.append(text)
        warnings = []
        if any(n.startswith(('word/media/', 'word/embeddings/', 'word/charts/', 'word/diagrams/', 'customXml/')) for n in names):
            warnings.append('DOCX içindeki görseller, grafikler, özel XML ve gömülü dosyalar okunmadı. Gerekirse bunları ayrı yükleyin veya önce OCR uygulayın.')
        return ''.join(out), warnings


def _plain(raw):
    encoding = 'utf-16' if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
    try:
        text = raw.decode(encoding)
    except UnicodeError:
        raise ExtractionError('Dosya okunabilir düz metin değil. PDF, DOCX, UTF-8 veya UTF-16 metin kopyası yükleyin.') from None
    if any(not (c.isprintable() or c in '\n\r\t') for c in text):
        raise ExtractionError('Bu ikili dosyadan metin çıkarılamadı. PDF, DOCX veya düz metin dosyası seçin.')
    return text


def extract_document(raw):
    if not raw:
        raise ExtractionError('Dosya boş. Metin içeren bir belge seçin.')
    if len(raw) > MAX_BYTES:
        raise ExtractionError('Dosya en fazla 5 MB olabilir.')
    try:
        if raw.startswith(b'%PDF-'):
            text, warnings = _pdf(raw); kind = 'pdf'
        elif raw.startswith(b'PK\x03\x04'):
            text, warnings = _docx(raw); kind = 'docx'
        else:
            text, warnings, kind = _plain(raw), [], 'text'
    except ExtractionError:
        raise
    except Exception:
        raise ExtractionError('Belge okunamadı. Bozuk veya desteklenmeyen içerik olabilir; geçerli PDF, DOCX veya düz metin kopyası yükleyin.') from None
    _check_length(len(text))
    if not text.strip():
        raise ExtractionError('Belgede okunabilir metin bulunamadı. Taranmış belge veya görsel için önce OCR uygulayın; bu araç OCR yapmaz.')
    return {'text': text, 'format': kind, 'warnings': warnings}


def extract_document_isolated(raw):
    """Limit parser CPU/memory without temporary files or shared-process patches."""
    worker = Path(__file__).with_name('file_worker.py')
    try:
        process = subprocess.run(
            [sys.executable, '-I', str(worker), str(worker.parents[2])],
            input=raw, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={'PATH': os.defpath, 'LANG': 'C.UTF-8'}, timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise ExtractionError('Belge 15 saniyelik işlem sınırı içinde okunamadı. Daha küçük veya yeniden kaydedilmiş bir kopya yükleyin.') from None
    if process.returncode:
        raise ExtractionError('Belge güvenli kaynak sınırları içinde okunamadı. Daha küçük veya yeniden kaydedilmiş bir kopya yükleyin.')
    try:
        result = json.loads(process.stdout)
    except (ValueError, UnicodeError):
        raise ExtractionError('Belge okunamadı. Geçerli PDF, DOCX veya düz metin kopyası yükleyin.') from None
    if 'error' in result:
        raise ExtractionError(result['error'])
    return result
