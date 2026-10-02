"""Turkish reminder e-mail content."""
from datetime import date, datetime

import pytest

from app.models.calendar import ReminderSourceType
from app.services.notification_content import build_reminder_email, day_phrase
from app.services.reminder_service import DueReminder


def _due(**overrides):
    values = dict(
        source_type=ReminderSourceType.EVENT,
        source_id="e1",
        law_firm_id="f1",
        occurrence_date=date(2026, 10, 5),
        days_before=(3,),
        recipient_id="u1",
        recipient_email="avukat@demo.casebridge.dev",
        type_label="Duruşma",
        title="Ticari Kira Uyarlama Davası",
        starts_at=datetime(2026, 10, 5, 14, 30),
        location="İstanbul 3. Asliye Ticaret",
        case_id="c1",
        case_name="Ticari Kira Uyarlama Davası",
    )
    values.update(overrides)
    return DueReminder(**values)


@pytest.mark.parametrize("days,phrase", [(0, "bugün"), (1, "yarın"), (3, "3 gün sonra"), (7, "7 gün sonra")])
def test_day_phrase(days, phrase):
    assert day_phrase(days) == phrase


def test_subject_follows_the_spec_example():
    message = build_reminder_email(_due(), date(2026, 10, 2))
    assert message.subject == "Hatırlatma: 3 gün sonra Duruşma – Ticari Kira Uyarlama Davası"
    assert message.to == "avukat@demo.casebridge.dev"


def test_body_lists_details_links_and_footer():
    message = build_reminder_email(_due(), date(2026, 10, 2))

    for line in [
        "Tür: Duruşma",
        "Başlık: Ticari Kira Uyarlama Davası",
        "Tarih: 05.10.2026",
        "Saat: 14:30",
        "Konum: İstanbul 3. Asliye Ticaret",
        "Dava: Ticari Kira Uyarlama Davası",
        "Davayı aç: http://localhost:3000/davalar/c1",
        "Takvimde gör: http://localhost:3000/takvim?ay=2026-10",
        "Bu e-posta CaseBridge tarafından otomatik gönderildi.",
    ]:
        assert line in message.text
    assert 'href="http://localhost:3000/davalar/c1"' in message.html
    assert "Bu e-posta CaseBridge tarafından otomatik gönderildi." in message.html


def test_untimed_reminder_without_case_has_no_time_or_case_link(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "app_base_url", "https://casebridge.example/")
    message = build_reminder_email(
        _due(starts_at=None, case_id=None, case_name=None, location=None, type_label="Görev", title="Dilekçe"),
        date(2026, 10, 4),
    )

    assert message.subject == "Hatırlatma: yarın Görev – Dilekçe"
    assert "Saat:" not in message.text
    assert "Davayı aç" not in message.text
    assert "Takvimde gör: https://casebridge.example/takvim?ay=2026-10" in message.text


def test_html_escapes_user_text():
    message = build_reminder_email(_due(title="<script>x</script>"), date(2026, 10, 5))
    assert "<script>" not in message.html
    assert "&lt;script&gt;" in message.html
    assert message.subject.startswith("Hatırlatma: bugün Duruşma")
