"""Reminder rules with a fixed local clock: due computation, catch-up,
recipients, no duplicates, re-scheduling and retry limits."""
from datetime import date, datetime

import pytest

from app.services.email import EmailSendError
from app.services.reminder_service import ReminderService, due_offsets

NOW = datetime(2026, 10, 2, 9, 30)  # Friday morning, local time
TODAY = NOW.date()


class Outbox:
    def __init__(self, fail_with=None):
        self.messages = []
        self.fail_with = fail_with

    def __call__(self, message):
        if self.fail_with is not None:
            raise self.fail_with
        self.messages.append(message)


@pytest.fixture()
def world(db_session):
    from app.models.case import Case, CaseStatus, CaseType
    from app.models.law_firm import LawFirm
    from app.models.user import User, UserRole

    firm = LawFirm(name="Büro A")
    other_firm = LawFirm(name="Büro B")
    db_session.add_all([firm, other_firm])
    db_session.flush()

    def user(email, firm_id=firm.id, active=True):
        u = User(law_firm_id=firm_id, email=email, hashed_password="x", full_name=email.split("@")[0],
                 role=UserRole.LAWYER, is_active=active)
        db_session.add(u)
        db_session.flush()
        return u

    lawyer = user("avukat@a.test")
    creator = user("olusturan@a.test")
    passive = user("pasif@a.test", active=False)
    outsider = user("avukat@b.test", firm_id=other_firm.id)
    case = Case(law_firm_id=firm.id, case_number="2026/1", case_name="Ticari Kira Uyarlama Davası",
                client_name="Deniz", case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN,
                assigned_lawyer_id=lawyer.id, court="İstanbul 3. Asliye Ticaret")
    db_session.add(case)
    db_session.commit()
    return {"db": db_session, "firm": firm, "other_firm": other_firm, "lawyer": lawyer, "creator": creator,
            "passive": passive, "outsider": outsider, "case": case}


def add_event(world, starts_at, reminder_days, **extra):
    from app.models.calendar import CalendarEvent, CalendarEventType

    event = CalendarEvent(
        law_firm_id=extra.pop("law_firm_id", world["firm"].id),
        title=extra.pop("title", "Müvekkil toplantısı"),
        event_type=extra.pop("event_type", CalendarEventType.MEETING),
        starts_at=starts_at,
        all_day=extra.pop("all_day", False),
        duration_minutes=60,
        created_by=extra.pop("created_by", world["creator"].id),
        reminder_days=reminder_days,
        **extra,
    )
    world["db"].add(event)
    world["db"].commit()
    return event


def add_task(world, due_date, **extra):
    from app.models.task import Task

    task = Task(case_id=world["case"].id, law_firm_id=world["firm"].id, title=extra.pop("title", "Dilekçe hazırla"),
                due_date=due_date, created_by=world["creator"].id, **extra)
    world["db"].add(task)
    world["db"].commit()
    return task


def deliveries(world):
    from app.models.calendar import ReminderDelivery

    return world["db"].query(ReminderDelivery).order_by(ReminderDelivery.days_before.desc()).all()


# ----- due_offsets (pure) -----


@pytest.mark.parametrize(
    "occurrence,days,today,expected",
    [
        (date(2026, 10, 5), [3, 1], date(2026, 10, 2), [3]),  # exactly 3 days before
        (date(2026, 10, 5), [3, 1], date(2026, 10, 1), []),  # too early
        (date(2026, 10, 5), [3, 1], date(2026, 10, 3), [3]),  # missed 3-day reminder caught up
        (date(2026, 10, 5), [3, 1], date(2026, 10, 4), [3, 1]),  # both due, 3 caught up
        (date(2026, 10, 5), [3, 1], date(2026, 10, 5), []),  # on the day only d=0 is sent
        (date(2026, 10, 5), [1, 0], date(2026, 10, 5), [0]),
        (date(2026, 10, 1), [3, 1, 0], date(2026, 10, 2), []),  # past occurrence
        (date(2026, 10, 5), [], date(2026, 10, 4), []),
    ],
)
def test_due_offsets(occurrence, days, today, expected):
    assert due_offsets(occurrence, days, today) == expected


# ----- collect_due -----


def test_nothing_is_due_before_the_send_hour(world):
    add_event(world, datetime(2026, 10, 3, 14, 0), [1], assignee_id=world["lawyer"].id)
    service = ReminderService(world["db"])
    assert service.collect_due(datetime(2026, 10, 2, 8, 59)) == []
    assert len(service.collect_due(datetime(2026, 10, 2, 9, 0))) == 1


def test_event_reminder_goes_to_the_assignee_with_event_details(world):
    event = add_event(world, datetime(2026, 10, 5, 14, 30), [3, 1], assignee_id=world["lawyer"].id,
                      case_id=world["case"].id, location="Büro")

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.occurrence_date) == ("event", event.id, date(2026, 10, 5))
    assert due.days_before == (3,)
    assert (due.recipient_id, due.recipient_email) == (world["lawyer"].id, "avukat@a.test")
    assert (due.type_label, due.title, due.location) == ("Toplantı", "Müvekkil toplantısı", "Büro")
    assert due.starts_at == datetime(2026, 10, 5, 14, 30)
    assert (due.case_id, due.case_name) == (world["case"].id, "Ticari Kira Uyarlama Davası")


def test_event_without_assignee_reminds_its_creator(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1])
    [due] = ReminderService(world["db"]).collect_due(NOW)
    assert due.recipient_id == world["creator"].id


def test_inactive_recipient_is_skipped(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["passive"].id)
    assert ReminderService(world["db"]).collect_due(NOW) == []


def test_all_day_events_have_no_time(world):
    add_event(world, datetime(2026, 10, 3, 0, 0), [1], all_day=True)
    [due] = ReminderService(world["db"]).collect_due(NOW)
    assert due.starts_at is None


def test_pending_task_reminds_its_assignee_with_default_one_day(world):
    from app.models.task import TaskStatus

    task = add_task(world, date(2026, 10, 3), assigned_to=world["lawyer"].id)
    add_task(world, date(2026, 10, 3), title="Bitti", status=TaskStatus.COMPLETED)
    add_task(world, date(2026, 10, 3), title="Sessiz", reminder_days=[])

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.days_before) == ("task", task.id, (1,))
    assert (due.recipient_id, due.type_label, due.title) == (world["lawyer"].id, "Görev", "Dilekçe hazırla")


def test_unassigned_task_reminds_its_creator(world):
    add_task(world, date(2026, 10, 3))
    [due] = ReminderService(world["db"]).collect_due(NOW)
    assert due.recipient_id == world["creator"].id


def test_case_hearing_reminds_the_assigned_lawyer_three_days_before(world):
    world["case"].next_hearing_date = date(2026, 10, 5)
    world["db"].commit()

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.days_before) == ("case_hearing", world["case"].id, (3,))
    assert (due.type_label, due.title, due.location) == ("Duruşma", "Ticari Kira Uyarlama Davası", "İstanbul 3. Asliye Ticaret")
    assert due.recipient_id == world["lawyer"].id


def test_case_hearing_without_lawyer_or_archived_is_skipped(world):
    world["case"].next_hearing_date = date(2026, 10, 5)
    world["case"].assigned_lawyer_id = None
    world["db"].commit()
    assert ReminderService(world["db"]).collect_due(NOW) == []

    world["case"].assigned_lawyer_id = world["lawyer"].id
    world["case"].is_archived = True
    world["db"].commit()
    assert ReminderService(world["db"]).collect_due(NOW) == []


def test_case_hearing_is_skipped_when_a_hearing_event_exists_that_day(world):
    from app.models.calendar import CalendarEventType

    world["case"].next_hearing_date = date(2026, 10, 5)
    world["db"].commit()
    event = add_event(world, datetime(2026, 10, 5, 10, 0), [3, 1], event_type=CalendarEventType.HEARING,
                      title="Duruşma", case_id=world["case"].id, assignee_id=world["lawyer"].id)

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.source_type.value, due.source_id, due.type_label) == ("event", event.id, "Duruşma")


def test_sources_of_every_firm_are_collected_but_recipients_must_match_the_firm(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], law_firm_id=world["other_firm"].id,
              created_by=world["outsider"].id)
    add_event(world, datetime(2026, 10, 3, 11, 0), [1], assignee_id=world["outsider"].id)  # foreign assignee

    [due] = ReminderService(world["db"]).collect_due(NOW)

    assert (due.law_firm_id, due.recipient_id) == (world["other_firm"].id, world["outsider"].id)


# ----- send_due -----


def test_send_due_sends_once_and_records_the_delivery(world):
    add_event(world, datetime(2026, 10, 5, 14, 30), [3, 1], assignee_id=world["lawyer"].id)
    outbox = Outbox()
    service = ReminderService(world["db"], sender=outbox)

    assert service.send_due(NOW).sent == 1
    assert service.send_due(datetime(2026, 10, 2, 17, 0)).sent == 0  # same day, later poll

    assert [m.subject for m in outbox.messages] == ["Hatırlatma: 3 gün sonra Toplantı – Müvekkil toplantısı"]
    [row] = deliveries(world)
    assert (row.status.value, row.attempts, row.days_before, row.last_error) == ("sent", 1, 3, None)
    assert row.sent_at is not None


def test_missed_offsets_are_merged_into_one_email(world):
    add_event(world, datetime(2026, 10, 5, 14, 30), [3, 1], assignee_id=world["lawyer"].id)
    outbox = Outbox()

    result = ReminderService(world["db"], sender=outbox).send_due(datetime(2026, 10, 4, 9, 0))

    assert result.sent == 1
    assert [m.subject for m in outbox.messages] == ["Hatırlatma: yarın Toplantı – Müvekkil toplantısı"]
    assert [(row.days_before, row.status.value) for row in deliveries(world)] == [(3, "sent"), (1, "sent")]


def test_moving_an_event_to_another_day_schedules_a_new_reminder(world):
    event = add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    outbox = Outbox()
    service = ReminderService(world["db"], sender=outbox)
    service.send_due(NOW)

    event.starts_at = datetime(2026, 10, 4, 10, 0)
    world["db"].commit()
    service.send_due(datetime(2026, 10, 3, 9, 0))

    assert len(outbox.messages) == 2
    assert {row.occurrence_date for row in deliveries(world)} == {date(2026, 10, 3), date(2026, 10, 4)}


def test_failures_are_recorded_and_retried_up_to_the_attempt_limit(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    failing = Outbox(fail_with=EmailSendError("SMTPServerDisconnected"))
    service = ReminderService(world["db"], sender=failing)

    for _ in range(3):
        assert service.send_due(NOW).failed == 1
    assert service.send_due(NOW).failed == 0  # attempts exhausted (REMINDER_MAX_ATTEMPTS=3)

    [row] = deliveries(world)
    assert (row.status.value, row.attempts, row.last_error, row.sent_at) == ("failed", 3, "SMTPServerDisconnected", None)


def test_a_failed_reminder_can_succeed_on_retry(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    ReminderService(world["db"], sender=Outbox(fail_with=EmailSendError("SMTPConnectError"))).send_due(NOW)

    outbox = Outbox()
    assert ReminderService(world["db"], sender=outbox).send_due(NOW).sent == 1

    [row] = deliveries(world)
    assert (row.status.value, row.attempts, row.last_error) == ("sent", 2, None)


def test_unexpected_sender_errors_are_recorded_without_stopping_the_run(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id, title="A")
    add_event(world, datetime(2026, 10, 3, 11, 0), [1], assignee_id=world["lawyer"].id, title="B")
    calls = []

    def flaky(message):
        calls.append(message.subject)
        if len(calls) == 1:
            raise RuntimeError("boom with secret body")

    result = ReminderService(world["db"], sender=flaky).send_due(NOW)

    assert (result.sent, result.failed) == (1, 1)
    assert {row.last_error for row in deliveries(world)} == {"RuntimeError", None}


# ----- claim before send, firm scoping, started events -----


def _fail_commit_once(db, monkeypatch, on_call, exc):
    """Make the `on_call`-th commit of the session raise `exc` (after rolling back, like a real failure)."""
    original = db.commit
    state = {"calls": 0}

    def commit():
        state["calls"] += 1
        if state["calls"] == on_call:
            db.rollback()
            raise exc
        return original()

    monkeypatch.setattr(db, "commit", commit)


def test_a_conflicting_claim_skips_that_reminder_and_the_run_continues(world, monkeypatch):
    from sqlalchemy.exc import IntegrityError

    from app.models.calendar import ReminderDelivery

    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id, title="A")
    add_event(world, datetime(2026, 10, 3, 11, 0), [1], assignee_id=world["lawyer"].id, title="B")
    outbox = Outbox()
    _fail_commit_once(world["db"], monkeypatch, 1, IntegrityError("insert", {}, Exception("dup")))

    result = ReminderService(world["db"], sender=outbox).send_due(NOW)

    assert result.sent == 1
    assert len(outbox.messages) == 1  # the claimed-by-someone-else reminder was not sent by us
    assert world["db"].query(ReminderDelivery).count() == 1  # session still usable


def test_a_failing_final_commit_does_not_abort_the_run(world, monkeypatch):
    from sqlalchemy.exc import OperationalError

    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id, title="A")
    add_event(world, datetime(2026, 10, 3, 11, 0), [1], assignee_id=world["lawyer"].id, title="B")
    outbox = Outbox()
    # commit 1 = claim of the first reminder, commit 2 = its final status update
    _fail_commit_once(world["db"], monkeypatch, 2, OperationalError("update", {}, Exception("lost")))

    ReminderService(world["db"], sender=outbox).send_due(NOW)

    assert len(outbox.messages) == 2
    statuses = sorted((row.status.value, row.last_error) for row in deliveries(world))
    assert statuses == [("failed", "InFlight"), ("sent", None)]  # the unconfirmed one costs a retry, not a duplicate


def test_the_claim_is_written_before_the_email_is_sent(world):
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id)
    seen = []

    def sender(message):
        seen.append([(r.status.value, r.attempts, r.last_error) for r in deliveries(world)])

    ReminderService(world["db"], sender=sender).send_due(NOW)

    assert seen == [[("failed", 1, "InFlight")]]
    assert [(r.status.value, r.attempts) for r in deliveries(world)] == [("sent", 1)]


def test_a_case_of_another_firm_is_not_exposed(world):
    from app.models.case import Case, CaseStatus, CaseType

    foreign = Case(law_firm_id=world["other_firm"].id, case_number="9", case_name="Gizli Yabancı Dava",
                   client_name="X", case_type=CaseType.KIRA, status=CaseStatus.DEVAM_EDEN,
                   assigned_lawyer_id=world["outsider"].id)
    world["db"].add(foreign)
    world["db"].commit()
    add_event(world, datetime(2026, 10, 3, 10, 0), [1], assignee_id=world["lawyer"].id, case_id=foreign.id)
    add_task(world, date(2026, 10, 3), assigned_to=world["lawyer"].id).case_id = foreign.id
    world["db"].commit()
    outbox = Outbox()

    ReminderService(world["db"], sender=outbox).send_due(NOW)

    for message in outbox.messages:
        assert "Gizli Yabancı Dava" not in message.text + message.html
        assert foreign.id not in message.text


def test_a_started_timed_event_gets_no_same_day_reminder(world):
    from app.models.calendar import CalendarEventType

    add_event(world, datetime(2026, 10, 2, 9, 0), [0], assignee_id=world["lawyer"].id, title="Başladı")
    add_event(world, datetime(2026, 10, 2, 15, 0), [0], assignee_id=world["lawyer"].id, title="Sonra")
    add_event(world, datetime(2026, 10, 2, 0, 0), [0], all_day=True, assignee_id=world["lawyer"].id, title="Tüm gün")

    titles = sorted(d.title for d in ReminderService(world["db"]).collect_due(NOW))

    assert titles == ["Sonra", "Tüm gün"]
