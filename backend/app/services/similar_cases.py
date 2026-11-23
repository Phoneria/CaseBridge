"""Similar cases, stage 1 (specs/018-similar-cases): no AI call, no new table.

The score is a structured pre-filter (same category, court type, client role,
case value) plus a TF-IDF cosine over the case's own text fields. Everything
is computed per request from the caller's bureau only; the in-process cache is
keyed by bureau and invalidated whenever a case of that bureau changes.
"""
from __future__ import annotations

import math
import re
import threading
import time
import unicodedata
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.case import Case, CaseStatus, CaseType

TEXT_FIELDS = ("case_name", "claim", "facts_summary", "plaintiff_position", "defendant_position", "description")
# Field groups that name a reason; case_name and claim count twice in the vector.
GROUPS = {
    "talep": ("case_name", "claim"),
    "olay": ("facts_summary", "description"),
    "beyan": ("plaintiff_position", "defendant_position"),
}
GROUP_LABELS = {"talep": "Benzer talep", "olay": "Benzer olay", "beyan": "Benzer taraf beyanı"}
FIELD_WEIGHT = {"case_name": 2, "claim": 2}

# Weights of the score (total 100 when every signal is available).
W_TEXT, W_TYPE, W_COURT, W_ROLE, W_VALUE = 60, 15, 10, 5, 10
MIN_TEXT = 0.08  # below this cosine a candidate needs the same category to be listed

CASE_TYPE_LABELS = {
    CaseType.CEZA: "Ceza Hukuku", CaseType.IS_HUKUKU: "İş Hukuku", CaseType.TICARET_HUKUKU: "Ticaret Hukuku",
    CaseType.SOZLESME: "Sözleşme", CaseType.KIRA: "Kira", CaseType.ICRA: "İcra", CaseType.DIGER: "Diğer",
}
ROLE_LABELS = {"plaintiff": "davacı", "defendant": "davalı", "other": "diğer"}

# Longest first, so "Asliye Ticaret" wins over "Ticaret" and "Ağır Ceza" over "Ceza".
COURT_TYPES = [
    ("fikri ve sinai haklar", "Fikri ve Sınai Haklar"), ("bolge adliye", "Bölge Adliye"),
    ("asliye ticaret", "Asliye Ticaret"), ("asliye hukuk", "Asliye Hukuk"), ("asliye ceza", "Asliye Ceza"),
    ("agir ceza", "Ağır Ceza"), ("sulh hukuk", "Sulh Hukuk"), ("sulh ceza", "Sulh Ceza"),
    ("icra hukuk", "İcra Hukuk"), ("icra ceza", "İcra Ceza"), ("icra", "İcra"), ("tuketici", "Tüketici"),
    ("aile", "Aile"), ("is mahkemesi", "İş"), ("idare", "İdare"), ("vergi", "Vergi"),
    ("yargitay", "Yargıtay"), ("danistay", "Danıştay"), ("anayasa", "Anayasa"),
]

STOPWORDS = {
    "acaba", "ama", "ancak", "artik", "aslinda", "az", "bana", "bazi", "belki", "ben", "beni", "benim", "beri",
    "bile", "bir", "biri", "birkac", "birsey", "biz", "bize", "bizi", "bizim", "boyle", "bu", "buna", "bunda",
    "bundan", "bunlar", "bunu", "bunun", "burada", "cok", "cunku", "da", "daha", "de", "defa", "degil", "diye",
    "dolayi", "en", "gibi", "go", "hem", "hep", "hepsi", "her", "hic", "icin", "ile", "ilgili", "ise", "iste",
    "kadar", "karsi", "kez", "ki", "kim", "kimse", "mi", "mu", "na", "nasil", "ne", "neden", "nerde", "nerede",
    "nereye", "nicin", "niye", "o", "olan", "olarak", "oldu", "oldugu", "olmak", "olup", "on", "ona", "ondan",
    "onlar", "onu", "onun", "orada", "oysa", "sanki", "sen", "senin", "siz", "sizin", "sonra", "su", "suna",
    "sunu", "tarafindan", "tum", "uzere", "var", "vardir", "ve", "veya", "ya", "yani", "yine", "yok", "zaten",
    "olan", "olmasi", "olmustur", "edilmesi", "edilen", "eden", "etmek", "etti", "ettigi", "yapilan", "yapildi",
    # Words every case in the archive shares; they say nothing about similarity.
    "dava", "davaci", "davali", "davanin", "davada", "mahkeme", "mahkemesi", "muvekkil", "muvekkilimiz", "taraf",
    "taraflar", "talep", "edilmistir", "dosya", "karar",
}
# Stems of claim boilerplate ("alacağının tahsili", "nedeniyle", "istemi"): any inflection is dropped.
GENERIC_STEMS = {"alaca", "tahsi", "istem", "neden", "talep", "taleb", "davac", "daval", "davan", "mahke",
                 "muvek", "karar", "dosya", "ilisk", "hakki", "iliski",
                 "kabul", "edild", "edile", "edilm", "reddi", "redde", "verild", "yapil"}
_FOLD = str.maketrans("çğıöşüâîû", "cgiosuaiu")
_TOKEN = re.compile(r"[0-9a-zçğıöşüâîû]+")
STEM = 5  # Turkish prefix stemming: the first five letters match inflected forms well.


def turkish_lower(text: str) -> str:
    """Lower-case with Turkish dotted/dotless I, then NFC."""
    return unicodedata.normalize("NFC", text.replace("I", "ı").replace("İ", "i").lower())


def fold(word: str) -> str:
    return word.translate(_FOLD)


def tokens(text: Optional[str]) -> list[tuple[str, str]]:
    """(stem, surface) pairs: lower-case, punctuation dropped, stop words and digits removed."""
    out = []
    for word in _TOKEN.findall(turkish_lower(text or "")):
        folded = fold(word)
        if len(folded) < 3 or folded.isdigit() or folded in STOPWORDS or folded[:STEM] in GENERIC_STEMS:
            continue
        out.append((folded[:STEM], word))
    return out


def court_type(court: Optional[str]) -> Optional[str]:
    folded = fold(turkish_lower(court or ""))
    folded = re.sub(r"[^a-z ]+", " ", folded)
    folded = " ".join(folded.split())
    for needle, label in COURT_TYPES:
        if re.search(rf"\b{needle}\b", folded):
            return label
    return None


_SUFFIX = re.compile(r"^(.*\S)-\d+$")


def file_root(case_number: str) -> str:
    """'2026/12-2' and '2026/12-1' share the root '2026/12'."""
    match = _SUFFIX.match(case_number.strip())
    return match.group(1) if match else case_number.strip()


def is_sibling(a: str, b: str) -> bool:
    if a.strip() == b.strip():
        return True
    return file_root(a) == file_root(b) and (bool(_SUFFIX.match(a.strip())) or bool(_SUFFIX.match(b.strip())))


@dataclass
class Doc:
    """One case reduced to what similarity needs."""
    terms: Counter
    groups: dict[str, list[tuple[str, str]]]


def document(values: dict[str, Optional[str]]) -> Doc:
    terms: Counter = Counter()
    groups: dict[str, list[tuple[str, str]]] = {}
    for group, names in GROUPS.items():
        seq: list[tuple[str, str]] = []
        for name in names:
            words = tokens(values.get(name))
            seq.extend(words + [("", "")])  # a gap so bigrams never span two fields
            for stem, _ in words:
                terms[stem] += FIELD_WEIGHT.get(name, 1)
        groups[group] = seq
    return Doc(terms, groups)


def case_document(case: Case) -> Doc:
    return document({name: getattr(case, name) for name in TEXT_FIELDS})


def bigrams(seq: list[tuple[str, str]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for (s1, w1), (s2, w2) in zip(seq, seq[1:]):
        if s1 and s2 and s1 != s2:
            out.setdefault(f"{s1} {s2}", f"{w1} {w2}")
    return out


@dataclass
class Corpus:
    docs: dict[str, Doc]
    df: Counter = field(default_factory=Counter)

    def __post_init__(self):
        for doc in self.docs.values():
            self.df.update(doc.terms.keys())

    def idf(self, stem: str) -> float:
        n = len(self.docs) + 1
        return math.log((n + 1) / (self.df.get(stem, 0) + 1)) + 1.0

    def vector(self, doc: Doc) -> dict[str, float]:
        vec = {t: (1 + math.log(c)) * self.idf(t) for t, c in doc.terms.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(t, 0.0) for t, v in a.items())


class _FirmCache:
    """Per-bureau corpus, reused while the bureau's cases are unchanged."""

    TTL = 120.0
    SIZE = 32

    def __init__(self):
        self._lock = threading.Lock()
        self._items: OrderedDict[str, tuple[tuple, float, Corpus]] = OrderedDict()

    def get(self, firm_id: str, stamp: tuple, build) -> Corpus:
        now = time.monotonic()
        with self._lock:
            hit = self._items.get(firm_id)
            if hit and hit[0] == stamp and now - hit[1] < self.TTL:
                self._items.move_to_end(firm_id)
                return hit[2]
        corpus = build()
        with self._lock:
            self._items[firm_id] = (stamp, now, corpus)
            self._items.move_to_end(firm_id)
            while len(self._items) > self.SIZE:
                self._items.popitem(last=False)
        return corpus

    def clear(self):
        with self._lock:
            self._items.clear()


CACHE = _FirmCache()


@dataclass
class Match:
    case: Case
    score: int
    reasons: list[str]


def _value_closeness(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if not a or not b or a <= 0 or b <= 0:
        return None
    return min(a, b) / max(a, b)


def _shared_phrases(source: Doc, other: Doc, corpus: Corpus, group: str, limit: int = 2) -> list[str]:
    mine, theirs = source.groups.get(group, []), other.groups.get(group, [])
    if not mine or not theirs:
        return []
    picked: list[str] = []
    used: set[str] = set()
    pairs_theirs = bigrams(theirs)
    for key, surface in sorted(bigrams(mine).items(), key=lambda kv: -sum(corpus.idf(s) for s in kv[0].split())):
        if key in pairs_theirs and not set(key.split()) & used:
            picked.append(surface)
            used.update(key.split())
        if len(picked) >= limit:
            return picked
    their_stems = {s for s, _ in theirs if s}
    singles: dict[str, str] = {}
    for stem, word in mine:
        if stem and stem in their_stems and stem not in used:
            singles.setdefault(stem, word)
    for stem in sorted(singles, key=lambda s: -corpus.idf(s)):
        if corpus.idf(stem) < 1.3:  # shared by most of the bureau's cases
            continue
        picked.append(singles[stem])
        if len(picked) >= limit:
            break
    return picked


class SimilarCaseService:
    def __init__(self, db: Session):
        self.db = db

    def _firm_cases(self, firm_id: str) -> list[Case]:
        # Same bureau only, archived/closed cases and the precedent archive included.
        return self.db.query(Case).filter(Case.law_firm_id == firm_id).all()

    def _corpus(self, firm_id: str, cases: list[Case]) -> Corpus:
        stamp = self.db.query(func.count(Case.id), func.max(Case.updated_at)).filter(Case.law_firm_id == firm_id).one()
        return CACHE.get(firm_id, (int(stamp[0]), str(stamp[1])),
                         lambda: Corpus({c.id: case_document(c) for c in cases}))

    def for_case(self, source: Case, limit: int = 5) -> list[Match]:
        cases = self._firm_cases(source.law_firm_id)
        corpus = self._corpus(source.law_firm_id, cases)
        doc = corpus.docs.get(source.id) or case_document(source)
        return self._rank(
            corpus, doc, cases, limit,
            exclude=lambda c: c.id == source.id or is_sibling(c.case_number, source.case_number),
            case_type=source.case_type, court=court_type(source.court), role=source.client_role,
            value=source.case_value,
        )

    def for_text(self, firm_id: str, text: str, case_type: Optional[CaseType] = None, limit: int = 5) -> list[Match]:
        cases = self._firm_cases(firm_id)
        corpus = self._corpus(firm_id, cases)
        doc = document({"claim": text})
        if not doc.terms and case_type is None:
            return []
        return self._rank(corpus, doc, cases, limit, exclude=lambda c: False, case_type=case_type)

    def _rank(self, corpus, doc, cases, limit, exclude, case_type=None, court=None, role=None, value=None):
        source_vec = corpus.vector(doc) if doc.terms else {}
        matches: list[Match] = []
        for case in cases:
            if exclude(case):
                continue
            other = corpus.docs.get(case.id) or case_document(case)
            text = cosine(source_vec, corpus.vector(other)) if source_vec and other.terms else 0.0
            same_type = case_type is not None and case.case_type == case_type
            if text < MIN_TEXT and not same_type:
                continue
            earned, possible, reasons = W_TEXT * text, W_TEXT if source_vec else 0, []
            if case_type is not None:
                possible += W_TYPE
                if same_type:
                    earned += W_TYPE
                    reasons.append(f"Aynı kategori: {CASE_TYPE_LABELS.get(case.case_type, case.case_type)}")
            if court:
                possible += W_COURT
                if court_type(case.court) == court:
                    earned += W_COURT
                    reasons.append(f"Aynı mahkeme türü: {court}")
            if role:
                possible += W_ROLE
                if case.client_role == role:
                    earned += W_ROLE
                    reasons.append(f"Müvekkil aynı rolde ({ROLE_LABELS.get(role, role)})")
            closeness = _value_closeness(value, case.case_value)
            if closeness is not None:
                possible += W_VALUE
                earned += W_VALUE * closeness
                if closeness >= 0.5:
                    reasons.append("Yakın dava değeri")
            for group, label in GROUP_LABELS.items():
                phrases = _shared_phrases(doc, other, corpus, group)
                if phrases:
                    reasons.append(f"{label}: {', '.join(phrases)}")
            score = round(100 * earned / possible) if possible else 0
            if score <= 0:
                continue
            matches.append(Match(case, min(score, 100), reasons))
        matches.sort(key=lambda m: (-m.score, m.case.is_precedent, m.case.case_number))
        return matches[:limit]


def duration_days(case: Case, today: date) -> tuple[Optional[int], bool]:
    """Days from opening to decision; for an open case, to today (flagged as ongoing)."""
    if case.opening_date is None:
        return None, False
    if case.decision_date is not None:
        return max((case.decision_date - case.opening_date).days, 0), False
    if case.status == CaseStatus.KAPALI:
        return None, False
    return max((today - case.opening_date).days, 0), True
