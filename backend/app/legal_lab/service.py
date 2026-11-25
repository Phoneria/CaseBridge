"""Mock-first service for the three "legal lab" features.

`provider is None` -> predetermined mock output (LLM_PROVIDER=mock). With a real provider the same
endpoints call the model; any provider/JSON failure degrades to the mock with a visible note instead
of a 500, so the UI keeps working while a key is being fixed.
"""
import json
import logging
import re
from typing import Optional

from app.ai.errors import AIProviderError
from app.ai.providers.base import LLMProvider
from app.legal_lab import mock
from app.legal_lab.graph import law_ref, node_by_code, retrieve

logger = logging.getLogger("casebridge.legal_lab")

FAIL_NOTE = "AI yanıtı alınamadı; örnek içerik gösteriliyor."


def _json(provider: LLMProvider, system: str, prompt: str) -> dict:
    last: Exception | None = None
    for extra in ("", "\n\nÖNEMLİ: Yalnızca GEÇERLİ JSON döndür; çift tırnakları kaçır, satır sonlarını \\n yaz."):
        raw = provider.complete(system, prompt + extra, response_format="json_object")
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            return json.loads(m.group(0) if m else raw)
        except (ValueError, TypeError) as exc:
            last = exc
    raise ValueError(f"invalid json: {last}")


def _refs(codes, allowed: set[str]) -> list[dict]:
    return [law_ref(c) for c in (codes or []) if c in allowed and node_by_code(c)]


def _articles_block(arts: list[dict]) -> str:
    return "\n\n".join(f"[{a['code']}] {a['title'] or ''}\n{a['text']}" for a in arts)


SYSTEM = "Sen deneyimli bir Türk hukuku danışmanısın. Yalnızca istenen JSON'u döndür. Kesin hukuki sonuç veya garanti verme."


def _wrap(payload: dict, mode: str, note: str | None = None) -> dict:
    return {**payload, "mode": mode, "note": note}


def _run(provider: Optional[LLMProvider], ai_fn, mock_fn):
    if provider is None:
        return _wrap(mock_fn(), "mock", mock.MOCK_NOTE)
    try:
        return _wrap(ai_fn(), "ai")
    except (AIProviderError, ValueError) as exc:
        logger.warning("legal_lab AI call failed: %s", type(exc).__name__)
        return _wrap(mock_fn(), "mock", FAIL_NOTE)


# ------------------------------------------------------------ Karşı Taraf Analizi
def counter_analysis(provider: Optional[LLMProvider], summary: str, side: str) -> dict:
    def ai():
        arts = retrieve(summary[:900] + " ispat süre delil bilirkişi faiz defi dava şartları", 10)
        allowed = {a["code"] for a in arts}
        ours = "davacı" if side == "davaci" else "davalı"
        p = f"""Biz {ours} vekiliyiz. Karşı tarafın gözüyle bu dosyadaki RİSKLERİ ve bizim lehimize meşru FIRSATLARI bul.

DAVA ÖZETİ:
{summary}

İLGİLİ KANUN MADDELERİ (yalnızca bu kodlarla atıf yap, örn. "HMK m.190"):
{_articles_block(arts)}

Kurallar: Türkçe, kısa, dosyaya özgü. Dosyada olmayan olgu uydurma; yoksa fact'e "Dosyada bilgi yok: ..." yaz. Listede olmayan madde verme. Usulün kötüye kullanımını önerme.
En fazla 6 bulgu. JSON:
{{"findings":[{{"title":"","type":"risk|firsat","severity":3,"stage":"acilis|cevap|delil|bilirkisi|karar|yol","fact":"","rule":"","inference":"","basis":["HMK m.190"],"action":"","legitimacy":"mesru|sinirda"}}]}}"""
        data = _json(provider, SYSTEM, p)
        out = []
        for i, f in enumerate((data.get("findings") or [])[:6]):
            out.append({
                "id": f"a{i}", "title": str(f.get("title", ""))[:140], "type": "firsat" if f.get("type") == "firsat" else "risk",
                "severity": min(5, max(1, int(f.get("severity") or 3))), "stage": f.get("stage") or "delil",
                "fact": str(f.get("fact", ""))[:260], "rule": str(f.get("rule", ""))[:380], "inference": str(f.get("inference", ""))[:520],
                "action": str(f.get("action", ""))[:400], "legitimacy": "sinirda" if f.get("legitimacy") == "sinirda" else "mesru",
                "basis": _refs(f.get("basis"), allowed), "support": "unverified",
                "fact_ok": not str(f.get("fact", "")).lower().startswith("dosyada bilgi yok"),
            })
        return {"findings": sorted(out, key=lambda x: -x["severity"])}

    return _run(provider, ai, lambda: {"findings": mock.counter_findings()})


# ------------------------------------------------------------ Duruşma
def _transcript(tr: list[dict]) -> str:
    def line(t):
        if t.get("who") == "kullanici":
            return f"  >> KULLANICI MÜDAHALESİ: {t.get('text', '')}"
        return f"[{t.get('stage_name', '')}] {mock.CHARS.get(t.get('who'), t.get('who'))}: {t.get('text', '')}"
    return "\n".join(line(t) for t in tr[-26:]) or "(duruşma şimdi başlıyor)"


def _interv_text(side: str, interv: dict | None) -> str:
    if not interv:
        return ""
    names = mock.CHARS
    tgt, text, mode = names.get(interv.get("target"), ""), interv.get("text", ""), interv.get("mode")
    if mode == "puppet":
        return f"KULLANICI {tgt} ADINA şunu söylüyor, tutanağa aynen geçecek, sen yazma: «{text}». Yalnızca diğer karakterlerin mantıklı tepkilerini yaz."
    if mode == "hukum":
        return f"KULLANICI (HÂKİM) hükmü '{interv.get('sonuc')}' yönünde veriyor, not: «{text}». Bu yönde karar alanını doldur."
    if mode == "direct":
        return f"KULLANICI {tgt} karakterine şunu söyletiyor: «{text}». İlk konuşma {tgt} olsun, rolüne uygun hukuki dille; sonra diğerleri tepki versin."
    if mode == "say":
        return f"KULLANICI sahnede {tgt} ile konuşuyor: «{text}». Önce kullanıcının sözü düzgün dille, sonra {tgt} yanıt versin."
    return f"KULLANICI kendi vekiline talimat verdi: «{text}». Vekil bunu uygun dille uygulasın, diğerleri tepki versin."


def trial_beat(provider, summary: str, side: str, stage_idx: int, transcript: list[dict], interv: dict | None, manual: list[str]) -> dict:
    manual = [m for m in manual if m in mock.CHARS]

    def ai():
        last = stage_idx >= len(mock.STAGES) - 1
        stage = mock.STAGES[max(0, min(stage_idx, len(mock.STAGES) - 1))]
        arts = retrieve(summary[:400] + " " + " ".join(t.get("text", "") for t in transcript[-3:])[:300] + " " + ((interv or {}).get("text") or ""), 8)
        allowed = {a["code"] for a in arts}
        judge = side == "hakim"
        p = f"""Bir Türk hukuk davasının duruşma simülasyonunu yazıyorsun. Karakterler: hakim, davaci (Davacı vekili), davali (Davalı vekili), bilirkisi.
Kullanıcı rolü: {side}. {"Hâkim yalnızca kullanıcının müdahalesiyle konuşur." if judge else ""}
Elle yönetilen karakterler (müdahale olmadıkça konuşmaz): {', '.join(manual) or 'yok'}.

DAVA ÖZETİ:
{summary}

SAHNE:
{_transcript(transcript)}

AŞAMA: {stage['name']}
{_interv_text(side, interv)}

KANUN MADDELERİ (yalnızca bu kodlarla atıf yap):
{_articles_block(arts)}

Kurallar: 2-3 kısa konuşma (en fazla 2 cümle), dosyada olmayan olgu/tarih/tutar uydurma. {"Son aşama: hâkim yeterince dinlediyse karar ver." if last and not judge else "Karar verme (karar null)."}
"suggestions": kullanıcının bir sonraki 3 kısa müdahale önerisi.
JSON: {{"turns":[{{"who":"hakim|davaci|davali|bilirkisi","text":"","basis":[]}}],"stage_done":false,"suggestions":[],"karar":null,"dersler":[]}}
karar doluysa: {{"sonuc":"kabul|kismen_kabul|red","gerekce":"","hukum":[""],"basis":[],"riskler":[{{"risk":"","cozum":""}}]}}"""
        data = _json(provider, SYSTEM, p)
        turns = []
        puppet = bool(interv and interv.get("mode") == "puppet" and interv.get("target") in mock.CHARS)
        if puppet:
            turns.append(mock._turn(interv["target"], (interv.get("text") or "").strip()))
        for t in (data.get("turns") or [])[:4]:
            who = t.get("who")
            if who not in mock.CHARS or not t.get("text"):
                continue
            if (judge and who == "hakim" and not interv) or (puppet and who == interv["target"]):
                continue
            if who in manual and not (interv and interv.get("target") == who and interv.get("mode") in ("direct", "say")):
                continue
            basis = [c for c in (t.get("basis") or []) if c in allowed]
            turns.append({"who": who, "text": str(t["text"])[:600], "basis": basis, "law": _refs(basis, allowed), "docs": []})
        karar = data.get("karar") if ((last and not judge) or (interv or {}).get("mode") == "hukum") else None
        if isinstance(karar, dict):
            kb = [c for c in (karar.get("basis") or []) if c in allowed]
            karar = {**karar, "basis": kb, "law": _refs(kb, allowed), "riskler": karar.get("riskler") or []}
            if interv and interv.get("mode") == "hukum":
                karar["sonuc"] = interv.get("sonuc")
        else:
            karar = None
        done = bool(data.get("stage_done")) or bool(karar)
        if last and not karar:
            done = False
        return {"stage_idx": stage_idx, "stage_name": stage["name"], "turns": turns, "stage_done": done,
                "suggestions": [s for s in (data.get("suggestions") or [])[:3] if isinstance(s, str)],
                "karar": karar, "dersler": data.get("dersler", []) if karar else [], "finished": bool(karar), "idle": not turns}

    return _run(provider, ai, lambda: mock.beat(side, stage_idx, transcript, interv, manual))


def trial_guide(provider, summary: str, transcript: list[dict], stage_idx: int, role: str) -> dict:
    role = role if role in ("hakim", "davaci", "davali") else "hakim"

    def ai():
        arts = retrieve(" ".join(t.get("text", "") for t in transcript[-8:])[:600] + " " + summary[:400] + " ispat itiraz delil süre", 9)
        allowed = {a["code"] for a in arts}
        head = f"DAVA ÖZETİ:\n{summary}\n\nSAHNE:\n{_transcript(transcript)}\n\nKANUN MADDELERİ (yalnızca bu kodlarla atıf):\n{_articles_block(arts)}\n\nKurallar: Türkçe, kısa; olgu uydurma; sonucu tahmin etme."
        if role == "hakim":
            p = head + """\nSen hâkimin raportörüsün; hükmü sen verme. JSON:
{"hazir":false,"hazir_neden":"","eksikler":[""],"uyusmazlik":[{"konu":"","davaci":"","davali":"","durum":"aydinlanmis|cekismeli|eksik"}],"ispat":[{"konu":"","yuk":"davaci|davali","neden":"","basis":[]}],"sorular":[{"kime":"davaci|davali|bilirkisi","soru":""}],"sonraki":{"adim":"","neden":"","basis":[]},"yollar":[{"sonuc":"kabul|kismen_kabul|red","kosul":"","bozma_riski":"","basis":[]}]}"""
            d = _json(provider, SYSTEM, p)
            sonraki = d.get("sonraki") or {}
            return {"role": "hakim", "hazir": bool(d.get("hazir")), "hazir_neden": d.get("hazir_neden", ""), "eksikler": (d.get("eksikler") or [])[:5],
                    "uyusmazlik": (d.get("uyusmazlik") or [])[:4],
                    "ispat": [dict(x, law=_refs(x.get("basis"), allowed), docs=[]) for x in (d.get("ispat") or [])[:4]],
                    "sorular": [x for x in (d.get("sorular") or [])[:4] if x.get("soru") and x.get("kime") in ("davaci", "davali", "bilirkisi")],
                    "sonraki": dict(sonraki, law=_refs(sonraki.get("basis"), allowed)),
                    "yollar": [dict(x, law=_refs(x.get("basis"), allowed)) for x in (d.get("yollar") or [])[:3] if x.get("sonuc") in ("kabul", "kismen_kabul", "red")]}
        ours = "davacı" if role == "davaci" else "davalı"
        p = head + f"""\nSen {ours} vekilinin danışmanısın. JSON:
{{"durum":"","guclu":[{{"nokta":"","basis":[]}}],"zayif":[{{"nokta":"","risk":"","cozum":""}}],"karsi_hamle":[{{"hamle":"","karsilik":""}}],"eksik_belge":[""],"hamleler":[{{"hamle":"vekile söylenecek kısa hamle","neden":"","risk":"düşük|orta|yüksek","basis":[]}}],"sureler":[""]}}"""
        d = _json(provider, SYSTEM, p)
        return {"role": role, "durum": d.get("durum", ""),
                "guclu": [dict(x, law=_refs(x.get("basis"), allowed), docs=[]) for x in (d.get("guclu") or [])[:4]],
                "zayif": (d.get("zayif") or [])[:4], "karsi_hamle": (d.get("karsi_hamle") or [])[:3], "eksik_belge": (d.get("eksik_belge") or [])[:4],
                "hamleler": [dict(x, law=_refs(x.get("basis"), allowed)) for x in (d.get("hamleler") or [])[:4] if x.get("hamle")],
                "sureler": (d.get("sureler") or [])[:3]}

    return _run(provider, ai, lambda: mock.guide(role))


def trial_ask(provider, summary: str, side: str, transcript: list[dict], question: str) -> dict:
    def ai():
        arts = retrieve(question + " " + summary[:300], 7)
        allowed = {a["code"] for a in arts}
        p = f"""Kayıt dışı danışman olarak en fazla 5 cümleyle yanıtla; olgu uydurma. Soru kullanıcının ({side}).
DAVA ÖZETİ:\n{summary}\n\nSAHNE:\n{_transcript(transcript)}\n\nSORU: {question}\n\nKANUN MADDELERİ:\n{_articles_block(arts)}\nJSON: {{"answer":"","basis":[]}}"""
        d = _json(provider, SYSTEM, p)
        return {"answer": str(d.get("answer", ""))[:1200], "law": _refs(d.get("basis"), allowed)}

    return _run(provider, ai, lambda: mock.ask(question))
