"""Similar precedents for the "Benzer Davalar" sidebar (specs/019-similar-precedents).

Ranks the bureau's own precedent archive against one of its cases. No AI call,
no new table, no new dependency: a pure-Python hybrid score

    score = 100 * (0.6 * text + 0.2 * case_type + 0.1 * court + 0.1 * statutes)

where `text` is a TF-IDF cosine over the case text (claim, facts, both parties'
positions, description, closing note and the extracted text of uploaded
documents). A signal the source case cannot provide (no court, no statute
reference, no text) is left out of the denominator instead of counting as a
miss.

Every explanation is extractive: shared terms, statute references and passages
are copied from the stored case and precedent fields, never generated. This
keeps the no-fabrication rule of app/ai/agents/common.py without an LLM.

Isolation: every query filters by law_firm_id; the corpus cache is keyed by the
bureau and its stamp changes whenever a precedent or a precedent document of
that bureau changes.
"""
from __future__ import annotations

import math
import re
import threading
import time
import unicodedata
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.case import Case, CaseType
from app.models.document import Document
from app.services.similar_cases import CASE_TYPE_LABELS, GENERIC_STEMS, STOPWORDS, court_type, fold, turkish_lower

W_TEXT, W_TYPE, W_COURT, W_STATUTE = 0.6, 0.2, 0.1, 0.1
MIN_TEXT = 0.05          # below this cosine a precedent needs the same category to be listed
DOC_CHAR_LIMIT = 8000    # extracted document text kept per case
SENTENCE_CHAR_LIMIT = 280
TOP_TERMS = 8
MAX_PASSAGES = 3

# (attribute, Turkish label shown next to a passage)
TEXT_FIELDS = (
    ("case_name", "Dava adı"),
    ("claim", "Talep"),
    ("facts_summary", "Olay özeti"),
    ("plaintiff_position", "Davacı beyanı"),
    ("defendant_position", "Davalı beyanı"),
    ("description", "Açıklama"),
    ("closing_note", "Karar notu"),
)
DOCUMENT_LABEL = "Belge"

# --- Normalisation ---------------------------------------------------------------

# Folded (ASCII) Turkish suffixes, longest first. At most two are trimmed, a stem keeps 4+ letters, and a
# one-letter suffix (accusative/possessive vowel) only counts as the word's last suffix, so "tahliye",
# "tahliyesi" and "tahliyenin" all become "tahli" and "bedel", "bedeli", "bedelinin" become "bedel".
SUFFIXES = sorted({
    "inin", "unun", "indan", "undan", "inda", "unda", "ina", "una", "ini", "unu",
    "larindan", "lerinden", "larinin", "lerinin", "larina", "lerine", "larini", "lerini", "lardan", "lerden",
    "larda", "lerde", "lari", "leri", "lar", "ler", "sinin", "sunun", "sindan", "sinden", "sinda", "sinde",
    "sini", "sunu", "sina", "sine", "suna", "nin", "nun", "ndan", "nden", "nda", "nde", "dan", "den", "tan",
    "ten", "da", "de", "ta", "te", "in", "un", "yi", "yu", "ya", "ye", "si", "su", "na", "ne", "ni", "nu",
    "i", "u", "a", "e",
}, key=len, reverse=True)
MIN_STEM = 4
_WORD = re.compile(r"[0-9a-zçğıöşüâîû]+")
# A boundary is end punctuation before whitespace/end, or a line break. "15.000", "m. 344", "E.", "K." and
# ordinals ("18. madde") are not boundaries.
_BOUNDARY = re.compile(r"[.!?;]+(?=\s|$)|\n+")
_LAST_TOKEN = re.compile(r"([^\s(/]+)$")
# Legal abbreviations that end with a dot inside a sentence (folded, lower-case).
ABBREVIATIONS = {"m", "md", "mad", "e", "k", "s", "sy", "no", "vb", "vs", "bkz", "av", "dr", "prof", "t", "hd", "cd"}


def stem(folded: str) -> str:
    for step in range(2):
        for suffix in SUFFIXES:
            if step and len(suffix) == 1:
                continue
            if folded.endswith(suffix) and len(folded) - len(suffix) >= MIN_STEM:
                folded = folded[: -len(suffix)]
                break
        else:
            break
    return folded


def _keep(folded: str) -> bool:
    return len(folded) >= 3 and not folded.isdigit() and folded not in STOPWORDS and folded[:5] not in GENERIC_STEMS


def normalize(text: Optional[str]) -> list[str]:
    """Turkish-aware: İ/ı lower-casing, punctuation dropped, stop words removed, suffixes trimmed."""
    return [stem(f) for f in (fold(w) for w in _WORD.findall(turkish_lower(text or ""))) if _keep(f)]


def _lower_same_length(text: str) -> str:
    """Turkish lower-case that keeps every offset of the input (needed for highlight offsets)."""
    lowered = turkish_lower(text)
    if len(lowered) == len(text):
        return lowered
    return "".join((turkish_lower(ch) or ch)[:1] for ch in text)


def word_spans(sentence: str) -> list[tuple[int, int, str, str]]:
    """(start, end, stem, surface) for each kept word; offsets index the original sentence."""
    lowered = _lower_same_length(sentence)
    out = []
    for m in _WORD.finditer(lowered):
        folded = fold(m.group())
        if _keep(folded):
            out.append((m.start(), m.end(), stem(folded), sentence[m.start():m.end()]))
    return out


# --- Statute and decision references ---------------------------------------------

CODES = {
    "tbk": "TBK", "tmk": "TMK", "ttk": "TTK", "hmk": "HMK", "iik": "İİK", "tck": "TCK", "cmk": "CMK",
    "iyuk": "İYUK", "tkhk": "TKHK", "kvkk": "KVKK", "humk": "HUMK", "bk": "BK", "ik": "İK", "ay": "AY",
}
_CODE = "|".join(sorted(CODES, key=len, reverse=True))
# "TBK 49", "İİK m. 67", "HMK md. 107", "TBK madde 344"
_CODE_ARTICLE = re.compile(rf"\b({_CODE})\b\.?\s*(?:(m|md|madde)\b\.?\s*)?(\d{{1,4}})\b")
# "TBK'nın 344. maddesi", "HMK 107. maddesi"
_CODE_ARTICLE_LONG = re.compile(rf"\b({_CODE})\b(?:['’]\w+)?\s+(\d{{1,4}})\s*\.?\s*madde")
# "4857 sayılı İş Kanunu'nun 18. maddesi" -> "4857 s. Kanun m. 18"
_NUMBERED_LAW = re.compile(r"\b(\d{3,4})\s+sayili\b[^.\n]{0,60}?\bkanun\w*(?:['’]\w+)?\s+(\d{1,4})\s*\.?\s*madde")
# "Yargıtay 3. Hukuk Dairesi 2024/5 E., 2024/90 K." / "Yargıtay 3. HD ... E. 2024/5 K. 2024/90"
_CHAMBER = r"(\d{1,2})\s*\.?\s*(hukuk|ceza)\s+dairesi|(\d{1,2})\s*\.?\s*(hd|cd)\b|(hukuk genel kurulu|hgk|ceza genel kurulu|cgk)"
_YARGITAY = re.compile(
    rf"\byargitay\b\s*(?:{_CHAMBER})?[^\n]{{0,40}}?"
    r"(?:(\d{4})\s*/\s*(\d+)\s*e\b|e\s*\.?\s*(\d{4})\s*/\s*(\d+))"
    r"(?:[\s.,]*(?:(\d{4})\s*/\s*(\d+)\s*k\b|k\s*\.?\s*(\d{4})\s*/\s*(\d+)))?"
)
_ARTICLE_SUFFIX_CODES = {"ik", "ay"}  # too short to accept without "m."/"md."/"madde"


def _folded(text: str) -> str:
    return fold(_lower_same_length(text))


def _chamber(groups: tuple) -> str:
    num, kind, short_num, short_kind, general = groups
    if num:
        return f" {num}. {'HD' if kind == 'hukuk' else 'CD'}"
    if short_num:
        return f" {short_num}. {short_kind.upper()}"
    if general:
        return " HGK" if general in ("hukuk genel kurulu", "hgk") else " CGK"
    return ""


def statute_refs(text: Optional[str]) -> dict[str, str]:
    """Canonical key -> surface text as written, for each statute or Yargıtay decision reference."""
    if not text:
        return {}
    folded = _folded(text)
    refs: dict[str, str] = {}
    for m in _CODE_ARTICLE.finditer(folded):
        code, marker, article = m.group(1), m.group(2), m.group(3)
        if code in _ARTICLE_SUFFIX_CODES and not marker:
            continue
        refs.setdefault(f"{CODES[code]} m. {int(article)}", text[m.start():m.end()])
    for m in _CODE_ARTICLE_LONG.finditer(folded):
        refs.setdefault(f"{CODES[m.group(1)]} m. {int(m.group(2))}", text[m.start():m.end()])
    for m in _NUMBERED_LAW.finditer(folded):
        refs.setdefault(f"{m.group(1)} s. Kanun m. {int(m.group(2))}", text[m.start():m.end()])
    for m in _YARGITAY.finditer(folded):
        g = m.groups()
        e_year, e_no = (g[5], g[6]) if g[5] else (g[7], g[8])
        k_year, k_no = (g[9], g[10]) if g[9] else (g[11], g[12])
        key = f"Yargıtay{_chamber(g[:5])} E. {e_year}/{int(e_no)}"
        if k_year:
            key += f" K. {k_year}/{int(k_no)}"
        refs.setdefault(key, text[m.start():m.end()])
    return refs


def _ref_matches(a: str, b: str) -> bool:
    """Same key, or the same Yargıtay docket when one side omits the K. number."""
    if a == b:
        return True
    if a.startswith("Yargıtay") and b.startswith("Yargıtay"):
        return a.split(" K. ")[0] == b.split(" K. ")[0]
    return False


# --- Court similarity ---------------------------------------------------------------

COURT_FAMILY = {
    "Sulh Hukuk": "hukuk", "Asliye Hukuk": "hukuk", "Tüketici": "hukuk", "Aile": "hukuk", "İş": "hukuk",
    "Asliye Ticaret": "hukuk", "Fikri ve Sınai Haklar": "hukuk",
    "Asliye Ceza": "ceza", "Ağır Ceza": "ceza", "Sulh Ceza": "ceza", "İcra Ceza": "ceza",
    "İcra": "icra", "İcra Hukuk": "icra", "İdare": "idari", "Vergi": "idari", "Danıştay": "idari",
}


def court_match(a: Optional[str], b: Optional[str]) -> tuple[float, Optional[str]]:
    """(0..1, Turkish reason). Same court or court type 1.0, same family 0.5."""
    if not a or not b:
        return 0.0, None
    if " ".join(_folded(a).split()) == " ".join(_folded(b).split()):
        return 1.0, f"Aynı mahkeme: {b}"
    ta, tb = court_type(a), court_type(b)
    if ta and ta == tb:
        return 1.0, f"Aynı mahkeme türü: {tb}"
    if ta and tb and COURT_FAMILY.get(ta) and COURT_FAMILY.get(ta) == COURT_FAMILY.get(tb):
        return 0.5, f"Benzer mahkeme: {ta} / {tb}"
    return 0.0, None


# --- Case profiles and corpus ---------------------------------------------------------

@dataclass
class Sentence:
    label: str
    text: str
    spans: list[tuple[int, int, str, str]]

    @property
    def stems(self) -> set[str]:
        return {s for _, _, s, _ in self.spans}


@dataclass
class Profile:
    """One case or precedent reduced to what similarity needs. Built only from stored fields."""
    case_id: str
    case_type: CaseType
    court: Optional[str]
    case_value: Optional[float]
    terms: Counter
    surfaces: dict[str, str]
    refs: dict[str, str]
    sentences: list[Sentence]
    evidence: tuple[str, ...] = ()


def split_sentences(text: str) -> list[str]:
    pieces, start = [], 0
    for m in _BOUNDARY.finditer(text):
        before = text[start:m.start()]
        last = _LAST_TOKEN.search(before)
        if m.group()[0] == "." and (before[-1:].isdigit() or (last and _folded(last.group(1)) in ABBREVIATIONS)):
            continue
        pieces.append(text[start:m.end()])
        start = m.end()
    pieces.append(text[start:])
    return [p.strip() for p in pieces if p.strip()]


def _sentences(label: str, text: str) -> list[Sentence]:
    out = []
    for raw in split_sentences(text):
        if not raw:
            continue
        raw = raw[:SENTENCE_CHAR_LIMIT]
        spans = word_spans(raw)
        if len(spans) >= 2:
            out.append(Sentence(label, raw, spans))
    return out


# Evidence families named in the stored text (folded, word-prefix match). Used for rule-based differences only.
EVIDENCE_TYPES = (
    ("Bilirkişi raporu", re.compile(r"\bbilirkisi")),
    ("Tanık beyanı", re.compile(r"\btanik")),
    ("Sözleşme", re.compile(r"\bsozlesme")),
    ("İhtarname", re.compile(r"\bihtar")),
    ("Fatura / ödeme belgesi", re.compile(r"\b(fatura|dekont|makbuz)")),
    ("Yazışma / mesaj", re.compile(r"\b(e-?posta|whatsapp|yazisma|sms\b|kisa mesaj)")),
    ("Fotoğraf / görüntü", re.compile(r"\b(fotograf|goruntu|video|kamera kayd)")),
    ("Keşif", re.compile(r"\bkesif")),
    ("Tutanak", re.compile(r"\btutanag|\btutanak")),
    ("Sağlık raporu", re.compile(r"\b(saglik raporu|adli tip|hastane)")),
    ("Bordro / SGK kaydı", re.compile(r"\b(bordro|sgk\b)")),
    ("Tapu kaydı", re.compile(r"\btapu")),
)


def evidence_types(text: Optional[str]) -> tuple[str, ...]:
    folded = _folded(text or "")
    return tuple(label for label, pattern in EVIDENCE_TYPES if pattern.search(folded))


def build_profile(case: Case, documents: Iterable[tuple[str, str]] = ()) -> Profile:
    parts: list[tuple[str, str]] = []
    for name, label in TEXT_FIELDS:
        value = getattr(case, name, None)
        if value and value.strip():
            parts.append((label, unicodedata.normalize("NFC", value)))
    budget = DOC_CHAR_LIMIT
    for filename, text in documents:
        if budget <= 0:
            break
        chunk = unicodedata.normalize("NFC", text or "").strip()[:budget]
        if chunk:
            parts.append((f"{DOCUMENT_LABEL}: {filename}", chunk))
            budget -= len(chunk)
    terms: Counter = Counter()
    surfaces: dict[str, str] = {}
    refs: dict[str, str] = {}
    sentences: list[Sentence] = []
    for label, text in parts:
        for start, end, s, surface in word_spans(text):
            terms[s] += 1
            surfaces.setdefault(s, turkish_lower(surface))
        for key, surface in statute_refs(text).items():
            refs.setdefault(key, surface)
        sentences.extend(_sentences(label, text))
    evidence = evidence_types("\n".join(text for _, text in parts))
    return Profile(case.id, case.case_type, case.court, case.case_value, terms, surfaces, refs, sentences, evidence)


@dataclass
class Corpus:
    profiles: dict[str, Profile]
    df: Counter = field(default_factory=Counter)

    def __post_init__(self):
        for p in self.profiles.values():
            self.df.update(p.terms.keys())

    def idf(self, s: str) -> float:
        n = len(self.profiles) + 1
        return math.log((n + 1) / (self.df.get(s, 0) + 1)) + 1.0

    def vector(self, p: Profile) -> dict[str, float]:
        vec = {t: (1 + math.log(c)) * self.idf(t) for t, c in p.terms.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(t, 0.0) for t, v in a.items())


class _PrecedentCache:
    """Per-bureau precedent corpus, reused while the bureau's precedents and their documents are unchanged."""

    TTL = 300.0
    SIZE = 32

    def __init__(self):
        self._lock = threading.Lock()
        self._items: OrderedDict[str, tuple[tuple, float, Corpus, dict[str, Case]]] = OrderedDict()

    def get(self, firm_id: str, stamp: tuple, build):
        now = time.monotonic()
        with self._lock:
            hit = self._items.get(firm_id)
            if hit and hit[0] == stamp and now - hit[1] < self.TTL:
                self._items.move_to_end(firm_id)
                return hit[2], hit[3]
        corpus, cases = build()
        with self._lock:
            self._items[firm_id] = (stamp, now, corpus, cases)
            self._items.move_to_end(firm_id)
            while len(self._items) > self.SIZE:
                self._items.popitem(last=False)
        return corpus, cases

    def invalidate(self, firm_id: Optional[str] = None):
        with self._lock:
            if firm_id is None:
                self._items.clear()
            else:
                self._items.pop(firm_id, None)


CACHE = _PrecedentCache()


# --- Results ---------------------------------------------------------------------------

@dataclass
class Highlight:
    start: int
    end: int


@dataclass
class Passage:
    case_label: str
    case_text: str
    case_highlights: list[Highlight]
    precedent_label: str
    precedent_text: str
    precedent_highlights: list[Highlight]


@dataclass
class Explanation:
    shared_terms: list[str]
    shared_statutes: list[str]
    matching_fields: list[str]
    passages: list[Passage]


@dataclass
class ScoreComponent:
    key: str            # text | case_type | court | statutes
    label: str
    points: float       # contribution to the 0-100 score
    max_points: float   # the most this signal could add for this source case


@dataclass
class PrecedentMatch:
    precedent: Case
    score: int
    text_score: int
    explanation: Explanation
    breakdown: list[ScoreComponent] = field(default_factory=list)
    profile: Optional[Profile] = None


@dataclass
class Ranking:
    """Every listed precedent of the bureau for one source case, best first, before explanations."""
    source_profile: Profile
    corpus: Corpus
    source_vector: dict[str, float]
    rows: list[tuple[float, float, Case, Profile, dict[str, float], list[ScoreComponent]]]
    excluded: list[str]  # labels of signals the source case cannot provide


SIGNAL_LABELS = {"text": "Metin benzerliği", "case_type": "Kategori", "court": "Mahkeme", "statutes": "Ortak mevzuat"}


def _shared_terms(source: Profile, other: Profile, sv: dict[str, float], ov: dict[str, float]) -> list[str]:
    shared = sorted(set(sv) & set(ov), key=lambda t: (-(sv[t] * ov[t]), t))
    return [source.surfaces.get(t, t) for t in shared[:TOP_TERMS]]


def _highlights(sentence: Sentence, stems: set[str]) -> list[Highlight]:
    return [Highlight(start, end) for start, end, s, _ in sentence.spans if s in stems]


def _passages(source: Profile, other: Profile, corpus: Corpus) -> list[Passage]:
    scored = []
    for i, a in enumerate(source.sentences):
        a_stems = a.stems
        for j, b in enumerate(other.sentences):
            common = a_stems & b.stems
            if len(common) < 2:
                continue
            weight = sum(corpus.idf(s) for s in common)
            scored.append((weight, i, j, common))
    scored.sort(key=lambda row: (-row[0], row[1], row[2]))
    used_a, used_b, out = set(), set(), []
    for _, i, j, common in scored:
        if i in used_a or j in used_b:
            continue
        a, b = source.sentences[i], other.sentences[j]
        out.append(Passage(a.label, a.text, _highlights(a, common), b.label, b.text, _highlights(b, common)))
        used_a.add(i)
        used_b.add(j)
        if len(out) >= MAX_PASSAGES:
            break
    return out


def _value_close(a: Optional[float], b: Optional[float]) -> bool:
    return bool(a and b and a > 0 and b > 0 and min(a, b) / max(a, b) >= 0.5)


class SimilarityService:
    def __init__(self, db: Session):
        self.db = db

    # Firm-scoped reads ------------------------------------------------------------
    def _documents(self, firm_id: str, case_ids: list[str]) -> dict[str, list[tuple[str, str]]]:
        out: dict[str, list[tuple[str, str]]] = {}
        if not case_ids:
            return out
        rows = (
            self.db.query(Document.case_id, Document.filename, Document.extracted_text)
            .filter(Document.law_firm_id == firm_id, Document.case_id.in_(case_ids),
                    Document.extracted_text.isnot(None))
            .order_by(Document.uploaded_at, Document.id)
            .all()
        )
        for case_id, filename, text in rows:
            out.setdefault(case_id, []).append((filename, text))
        return out

    def _stamp(self, firm_id: str) -> tuple:
        cases = self.db.query(func.count(Case.id), func.max(Case.updated_at)).filter(
            Case.law_firm_id == firm_id, Case.is_precedent.is_(True)).one()
        docs = (
            self.db.query(func.count(Document.id), func.max(Document.uploaded_at))
            .join(Case, Case.id == Document.case_id)
            .filter(Document.law_firm_id == firm_id, Case.law_firm_id == firm_id, Case.is_precedent.is_(True))
            .one()
        )
        return int(cases[0]), str(cases[1]), int(docs[0]), str(docs[1])

    def _precedent_corpus(self, firm_id: str) -> tuple[Corpus, dict[str, Case]]:
        def build():
            precedents = self.db.query(Case).filter(Case.law_firm_id == firm_id, Case.is_precedent.is_(True)).all()
            docs = self._documents(firm_id, [p.id for p in precedents])
            corpus = Corpus({p.id: build_profile(p, docs.get(p.id, ())) for p in precedents})
            return corpus, {p.id: p for p in precedents}
        return CACHE.get(firm_id, self._stamp(firm_id), build)

    # Ranking ------------------------------------------------------------------------
    def rank(self, source: Case) -> Ranking:
        firm_id = source.law_firm_id
        corpus, precedents = self._precedent_corpus(firm_id)
        source_profile = build_profile(source, self._documents(firm_id, [source.id]).get(source.id, ()))
        sv = corpus.vector(source_profile) if source_profile.terms else {}
        has_court = bool(source.court and source.court.strip())
        has_refs = bool(source_profile.refs)
        weights = {"text": W_TEXT if sv else 0.0, "case_type": W_TYPE,
                   "court": W_COURT if has_court else 0.0, "statutes": W_STATUTE if has_refs else 0.0}
        possible = sum(weights.values())
        excluded = [SIGNAL_LABELS[k] for k, w in weights.items() if not w]

        rows = []
        for pid, profile in corpus.profiles.items():
            precedent = precedents[pid]
            if pid == source.id or precedent.law_firm_id != firm_id:
                continue
            ov = corpus.vector(profile) if profile.terms else {}
            text = cosine(sv, ov) if sv and ov else 0.0
            same_type = precedent.case_type == source.case_type
            if text < MIN_TEXT and not same_type:
                continue
            values = {"text": text, "case_type": 1.0 if same_type else 0.0}
            if has_court:
                values["court"] = court_match(source.court, precedent.court)[0]
            if has_refs:
                shared = [k for k in source_profile.refs if any(_ref_matches(k, o) for o in profile.refs)]
                values["statutes"] = len(shared) / len(source_profile.refs)
            earned = sum(weights[k] * v for k, v in values.items())
            score = earned / possible if possible else 0.0
            if score <= 0:
                continue
            components = [
                ScoreComponent(k, SIGNAL_LABELS[k], round(100 * weights[k] * values.get(k, 0.0) / possible, 1),
                               round(100 * weights[k] / possible, 1))
                for k in ("text", "case_type", "court", "statutes") if weights[k]
            ]
            rows.append((score, text, precedent, profile, ov, components))
        rows.sort(key=lambda r: (-r[0], -r[1], r[2].case_number, r[2].id))
        return Ranking(source_profile, corpus, sv, rows, excluded)

    def explain(self, source: Case, ranking: Ranking, row) -> PrecedentMatch:
        score, text, precedent, profile, ov, components = row
        return PrecedentMatch(
            precedent, min(round(100 * score), 100), round(100 * text),
            self._explain(source, ranking.source_profile, precedent, profile, ranking.corpus, ranking.source_vector, ov),
            components, profile,
        )

    def for_case(self, source: Case, limit: int = 5) -> list[PrecedentMatch]:
        ranking = self.rank(source)
        return [self.explain(source, ranking, row) for row in ranking.rows[:limit]]

    def _explain(self, source: Case, sp: Profile, precedent: Case, pp: Profile, corpus: Corpus,
                 sv: dict[str, float], ov: dict[str, float]) -> Explanation:
        fields: list[str] = []
        if precedent.case_type == source.case_type:
            fields.append(f"Aynı kategori: {CASE_TYPE_LABELS.get(precedent.case_type, precedent.case_type)}")
        _, court_reason = court_match(source.court, precedent.court)
        if court_reason:
            fields.append(court_reason)
        if _value_close(source.case_value, precedent.case_value):
            fields.append("Yakın dava değeri")
        statutes = [k for k in sp.refs if any(_ref_matches(k, o) for o in pp.refs)]
        return Explanation(
            shared_terms=_shared_terms(sp, pp, sv, ov) if sv and ov else [],
            shared_statutes=statutes,
            matching_fields=fields,
            passages=_passages(sp, pp, corpus),
        )
