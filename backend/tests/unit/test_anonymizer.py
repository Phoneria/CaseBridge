import pathlib
import pytest
from app.privacy.anonymizer import Entity, anonymize, tc_valid

FIXTURE = pathlib.Path(__file__).parent.parent / "fixtures" / "ornek_dava_kurgusal.txt"
KNOWN = [Entity("Ayşe Yılmaz"), Entity("Mehmet Demir"), Entity("Zeynep Arslan"),
         Entity("Örnek İnşaat Ltd. Şti.", "kurum")]
# Sahte (kurgusal) değerler: çıktıda kalmamalı
FICTIONAL = ["Ayşe", "Yılmaz", "Mehmet", "Demir", "Zeynep", "Arslan", "Örnek İnşaat",
             "12345678950", "0532 123 45 67", "ayse.yilmaz@ornek-kurgusal.test",
             "TR33 0006 1005 1978 6457 8413 26", "34 ABC 123", "Çiçek Mah.", "Gül Sok.", "05.03.1985"]


def _run():
    return anonymize(FIXTURE.read_text(encoding="utf-8"), KNOWN)


def test_tc_checksum():
    assert tc_valid("12345678950") and not tc_valid("12345678951") and not tc_valid("01234567890")


@pytest.mark.parametrize("value", FICTIONAL)
def test_fictional_value_removed(value):
    assert value.lower() not in _run().text.lower()


def test_no_leaks_and_consistent_labels():
    r = _run()
    assert r.ok
    # davacı: tam ad, soyad, "Ayşe'nin", "Yılmaz" hepsi tek etiket
    assert r.text.count("[KİŞİ-1]") >= 4
    assert r.text.count("[KİŞİ-2]") >= 3  # davalı Mehmet Demir / MEHMET DEMİR / Demir'in


def test_same_person_same_label():
    r = anonymize("Ayşe Yılmaz geldi. Ayşe'nin ifadesi. YILMAZ lehine.", [Entity("Ayşe Yılmaz")])
    labels = {w for w in r.text.replace(".", " ").split() if w.startswith("[")}
    assert len(labels) == 1


def test_text_structure_preserved():
    r = _run()
    assert "gecikme tazminatı" in r.text and "ANKARA 5. ASLİYE HUKUK" in r.text


@pytest.mark.xfail(reason="Kayıtlı olmayan kişi adları (tanık) için yerel NER katmanı gerekir", strict=True)
def test_unregistered_name_is_masked():
    assert "Fatma Kaya" not in _run().text


def test_restore_roundtrip():
    r = anonymize("Ayşe Yılmaz 0532 123 45 67 numarasından aradı.", [Entity("Ayşe Yılmaz")])
    assert "Ayşe" not in r.text
    assert r.restore("Özet: " + r.text.split(" numarasından")[0] + " aradı") .startswith("Özet: Ayşe Yılmaz")


def test_ner_masks_unregistered_witness():
    from app.privacy import ner
    if not ner.available():
        pytest.skip("NER modeli/torch yok")
    r = anonymize(FIXTURE.read_text(encoding="utf-8"), KNOWN, extra_detectors=[ner.detect_persons])
    assert "Fatma" not in r.text and "Kaya" not in r.text
    assert "gecikme tazminatı" in r.text and "ANKARA 5. ASLİYE HUKUK" in r.text  # mahkeme adı maskelenmedi


def test_provider_wrapper_anonymizes_and_restores(monkeypatch):
    from app.ai import provider_factory as pf
    from app.core.config import settings

    seen = {}

    class Inner:
        last_usage = None
        last_latency_ms = None

        def complete(self, system, user, *, response_format=None):
            seen["user"] = user
            return "Özet: " + user.split(" ")[0]

    class Router:
        _last = None

    monkeypatch.setattr(settings, "anonymize_llm_input", True)
    monkeypatch.setattr(settings, "anonymize_use_ner", False)
    monkeypatch.setattr(settings, "llm_provider", "openai")
    out = pf._TrackedProvider(Router(), Inner()).complete("s", "ayse@ornek.test iletişim kurdu")
    assert "ayse@ornek.test" not in seen["user"]
    assert out == "Özet: ayse@ornek.test"  # etiket geri çevrildi


def test_provider_wrapper_off_by_default(monkeypatch):
    from app.ai import provider_factory as pf
    from app.core.config import settings

    class Inner:
        last_usage = None
        last_latency_ms = None

        def complete(self, system, user, *, response_format=None):
            return user

    class Router:
        _last = None

    monkeypatch.setattr(settings, "llm_provider", "openai")
    assert pf._TrackedProvider(Router(), Inner()).complete("s", "ayse@ornek.test") == "ayse@ornek.test"


def test_ner_unavailable_falls_back_silently(monkeypatch):
    from app.privacy import ner

    monkeypatch.setattr(ner, "_pipe", None)
    monkeypatch.setattr(ner, "_failed", True)
    assert ner.available() is False
    assert ner.detect_persons("Fatma Kaya geldi") == []
    r = anonymize("Fatma Kaya 0532 123 45 67", [], extra_detectors=[ner.detect_persons])
    assert "[TELEFON-1]" in r.text and "Fatma Kaya" in r.text  # kural katmanı çalışır, NER yok


# --- politika (config) ve rapor ---
from app.privacy.policy import Policy  # noqa: E402

_SEHIR = "Dava Ankara'da görüldü. Ankara Ağır Ceza Mahkemesi karar verdi."


def test_policy_city_flag_keeps_text_but_reports():
    r = anonymize(_SEHIR)
    assert "Ankara" in r.text
    assert r.report["ŞEHİR"]["mod"] == "işaretle" and r.report["ŞEHİR"]["adet"] == 2
    assert "ŞEHİR" not in r.counts and r.spans and r.spans[0][3] == "işaretle"


def test_policy_city_mask_and_off():
    mask = anonymize(_SEHIR, policy=Policy.from_dict({"kategoriler": {"ŞEHİR": "maskele"}, "sehirler": ["Ankara"]}))
    assert "Ankara" not in mask.text and "[ŞEHİR-1]" in mask.text
    off = anonymize(_SEHIR, policy=Policy.from_dict({"kategoriler": {"ŞEHİR": "kapalı"}, "sehirler": ["Ankara"]}))
    assert "ŞEHİR" not in off.report and "Ankara" in off.text


def test_policy_invalid_mode_rejected():
    with pytest.raises(ValueError) as exc:
        Policy.from_dict({"kategoriler": {"KİŞİ": "sil"}})
    assert "Geçersiz mod" in str(exc.value)


def test_report_has_no_original_values():
    r = anonymize("Ayşe Yılmaz 0532 123 45 67", [Entity("Ayşe Yılmaz")])
    txt = r.report_text() + repr(r.report)
    assert "Ayşe" not in txt and "0532" not in txt
    assert r.report["KİŞİ"]["farkli"] == 1 and r.report["TELEFON"]["adet"] == 1


def test_court_names_not_taken_as_address():
    r = anonymize("Ankara Bölge Adliye Mahkemesi ve Ağır Ceza Mah. kararı.")
    assert "ADRES" not in r.report and "Ağır Ceza" in r.text


def test_uppercase_names_and_surname_propagation():
    t = "HAKİM : KAAN ZİLCİ  216681\nVekili Av. Fatih PEKASİL sundu. Pekasil'in beyanı. PEKASİL itiraz etti."
    r = anonymize(t)
    for v in ("ZİLCİ", "KAAN", "216681", "PEKASİL", "Pekasil"):
        assert v.lower() not in r.text.lower(), v
    assert r.report["KİŞİ"]["farkli"] == 2


def test_fold_caps_preserves_offsets_and_titlecases():
    from app.privacy.ner import fold_caps

    t = "Sanık MEHMET YILMAZ TCK 5237"
    f = fold_caps(t)
    assert len(f) == len(t)
    assert f == "Sanık Mehmet Yılmaz Tck 5237"


def test_ner_kinds_follow_policy_and_heuristic_modes():
    import dataclasses

    from app.privacy.policy import default_policy

    def fake(text):
        i = text.find("Ankara")
        return [(i, i + 6, "YER", "YER:ankara")] if i >= 0 else []
    r = anonymize("Dosya Ankara 3. Mahkemede.", extra_detectors=[fake])
    assert "Ankara" in r.text and r.report["YER"]["mod"] == "işaretle"
    pol = dataclasses.replace(default_policy(), kisi_sezgisel="yedek")
    hit = anonymize("Davalı Mehmet YILMAZ geldi.", extra_detectors=[fake], policy=pol)
    assert "YILMAZ" in hit.text  # dedektör varken yedek sezgi çalışmaz
    assert "YILMAZ" not in anonymize("Davalı Mehmet YILMAZ geldi.", policy=pol).text  # dedektör yokken çalışır


def test_policy_invalid_heuristic_mode_rejected():
    with pytest.raises(ValueError) as exc:
        Policy.from_dict({"kategoriler": {}, "kisi_sezgisel": "belki"})
    assert "Geçersiz mod" in str(exc.value)
