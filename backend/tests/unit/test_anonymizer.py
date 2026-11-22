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
