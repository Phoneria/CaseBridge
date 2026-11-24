"""Cheap, deterministic checks that run before any model call (and decide
the mock answer): language, legal-advice requests, prompt-injection attempts
and a coarse topic label used only for anonymous counts."""
import re
from typing import Optional

_FOLD = str.maketrans("çğıöşüâîû", "cgiosuaiu")
_TURKISH_CHARS = re.compile(r"[çğıöşüÇĞİÖŞÜ]")
_TURKISH_WORDS = {
    "ve", "bir", "bu", "mi", "mu", "mı", "mü", "ne", "nedir", "nasil", "nasıl", "icin", "için", "var", "yok",
    "neler", "hangi", "merhaba", "selam", "evet", "hayir", "hayır", "fiyat", "alirim", "alırım", "verilerim", "guvende", "güvende",
}


def fold(text: str) -> str:
    return text.replace("I", "ı").replace("İ", "i").lower().translate(_FOLD)


def detect_language(text: str, hint: Optional[str] = None) -> str:
    """Turkish or English, from the message; the page language breaks ties."""
    if _TURKISH_CHARS.search(text):
        return "tr"
    words = set(re.findall(r"[a-zçğıöşü]+", text.lower()))
    if words & _TURKISH_WORDS:
        return "tr"
    if words & {"the", "what", "how", "is", "are", "can", "does", "do", "my", "your", "you", "hello", "hi"}:
        return "en"
    return "en" if hint == "en" else "tr"


# A visitor's own legal situation or a request for legal work: refused before
# any model call. Product questions ("CaseBridge dilekçe yazıyor mu?") must not match.
_LEGAL_ADVICE = [
    r"\bdavami\b", r"\bdavamda\b", r"\bdavamin\b", r"\bdosyamda\b", r"\bhakkim\b", r"\bhaklarim\b",
    r"\bkiracim\b", r"\bev sahibim\b", r"\bisverenim\b", r"\bpatronum\b", r"\besim\b", r"\bbosanmak\b", r"\bbosanma davasi\b",
    r"\bsozlesmem\b", r"tazminat alabilir", r"kazanir miyim", r"dava acabilir miyim", r"dava acmali miyim",
    r"\bdilekcemi\b", r"bana (bir )?dilekce", r"hukuki tavsiye", r"\bavukat(a)? gerek", r"ne yapmaliyim\b.*\b(dava|mahkeme|icra|kira|isten)",
    r"\bmy case\b", r"\bmy landlord\b", r"\bmy tenant\b", r"\bmy employer\b", r"\bmy contract\b", r"\bmy divorce\b",
    r"\bshould i sue\b", r"\bcan i sue\b", r"\bwill i win\b", r"\bam i entitled\b", r"\blegal advice\b", r"\bcustody\b",
    r"write (me )?a (petition|lawsuit|complaint)",
]
_INJECTION = [
    r"\bignore (all |the |any )?(previous|prior|above|earlier|your)\b", r"\bdisregard (all |the |your )?(previous|prior|above|rules|instructions)\b",
    r"\bsystem prompt\b", r"\byou are now\b", r"\bfrom now on you\b", r"\bpretend (to be|you are)\b", r"\bjailbreak\b",
    r"\bdeveloper mode\b", r"\breveal (your|the) (prompt|instructions|rules)\b", r"\bnew instructions\b",
    r"onceki talimat", r"talimatlari (unut|yok say|gormezden gel)", r"kurallari (unut|yok say|degistir)", r"sistem istem",
    r"\bartik sen\b", r"\bgibi davran\b", r"\brol yap\b", r"yeni talimat",
]
_LEGAL_RE = re.compile("|".join(_LEGAL_ADVICE))
_INJECTION_RE = re.compile("|".join(_INJECTION))


def is_legal_advice_request(text: str) -> bool:
    return bool(_LEGAL_RE.search(fold(text)))


def is_injection_attempt(text: str) -> bool:
    return bool(_INJECTION_RE.search(fold(text)))


# Topic label -> folded keywords. "*" = prefix match on a word; plain = whole word;
# phrases with a space match as substrings. Order matters: first match wins.
TOPICS: list[tuple[str, list[str]]] = [
    ("pricing", ["fiyat*", "ucret*", "paket*", "abonelik*", "price*", "pricing", "cost*", "lisans*", "subscription*"]),
    ("security", ["guven*", "kvkk", "gizlilik*", "sifrel*", "anahtar*", "secur*", "privacy", "gdpr", "safe*", "encrypt*", "veri koruma"]),
    ("anonymisation", ["anonim*", "maskel*", "kisisel veri*", "anonymi*", "mask*", "personal data", "pii"]),
    ("how-ai-works", ["nasil calis*", "how does", "how it works", "how do you", "model*"]),
    ("precedents", ["emsal*", "benzer dava*", "precedent*", "similar case*"]),
    ("courtroom", ["durusma sim*", "prova*", "courtroom", "rehears*", "hakim*", "judge*", "simulasyon*", "simulation*"]),
    ("scenario-tree", ["olasilik*", "agac*", "scenario*", "probabilit*"]),
    ("past-analysis", ["gecmis dava*", "past case*", "biten dava*", "closed case*"]),
    ("casebridge-ai", ["yapay zeka*", "ai", "asistan*", "assistant*", "sufle*", "chatbot", "sohbet*"]),
    ("bureau", ["buro yonetim*", "is yuku*", "workload*", "finans*", "ekip yonetim*", "team management"]),
    ("cases", ["gorev*", "takvim*", "durusma*", "task*", "calendar*", "hearing*", "belge*", "document*", "rapor*", "report*", "devir*", "handover*", "dava*", "case*"]),
    ("demo", ["demo*", "deneme*", "trial*", "iletisim*", "contact*", "kayit*", "sign up", "giris*", "login", "randevu*", "book*", "basla*", "satin*"]),
    ("team", ["ekip*", "kurucu*", "team*", "founder*", "kimsiniz", "who are you"]),
    ("overview", ["casebridge", "neler yap*", "ne yap*", "ne ise yar*", "nedir", "what can", "what is", "what does", "ozellik*", "feature*", "urun*", "product*"]),
]


def classify_topic(text: str) -> Optional[str]:
    folded = fold(text)
    words = re.findall(r"[a-z0-9]+", folded)
    for topic, keywords in TOPICS:
        for keyword in keywords:
            if " " in keyword:
                if keyword.rstrip("*") in folded:
                    return topic
            elif keyword.endswith("*"):
                stem = keyword[:-1]
                if any(word.startswith(stem) for word in words):
                    return topic
            elif keyword in words:
                return topic
    return None
