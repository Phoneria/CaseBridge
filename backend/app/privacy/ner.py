"""Yerel Türkçe NER (BERTurk) ile kayıtlı olmayan kişi adlarını bulur.

İsteğe bağlı: torch + transformers yoksa ya da model yüklenemezse boş döner (sessizce
kural/bilinen-değer katmanlarına düşer; çağıran ``available()`` ile kontrol edebilir).
Yalnızca PER (kişi) maskelenir: mahkeme/yer adları hukuki analiz için gereklidir.
"""
from __future__ import annotations

import logging
import re
import threading

log = logging.getLogger(__name__)
MODEL = "savasy/bert-base-turkish-ner-cased"
_lock = threading.Lock()
_pipe = None
_failed = False


def _get():
    global _pipe, _failed
    if _pipe is not None or _failed:
        return _pipe
    with _lock:
        if _pipe is None and not _failed:
            try:
                from transformers import pipeline

                _pipe = pipeline("token-classification", model=MODEL, aggregation_strategy="simple", device=-1)
            except Exception as exc:  # torch/transformers/model yok
                _failed = True
                log.warning("NER yüklenemedi, yalnızca kural katmanı kullanılacak: %s", type(exc).__name__)
    return _pipe


def available() -> bool:
    return _get() is not None


def _chunks(text: str, size: int = 1200):
    a = 0
    n = len(text)
    while a < n:
        b = min(n, a + size)
        if b < n:
            cut = max(text.rfind("\n", a, b), text.rfind(". ", a, b), text.rfind(" ", a, b))
            if cut > a + size // 2:
                b = cut + 1
        yield a, text[a:b]
        a = b


def fold_caps(text: str) -> str:
    """BÜYÜK HARFLİ kelimeleri (>=3 harf) Title Case yapar; uzunluk ve konumlar aynı kalır.
    Cased NER, ALL-CAPS isimleri ("MEHMET YILMAZ") kaçırır; belge türünden bağımsız çözüm budur."""
    from app.privacy.anonymizer import _lower

    def fix(m):
        w = m.group()
        return w[0] + _lower(w[1:])

    return re.sub(r"(?<![\wçğıöşü])[A-ZÇĞİÖŞÜ]{3,}(?![\wçğıöşü])", fix, text)


_KIND = {"PER": "KİŞİ", "LOC": "YER", "ORG": "KURUM-NER"}


def detect(text: str, min_score: float = 0.85, kinds=("PER", "LOC", "ORG")):
    """PER/LOC/ORG aralıklarını döndürür (özgün metnin konumlarıyla). Model yoksa []."""
    from app.privacy.anonymizer import _lower

    pipe = _get()
    if pipe is None:
        return []
    folded = fold_caps(text)
    spans = []
    for off, chunk in _chunks(folded):
        for e in pipe(chunk):
            g = e["entity_group"]
            if g not in kinds or float(e["score"]) < min_score:
                continue
            a, b = off + e["start"], off + e["end"]
            name = text[a:b].strip()
            if len(name) < 3:
                continue
            spans.append((a, a + len(name), _KIND[g], f"{_KIND[g]}:" + _lower(name)))
    return spans


def detect_persons(text: str, min_score: float = 0.85):
    return [(a, b, k, "kisi:" + key.split(":", 1)[1]) for a, b, k, key in detect(text, min_score, ("PER",))]


def detect_all(text: str):
    return detect(text)
