"""Emsal karar arama.

Üç çalışma modu (hepsi aynı API'den, kullanıcıya açıkça etiketli):
  * "hybrid"  : indeks + yoğun vektör (gömme) modeli yüklenebiliyor -> BM25 + vektör, RRF ile birleşik
  * "lexical" : indeks var, vektör yok/yüklenemiyor -> SQLite FTS5 BM25 (yalnızca standart kütüphane)
  * "sample"  : indeks yok -> gömülü birkaç gerçek örnek karar üzerinde basit arama (demo)

İndeks lab/ boru hattında üretilir (bkz. lab/build_index.py) ve PRECEDENT_INDEX_DIR altında durur:
  precedents.sqlite  (docs + fts)   embeddings.npy (isteğe bağlı, float16 [N, D])   meta.json
Veri deskriptiftir: bulunan emsallerin sonuç dağılımı bir tahmin değildir.
"""
import json
import logging
import re
import sqlite3
import threading
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("casebridge.precedents")

SAMPLE_PATH = Path(__file__).with_name("precedent_samples.json")
_TOK = re.compile(r"[a-zçğıöşü0-9]+")
_STOP = set("ve ile bir bu de da için olan olarak ise gibi daha çok ancak ayrıca ya veya ki mi mı mu mü ne her tüm".split())

OUTCOME_LABELS = {
    "bozma": "Bozma", "onama": "Onama", "duzelterek_onama": "Düzelterek onama", "iade": "Geri çevirme",
    "ret": "Ret", "kabul": "Kabul", "kismen_kabul": "Kısmen kabul", "usul_ret": "Usulden ret",
    "istinaf_ret": "İstinaf reddi", "kaldirma": "Kaldırma", "duzelterek": "Düzelterek", "belirsiz": "Belirsiz",
}
KIND_LABELS = {"yargitay": "Yargıtay", "bam": "Bölge Adliye (istinaf)", "ilk_derece": "İlk derece"}


def tr_lower(s: str) -> str:
    return s.replace("İ", "i").replace("I", "ı").lower()


def tokens(s: str) -> list[str]:
    return [t for t in _TOK.findall(tr_lower(s)) if len(t) > 1 and t not in _STOP]


def _index_dir() -> Path:
    d = (settings.precedent_index_dir or "").strip()
    return Path(d) if d else Path(__file__).resolve().parents[2] / "data" / "precedent_index"


class _Dense:
    """Yoğun vektör tarafı: numpy + sentence-transformers varsa, yoksa None."""

    def __init__(self, idx_dir: Path, meta: dict):
        import numpy as np  # noqa: WPS433 (isteğe bağlı bağımlılık)

        self.np = np
        self.emb = np.load(idx_dir / "embeddings.npy", mmap_mode="r")
        self.meta = meta
        self._model = None
        self._lock = threading.Lock()

    def encode(self, text: str):
        with self._lock:
            if self._model is None:
                from sentence_transformers import SentenceTransformer  # type: ignore

                self._model = SentenceTransformer(self.meta["model"], device="cpu")
                self._model.max_seq_length = int(self.meta.get("max_len", 512))
            v = self._model.encode([self.meta.get("query_prefix", "") + text], normalize_embeddings=True)[0]
        return v.astype("float32")

    def top(self, q, allowed, k: int):
        np = self.np
        n = self.emb.shape[0]
        best_i, best_s = [], []
        step = 100_000
        for a in range(0, n, step):
            s = np.asarray(self.emb[a:a + step], dtype="float32") @ q
            if allowed is not None:
                s = np.where(allowed[a:a + step], s, -1.0)
            kk = min(k, len(s))
            idx = np.argpartition(-s, kk - 1)[:kk]
            best_i.append(idx + a)
            best_s.append(s[idx])
        i = np.concatenate(best_i)
        s = np.concatenate(best_s)
        order = np.argsort(-s)[:k]
        return [(int(i[j]) + 1, float(s[j])) for j in order if s[j] > -0.5]  # docs.id = satır + 1


class PrecedentIndex:
    def __init__(self, idx_dir: Path):
        self.dir = idx_dir
        self.meta = json.loads((idx_dir / "meta.json").read_text(encoding="utf-8"))
        self.db = sqlite3.connect(f"file:{(idx_dir / 'precedents.sqlite').as_posix()}?mode=ro", uri=True, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.count = self.db.execute("select count(*) from docs").fetchone()[0]
        self.dense: Optional[_Dense] = None
        if (idx_dir / "embeddings.npy").exists():
            try:
                self.dense = _Dense(idx_dir, self.meta)
            except Exception as exc:  # numpy yok vb.
                logger.info("dense disabled: %s", type(exc).__name__)

    @property
    def mode(self) -> str:
        return "hybrid" if self.dense is not None else "lexical"

    # --- sorgu yardımcıları
    def _query_terms(self, text: str, limit: int = 24) -> list[str]:
        toks = list(dict.fromkeys(tokens(text)))
        scored = []
        for t in toks:
            row = self.db.execute("select doc from fv where term=?", (t,)).fetchone()
            df = row[0] if row else 0
            if df == 0 or df > 0.25 * self.count:
                continue
            scored.append((df, t))
        scored.sort()  # en nadir (en ayırt edici) terimler önce
        return [t for _, t in scored[:limit]]

    def _filters_sql(self, f: dict) -> tuple[str, list]:
        sql, args = [], []
        if f.get("kinds"):
            sql.append(f"docs.kind in ({','.join('?' * len(f['kinds']))})"); args += f["kinds"]
        if f.get("outcomes"):
            sql.append(f"docs.outcome in ({','.join('?' * len(f['outcomes']))})"); args += f["outcomes"]
        if f.get("year_min"):
            sql.append("docs.year >= ?"); args.append(f["year_min"])
        if f.get("year_max"):
            sql.append("docs.year <= ?"); args.append(f["year_max"])
        if f.get("court"):
            sql.append("docs.court like ?"); args.append(f"%{f['court']}%")
        return ((" and " + " and ".join(sql)) if sql else ""), args

    def _lexical(self, terms: list[str], f: dict, k: int) -> list[tuple[int, float]]:
        if not terms:
            return []
        match = " OR ".join(f'"{t}"' for t in terms)
        fsql, fargs = self._filters_sql(f)
        # join'siz sorgu ~3x hızlı; filtre varsa geniş aday listesi alıp ardından süzülür
        pool = 2500 if fsql else k
        rows = self.db.execute("select rowid as id, bm25(fts) as s from fts where fts match ? order by s limit ?", (match, pool)).fetchall()
        cand = [(r["id"], -r["s"]) for r in rows]
        if not fsql or not cand:
            return cand[:k]
        ids = [c[0] for c in cand]
        ok = {r[0] for r in self.db.execute(f"select id from docs where id in ({','.join('?' * len(ids))}){fsql}", [*ids, *fargs])}
        return [c for c in cand if c[0] in ok][:k]

    def _allowed_mask(self, f: dict):
        if not f or not self.dense:
            return None
        np = self.dense.np
        cache = getattr(self, "_cols", None)
        if cache is None:
            rows = self.db.execute("select kind, outcome, year, court from docs order by id").fetchall()
            self._cols = cache = {
                "kind": np.array([r[0] for r in rows]), "outcome": np.array([r[1] for r in rows]),
                "year": np.array([r[2] or 0 for r in rows]), "court": [r[3] or "" for r in rows],
            }
        m = np.ones(len(cache["kind"]), dtype=bool)
        if f.get("kinds"):
            m &= np.isin(cache["kind"], f["kinds"])
        if f.get("outcomes"):
            m &= np.isin(cache["outcome"], f["outcomes"])
        if f.get("year_min"):
            m &= cache["year"] >= f["year_min"]
        if f.get("year_max"):
            m &= cache["year"] <= f["year_max"]
        if f.get("court"):
            c = f["court"].lower()
            m &= np.array([c in x.lower() for x in cache["court"]])
        return m

    def search(self, query: str, k: int = 10, filters: Optional[dict] = None) -> dict:
        f = filters or {}
        terms = self._query_terms(query)
        lex = self._lexical(terms, f, 200)
        dense = []
        if self.dense is not None:
            try:
                dense = self.dense.top(self.dense.encode(query[:3000]), self._allowed_mask(f), 200)
            except Exception as exc:  # model indirilemedi vb. -> sözcük aramasına düş
                logger.warning("dense search failed: %s", type(exc).__name__)
                self.dense = None
        fused: dict[int, float] = {}
        for lst in (lex, dense):
            for r, (doc_id, _) in enumerate(lst):
                fused[doc_id] = fused.get(doc_id, 0.0) + 1.0 / (60 + r + 1)
        ordered = sorted(fused.items(), key=lambda x: -x[1])
        lex_rank = {d: r for r, (d, _) in enumerate(lex)}
        dense_rank = {d: r for r, (d, _) in enumerate(dense)}
        # Karar seviyelerini dengele: tek bir seviye (ör. Yargıtay) tüm listeyi doldurmasın.
        cap = max(1, -(-k // 2)) if not f.get("kinds") else k
        picked: list[tuple[dict, float]] = []
        per_kind: Counter = Counter()
        skipped: list[tuple[dict, float]] = []
        seen: set = set()
        for doc_id, sc in ordered[:120]:
            d = self._row(doc_id)
            key = (d["court"], d["esas_no"], d["karar_no"], d["narr"][:120])
            if key in seen:  # aynı karar farklı kayıtlarla indekslenmiş olabilir
                continue
            seen.add(key)
            if per_kind[d["kind"]] >= cap:
                skipped.append((d, sc))
                continue
            per_kind[d["kind"]] += 1
            picked.append((d, sc))
            if len(picked) >= k:
                break
        for d, sc in skipped:  # yeterli çeşit yoksa kalan kontenjanı en iyi eşleşmelerle doldur
            if len(picked) >= k:
                break
            picked.append((d, sc))
        picked.sort(key=lambda x: -x[1])
        top = picked[0][1] if picked else 1.0
        items = []
        for d, sc in picked:
            doc_id = d["id"]
            d["score"] = round(sc / top, 3)
            d["matched"] = [t for t in terms if t in set(tokens(d["narr"]))][:6]
            d["via"] = [n for n, rk in (("kelime", lex_rank), ("anlam", dense_rank)) if doc_id in rk]
            items.append(_public(d))
        return {"results": items, "stats": _stats(items), "mode": self.mode, "indexed": self.count,
                "terms": terms[:12]}

    def _row(self, doc_id: int) -> dict:
        r = self.db.execute("select * from docs where id=?", (doc_id,)).fetchone()
        return dict(r)

    def get(self, doc_id: str) -> Optional[dict]:
        r = self.db.execute("select * from docs where doc_id=?", (doc_id,)).fetchone()
        return dict(r) if r else None


def _public(d: dict, full: bool = False) -> dict:
    out = {
        "doc_id": d["doc_id"], "source": d["source"], "kind": d["kind"], "kind_label": KIND_LABELS.get(d["kind"], d["kind"]),
        "court": d["court"], "esas_no": d["esas_no"], "karar_no": d["karar_no"], "tarih": d["tarih"], "year": d["year"],
        "outcome": d["outcome"], "outcome_label": OUTCOME_LABELS.get(d["outcome"], d["outcome"]),
        "laws": json.loads(d["laws"]) if isinstance(d["laws"], str) else d["laws"],
        "snippet": d["narr"][:520], "score": d.get("score"), "matched": d.get("matched", []), "via": d.get("via", []),
    }
    if full:
        out["narr"], out["tail"] = d["narr"], d["tail"]
    return out


def _stats(items: list[dict]) -> dict:
    """Deskriptif: bulunan emsallerin sonuç dağılımı (kind bazında). Tahmin değildir."""
    by_kind: dict[str, Counter] = {}
    for it in items:
        by_kind.setdefault(it["kind"], Counter())[it["outcome"]] += 1
    return {
        "n": len(items),
        "by_kind": {k: {"label": KIND_LABELS.get(k, k), "total": sum(c.values()),
                        "outcomes": [{"key": o, "label": OUTCOME_LABELS.get(o, o), "n": n} for o, n in c.most_common()]}
                    for k, c in by_kind.items()},
        "note": "Bulunan emsallerin sonuç dağılımıdır; bu davanın sonucu hakkında tahmin değildir.",
    }


# ------------------------------------------------------------- örnek (demo) modu
@lru_cache(maxsize=1)
def _samples() -> list[dict]:
    if not SAMPLE_PATH.exists():
        return []
    return json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))


def _sample_search(query: str, k: int, f: dict) -> dict:
    q = set(tokens(query))
    scored = []
    for d in _samples():
        if f.get("kinds") and d["kind"] not in f["kinds"]:
            continue
        if f.get("outcomes") and d["outcome"] not in f["outcomes"]:
            continue
        dt = set(tokens(d["narr"]))
        s = len(q & dt) / (1 + len(q) ** 0.5)
        scored.append((s, d))
    scored.sort(key=lambda x: -x[0])
    top = scored[0][0] if scored and scored[0][0] > 0 else 1.0
    items = []
    for s, d in scored[:k]:
        d = {**d, "score": round(s / top, 3), "matched": [t for t in q if t in set(tokens(d["narr"]))][:6], "via": ["kelime"]}
        items.append(_public(d))
    return {"results": items, "stats": _stats(items), "mode": "sample", "indexed": len(_samples()), "terms": list(q)[:12]}


# ------------------------------------------------------------- dış arayüz
_lock = threading.Lock()
_index: Optional[PrecedentIndex] = None
_tried = False


def get_index() -> Optional[PrecedentIndex]:
    global _index, _tried
    with _lock:
        if _index is None and not _tried:
            _tried = True
            d = _index_dir()
            if (d / "precedents.sqlite").exists() and (d / "meta.json").exists():
                try:
                    _index = PrecedentIndex(d)
                except Exception as exc:
                    logger.warning("precedent index could not be opened: %s", type(exc).__name__)
        return _index


def reset_index_for_tests() -> None:
    global _index, _tried
    with _lock:
        _index, _tried = None, False


def status() -> dict:
    idx = get_index()
    if idx is None:
        return {"mode": "sample", "indexed": len(_samples()), "model": None, "sources": [],
                "note": "Emsal indeksi kurulu değil; birkaç örnek karar üzerinde gösterim yapılıyor."}
    return {"mode": idx.mode, "indexed": idx.count, "model": idx.meta.get("model") if idx.mode == "hybrid" else None,
            "sources": idx.meta.get("sources", []), "built": idx.meta.get("built"), "eval": idx.meta.get("eval"),
            "note": None if idx.mode == "hybrid" else "Anlamsal (vektör) arama kapalı; kelime tabanlı arama kullanılıyor."}


def search(query: str, k: int = 10, filters: Optional[dict] = None) -> dict:
    k = max(1, min(k, 30))
    idx = get_index()
    if idx is None:
        return _sample_search(query, k, filters or {})
    return idx.search(query, k, filters)


def detail(doc_id: str) -> Optional[dict]:
    idx = get_index()
    if idx is None:
        for d in _samples():
            if d["doc_id"] == doc_id:
                return _public(d, full=True)
        return None
    d = idx.get(doc_id)
    return _public(d, full=True) if d else None
