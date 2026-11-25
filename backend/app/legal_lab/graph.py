"""Static legal knowledge graph (statute articles cited by Yargıtay civil decisions).

Pure data: no model call, works the same in mock and real AI mode. Statistics are
descriptive (share of decisions citing an article that were reversed), never a prediction.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).with_name("legal_graph.json")
MIN_TREND_N = 30


@lru_cache(maxsize=1)
def get_graph() -> dict:
    with _PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _by_code() -> dict:
    return {n["code"]: n for n in get_graph()["nodes"]}


def node_by_code(code: str) -> dict | None:
    return _by_code().get(code)


def trend(code: str) -> dict | None:
    """Descriptive reversal share for decisions citing this article, when the sample is big enough."""
    n = node_by_code(code)
    if not n or n.get("boz") is None or n.get("tot", 0) < MIN_TREND_N:
        return None
    return {"n": n["tot"], "boz": n["boz"], "base": n["base"], "lift": n.get("lift")}


def law_ref(code: str) -> dict:
    n = node_by_code(code)
    return {"code": code, "title": n.get("title") if n else None, "text": (n or {}).get("text", "")[:420], "trend": trend(code)}


_TOK = re.compile(r"[a-zçğıöşü0-9]+")


def _stems(s: str) -> set[str]:
    s = s.replace("İ", "i").replace("I", "ı").lower()
    return {w[:5] for w in _TOK.findall(s) if len(w) > 3}


def retrieve(query: str, n: int = 8) -> list[dict]:
    """Tiny keyword match over article titles/text: candidates the model may cite."""
    q = _stems(query)
    scored = []
    for node in get_graph()["nodes"]:
        s = len(q & _stems(f"{node.get('title') or ''} {node.get('text', '')}"))
        if s:
            scored.append((s, node["tot"], node))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    return [law_ref(x[2]["code"]) for x in scored[:n]]
