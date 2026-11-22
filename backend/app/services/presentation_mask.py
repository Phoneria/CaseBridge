"""Stable aliases for the read-only presentation of the fictional catalogue."""
import re
from collections import defaultdict
from functools import lru_cache

from app.db.dossier_documents import entries
from app.db.dossier_stories import STORIES
from app.db.seed import DEMO_CASES

ORGANIZATIONS = {
    "Koru Depo", "Ada Sahne", "Kuzey Tedarik", "Poyraz Market", "Liman Kalıp",
    "Göl Atölye", "Batı Sevkiyat", "Sedir Tasarım", "Sahil Yapı", "Doruk Cephe",
    "Atlas Taşıma", "Mercan Gıda", "Yelken Sigorta", "Ahenk Yazılım", "Beyaz Ağ",
}
GENERIC_ROLE = "Vardiya amiri ve bakım sorumlusu"
IDENTIFIERS = {
    "Adres": re.compile(r"(?mi)(?<=adres: )[^\n]+"),
    "IBAN": re.compile(r"(?<!\w)TR(?:[ -]?\d){24}(?!\d)", re.I),
    "E-posta": re.compile(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}"),
    "Telefon": re.compile(r"(?<!\d)(?:\+90[\s-]*|0)[ (]*[2-5]\d{2}[ )-]*\d{3}[ -]*\d{2}[ -]*\d{2}(?!\d)"),
    "T.C.": re.compile(r"(?<!\d)[1-9]\d{10}(?!\d)"),
}


class Aliases:
    def __init__(self):
        self.values = defaultdict(dict)

    def add(self, kind, value):
        if value:
            values = self.values[kind]
            if value not in values:
                values[value] = f"{kind} {len(values) + 1}"
        return self

    def collect(self, text):
        for kind, expression in IDENTIFIERS.items():
            for match in expression.finditer(text):
                self.add(kind, match.group())
            # Do not classify digits inside an IBAN as phone or identity data.
            text = expression.sub(" ", text)

    def renderer(self):
        pairs = {value: alias for group in self.values.values() for value, alias in group.items()}
        names = sorted(pairs, key=len, reverse=True)
        pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(s) for s in names) + r")(?!\w)", re.I)
        # re.IGNORECASE equates Turkish dotted/dotless i; casefold alone does not.
        normalized = {s.casefold().replace("i\u0307", "i").replace("ı", "i"): a for s, a in pairs.items()}
        return lambda text: pattern.sub(lambda m: normalized[m.group().casefold().replace("i\u0307", "i").replace("ı", "i")], text)


@lru_cache(maxsize=1)
def catalogue_mask():
    aliases = Aliases()
    for story in STORIES:
        for value in (story.client, story.opponent):
            if value == GENERIC_ROLE:
                continue
            kind = "Kurum" if value == "Kıyı Belediyesi" else "Şirket" if value in ORGANIZATIONS else "Kişi"
            aliases.add(kind, value)
        for document in entries(story):
            aliases.collect(document.text)
    for item in DEMO_CASES:
        for field in ("client_name", "opposing_party"):
            value = item.get(field) or ""
            company = any(s in value for s in ("Şti", "A.Ş.", "Kooperatifi", "Yönetimi"))
            aliases.add("Şirket" if company else "Kişi", value)
        for field in ("address", "client_address", "opposing_address"):
            aliases.add("Adres", item.get(field))
    for i in range(6):
        aliases.add("Telefon", f"0538 000 00 {i+10:02}").add("E-posta", f"iletisim{i+1}@example.com")
    return aliases.renderer()
