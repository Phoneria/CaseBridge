"""Dava metni anonimleştirme (yerel, dış servis çağırmaz).

Katmanlar:
  1. Bilinen kimlikler  – dava kaydındaki taraf/avukat adları ve kesin değerler (TC, adres...)
     metinde ek almış hâlleriyle (Ahmet'in, AHMET) bulunup tutarlı etiketle değiştirilir.
  2. Kural tabanlı kalıplar – TC kimlik (sağlamalı), telefon, e-posta, IBAN, plaka, adres,
     doğum tarihi.
  3. Sızıntı kontrolü – bilinen değerlerin çıktıda kalıp kalmadığı doğrulanır.

Katman 3'e bilinmeyen isimleri bulan yerel NER eklenebilir (``extra_detectors``);
şu an yoktur: dosyada KAYITLI OLMAYAN kişi adları (ör. tanık) maskelenmez.
Hiçbir otomatik yöntem tam garanti vermez; sonuç insan kontrolüyle kullanılmalıdır.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Iterable

_UP = "A-ZÇĞİÖŞÜ"
_TR_LOWER = str.maketrans({"İ": "i", "I": "ı"})
Span = tuple[int, int, str, str]  # start, end, tür, kimlik-anahtarı


def _lower(s: str) -> str:
    """Uzunluğu koruyan Türkçe küçük harf (konumlar orijinalle aynı kalır)."""
    return s.translate(_TR_LOWER).lower()


def tc_valid(s: str) -> bool:
    if not re.fullmatch(r"\d{11}", s) or s[0] == "0":
        return False
    d = [int(c) for c in s]
    if ((sum(d[0:9:2]) * 7) - sum(d[1:8:2])) % 10 != d[9]:
        return False
    return sum(d[:10]) % 10 == d[10]


_RULES: list[tuple[str, re.Pattern]] = [
    ("E-POSTA", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("IBAN", re.compile(r"\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b", re.I)),
    ("TELEFON", re.compile(r"(?<!\d)(?:\+90|0)?[\s-]?\(?[2-5]\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)")),
    ("PLAKA", re.compile(rf"\b(?:0[1-9]|[1-7]\d|8[01])\s?[{_UP}]{{1,3}}\s?\d{{2,4}}\b")),
    ("DOĞUM-TARİHİ", re.compile(r"(?i:doğum\s+tarihi|d\.\s?tarihi|doğ\.)\s*[:\-]?\s*\d{1,2}[./]\d{1,2}[./]\d{4}")),
    ("ADRES", re.compile(
        rf"(?:[{_UP}][\wçğıöşü'’.]*\s){{1,3}}"
        rf"(?:Mah\.?|Mahallesi|Sok\.?|Sokak|Sk\.?|Cad\.?|Caddesi|Bulvarı)"
        rf"(?:\s?(?:No|Kapı|Kat|Daire|D)\s?[:.]?\s?\d+(?:\s?/\s?\d+)?)*"
        rf"(?:\s[{_UP}][\wçğıöşü]+\s?/\s?[{_UP}][\wçğıöşü]+)?")),
]
_TC = re.compile(r"(?<!\d)\d{11}(?!\d)")


@dataclass
class Entity:
    """Kayıttan gelen bilinen kimlik. kind: kisi | kurum | deger (kesin metin)."""
    name: str
    kind: str = "kisi"


@dataclass
class Result:
    text: str
    counts: dict[str, int] = field(default_factory=dict)
    leaks: list[str] = field(default_factory=list)  # çıktıda kalan bilinen değer sayısı (değerin kendisi tutulmaz)
    # etiket -> ilk görülen özgün metin. Yalnızca bellekte, yanıtı geri çevirmek için; repr/log'a girmez.
    mapping: dict[str, str] = field(default_factory=dict, repr=False)

    def restore(self, text: str) -> str:
        """Yanıttaki etiketleri özgün değerlerle değiştirir (en uzun etiket önce)."""
        for label in sorted(self.mapping, key=len, reverse=True):
            text = text.replace(label, self.mapping[label])
        return text

    @property
    def ok(self) -> bool:
        return not self.leaks


def _letters_boundary(low: str, a: int, b: int) -> bool:
    before = low[a - 1] if a > 0 else " "
    return not before.isalnum()


def _known_spans(text: str, low: str, ents: Iterable[Entity]) -> list[Span]:
    spans: list[Span] = []
    for e in ents:
        name = e.name.strip()
        if not name:
            continue
        key = f"{e.kind}:{_lower(name)}"
        if e.kind == "deger":
            needles = [name]
        else:
            toks = [t for t in re.split(r"\s+", name) if len(t) >= 3]
            needles = [name] + (toks if e.kind == "kisi" else [])
        for n in sorted(set(needles), key=len, reverse=True):
            nl = re.escape(_lower(n)).replace(r"\ ", r"\s+")
            suffix = r"(?:['’]?[a-zçğıöşü]{0,6})?" if e.kind != "deger" else ""
            for m in re.finditer(nl + suffix, low):
                if _letters_boundary(low, m.start(), m.end()):
                    spans.append((m.start(), m.end(), {"kisi": "KİŞİ", "kurum": "KURUM"}.get(e.kind, "BİLGİ"), key))
    return spans


def _rule_spans(text: str) -> list[Span]:
    spans: list[Span] = []
    for m in _TC.finditer(text):
        if tc_valid(m.group()):
            spans.append((m.start(), m.end(), "TC-KİMLİK", "TC:" + m.group()))
    for label, rx in _RULES:
        for m in rx.finditer(text):
            spans.append((m.start(), m.end(), label, f"{label}:{re.sub(r'[^0-9A-Za-z]', '', _lower(m.group()))}"))
    return spans


def _resolve(spans: list[Span]) -> list[Span]:
    """Çakışmada uzun olan kalır; eşitse önce gelen."""
    out: list[Span] = []
    for s in sorted(spans, key=lambda s: (-(s[1] - s[0]), s[0])):
        if all(s[1] <= o[0] or s[0] >= o[1] for o in out):
            out.append(s)
    return sorted(out)


def anonymize(
    text: str,
    entities: Iterable[Entity] = (),
    extra_detectors: Iterable[Callable[[str], list[Span]]] = (),
) -> Result:
    low = _lower(text)
    ents = list(entities)
    spans = _known_spans(text, low, ents) + _rule_spans(text)
    for det in extra_detectors:  # örn. yerel NER
        spans += det(text)
    spans = _resolve(spans)

    labels: dict[str, str] = {}
    mapping: dict[str, str] = {}
    per_kind: dict[str, int] = {}
    counts: dict[str, int] = {}
    parts: list[str] = []
    pos = 0
    for a, b, kind, key in spans:
        if key not in labels:
            per_kind[kind] = per_kind.get(kind, 0) + 1
            labels[key] = f"[{kind}-{per_kind[kind]}]"
            mapping[labels[key]] = text[a:b]
        parts.append(text[pos:a]); parts.append(labels[key]); pos = b
        counts[kind] = counts.get(kind, 0) + 1
    parts.append(text[pos:])
    clean = "".join(parts)

    clow = _lower(clean)
    leaks = []
    for e in ents:
        nm = _lower(e.name.strip())
        if nm and re.search(r"(?<![^\W_])" + re.escape(nm) + r"(?![^\W_])", clow):
            leaks.append(e.kind)
    for m in _TC.finditer(clean):
        if tc_valid(m.group()):
            leaks.append("tc")
    return Result(text=clean, counts=counts, leaks=leaks, mapping=mapping)
