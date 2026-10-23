"""Input rules for timeline entries and notes (app/services/case_events.py)."""
from datetime import date

import pytest

from app.models.case import CaseEventType
from app.schemas.case import CaseEventCreate
from app.services.case_events import CaseEventInputError, clean_event_fields, clean_note_text, note_title


def test_note_title_is_the_first_non_blank_line_with_collapsed_spaces():
    assert note_title("\n\n  Bilirkişi   raporu\tgeldi \nikinci satır") == "Bilirkişi raporu geldi"


def test_note_title_is_cut_at_120_characters_with_an_ellipsis():
    title = note_title("a" * 200)
    assert len(title) == 120
    assert title.endswith("…")


def test_clean_note_text_trims_and_checks_length():
    assert clean_note_text("  Müvekkil aradı.  ") == "Müvekkil aradı."
    with pytest.raises(CaseEventInputError) as blank:
        clean_note_text("   ")
    assert blank.value.detail == "Not metni boş olamaz."
    with pytest.raises(CaseEventInputError) as missing:
        clean_note_text(None)
    assert missing.value.detail == "Not metni boş olamaz."
    with pytest.raises(CaseEventInputError) as long:
        clean_note_text("x" * 4001)
    assert long.value.detail == "Not en fazla 4000 karakter olabilir."
    assert clean_note_text("x" * 4000) == "x" * 4000


def test_a_note_ignores_the_sent_title_and_derives_it():
    fields = clean_event_fields(CaseEventCreate(
        event_date=date(2026, 10, 1), title="yok sayılır", description="İlk satır\nDetay", event_type=CaseEventType.NOTE,
    ))
    assert fields == {
        "event_date": date(2026, 10, 1), "title": "İlk satır", "description": "İlk satır\nDetay",
        "event_type": CaseEventType.NOTE,
    }


def test_other_types_need_a_title_and_keep_an_optional_description():
    fields = clean_event_fields(CaseEventCreate(
        event_date=date(2026, 10, 1), title="  Rapor geldi ", description="   ", event_type=CaseEventType.EXPERT_REPORT,
    ))
    assert fields["title"] == "Rapor geldi"
    assert fields["description"] is None
    with pytest.raises(CaseEventInputError) as blank:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1), title="  "))
    assert blank.value.detail == "Gelişme başlığı boş olamaz."
    with pytest.raises(CaseEventInputError) as missing:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1)))
    assert missing.value.detail == "Gelişme başlığı boş olamaz."
    with pytest.raises(CaseEventInputError) as long_title:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1), title="x" * 256))
    assert long_title.value.detail == "Gelişme başlığı en fazla 255 karakter olabilir."
    with pytest.raises(CaseEventInputError) as long_description:
        clean_event_fields(CaseEventCreate(event_date=date(2026, 10, 1), title="Başlık", description="x" * 4001))
    assert long_description.value.detail == "Açıklama en fazla 4000 karakter olabilir."
