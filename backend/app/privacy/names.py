"""Kişi adı sezgileri (NER'e ek, yerel): büyük harfli isimler, etiketli satırlar, soyad yayma.

Cased BERT NER, "HAKİM : KAAN ZİLCİ" ya da "Av. Fatih PEKASİL" gibi UYAP kalıplarını sık kaçırır;
bulunan her ismin soyadı/adı metnin geri kalanında da (ek almış hâlleriyle) aranır.
"""
from __future__ import annotations

import re

from app.privacy.policy import Policy

Span = tuple[int, int, str, str]
_UP = "A-ZÇĞİÖŞÜ"
_WORD = re.compile(r"[A-Za-zÇĞİÖŞÜçğıöşüÂâÎî]+")
_NAME_A = re.compile(rf"(?<![\wçğıöşü])((?:[{_UP}][a-zçğıöşü]{{2,}}[ \t]){{1,3}})([{_UP}]{{3,}})(?![\wçğıöşü])")
_NAME_B = re.compile(rf"(?:HAKİM|KATİP|BAŞKAN|ÜYE|SAVCI)\s*:\s*((?:[{_UP}]{{2,}}\s){{1,2}}[{_UP}]{{2,}})(?:\s+\d{{5,7}})?")


def _lower(s: str) -> str:
    return s.translate(str.maketrans({"İ": "i", "I": "ı"})).lower()


def heuristic_spans(text: str, pol: Policy) -> list[Span]:
    out: list[Span] = []
    for m in _NAME_A.finditer(text):
        if m.group(2) in pol.buyuk_harf_yoksay or any(w.strip() in pol.mahkeme_sozcukleri for w in m.group(1).split()):
            continue
        start = m.start()
        for w in re.finditer(r"\S+[ 	]", m.group(1)):  # baştaki rol sözcüklerini (Davalı, Av....) ada katma
            if _lower(w.group().strip(" .	")) in pol.rol_sozcukleri:
                start = m.start(1) + w.end()
            else:
                break
        if start < m.start(2):
            out.append((start, m.end(), "KİŞİ", ""))
    for m in _NAME_B.finditer(text):
        out.append((m.start(1), m.end(), "KİŞİ", ""))
    return out


def normalize(text: str, detected: list[Span], pol: Policy, known: dict[str, str] | None = None) -> list[Span]:
    """Dedektör çıktısını kelime sınırına genişletir, yasak sözcükleri eler, soyadı anahtarı verir ve
    bulunan adları metnin başka yerlerinde de (büyük harfle başlayan, ek almış hâlleriyle) arar."""
    known = known or {}
    low = _lower(text)
    out: list[Span] = []
    toks: set[str] = set()
    for a, b, kind, _ in detected:
        if kind != "KİŞİ":
            continue
        while a > 0 and text[a - 1].isalnum():
            a -= 1
        while b < len(text) and text[b].isalnum():
            b += 1
        words = _WORD.findall(text[a:b])
        if not words or any(_lower(w) in pol.kisi_yoksay for w in words):
            continue
        core = re.split(r"['’]", text[a:b])[0].rstrip()
        out.append((a, a + len(core), "KİŞİ", known.get(_lower(words[-1]), "kisi:" + _lower(words[-1]))))
        toks.update(w for w in _WORD.findall(core) if len(w) >= 4)
    for tok in toks:
        rx = re.compile(r"(?<![\wçğıöşü])" + re.escape(_lower(tok)) + r"(?![\wçğıöşü])")
        for m in rx.finditer(low):
            if text[m.start()].isupper():
                out.append((m.start(), m.end(), "KİŞİ", known.get(_lower(tok), "kisi:" + _lower(tok))))
    return out


def city_spans(text: str, low: str, pol: Policy) -> list[Span]:
    if not pol.sehirler:
        return []
    alt = "|".join(re.escape(_lower(c)) for c in sorted(pol.sehirler, key=len, reverse=True))
    rx = re.compile(rf"(?<![\wçğıöşü])(?:{alt})(?=['’]|(?![\wçğıöşü]))")
    return [(m.start(), m.end(), "ŞEHİR", "ŞEHİR:" + m.group()) for m in rx.finditer(low)]
