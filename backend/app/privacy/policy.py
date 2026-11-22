"""Anonimleştirme politikası: hangi kategori maskelenir, işaretlenir ya da kapalıdır.

Varsayılan ``policy.json`` paket içindedir; ``ANONYMIZE_POLICY_PATH`` ortam değişkeni ya da
``Policy.load(path)`` ile başka bir dosya verilebilir. Bilinmeyen kategori ``maskele`` sayılır
(güvenli taraf).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

MODES = ("maskele", "işaretle", "kapalı")
_DEFAULT = Path(__file__).with_name("policy.json")


@dataclass
class Policy:
    kategoriler: dict[str, str] = field(default_factory=dict)
    kisi_sezgisel: bool = True
    kisi_yoksay: frozenset[str] = frozenset()
    mahkeme_sozcukleri: frozenset[str] = frozenset()
    buyuk_harf_yoksay: frozenset[str] = frozenset()
    sehirler: tuple[str, ...] = ()
    rol_sozcukleri: frozenset[str] = frozenset()

    def mode(self, kind: str) -> str:
        return self.kategoriler.get(kind, "maskele")

    @classmethod
    def from_dict(cls, d: dict) -> "Policy":
        kat = dict(d.get("kategoriler", {}))
        bad = {k: v for k, v in kat.items() if v not in MODES}
        if bad:
            raise ValueError(f"Geçersiz mod: {bad}; geçerli: {MODES}")
        return cls(
            kategoriler=kat,
            kisi_sezgisel=bool(d.get("kisi_sezgisel", True)),
            kisi_yoksay=frozenset(x.lower() for x in d.get("kisi_yoksay", [])),
            mahkeme_sozcukleri=frozenset(d.get("mahkeme_sozcukleri", [])),
            buyuk_harf_yoksay=frozenset(d.get("buyuk_harf_yoksay", [])),
            sehirler=tuple(d.get("sehirler", [])),
            rol_sozcukleri=frozenset(x.lower() for x in d.get("rol_sozcukleri", [])),
        )

    @classmethod
    def load(cls, path: str | os.PathLike | None = None) -> "Policy":
        p = Path(path or os.environ.get("ANONYMIZE_POLICY_PATH") or _DEFAULT)
        return cls.from_dict(json.loads(p.read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def default_policy() -> Policy:
    return Policy.load()
