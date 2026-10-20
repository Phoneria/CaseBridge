"""next_hearing_date is a cache of the earliest hearing event that is today or later."""
from datetime import datetime, timedelta

import pytest

from app.core.timeutil import local_today
from app.models.calendar import CalendarEvent, CalendarEventType
from app.models.case import Case, CaseStatus, CaseType
from app.models.law_firm import LawFirm
from app.models.user import User, UserRole
from app.services.hearing_dates import add_all_day_hearing, recompute_next_hearing, recompute_open_cases

TODAY = local_today()


@pytest.fixture()
def world(db_session):
    firm = LawFirm(name="Büro")
    other_firm = LawFirm(name="Başka Büro")
    db_session.add_all([firm, other_firm])
    db_session.flush()
    lawyer = User(law_firm_id=firm.id, email="a@test", hashed_password="x", full_name="Avukat", role=UserRole.LAWYER, is_active=True)
    db_session.add(lawyer)
    db_session.flush()

    def case(number, firm_id=firm.id, **fields):
        item = Case(law_firm_id=firm_id, case_number=number, case_name=number, client_name="M", case_type=CaseType.KIRA,
                    assigned_lawyer_id=lawyer.id, **fields)
        db_session.add(item)
        db_session.flush()
        return item

    def hearing(item, starts_at, event_type=CalendarEventType.HEARING):
        event = CalendarEvent(law_firm_id=item.law_firm_id, title="Duruşma", event_type=event_type, starts_at=starts_at,
                              all_day=False, duration_minutes=60, case_id=item.id, created_by=lawyer.id, reminder_days=[3, 1])
        db_session.add(event)
        db_session.flush()
        return event

    return {"db": db_session, "firm": firm, "other_firm": other_firm, "lawyer": lawyer, "case": case, "hearing": hearing}


def at(days, hour=10):
    return datetime.combine(TODAY + timedelta(days=days), datetime.min.time()).replace(hour=hour)


def test_the_earliest_hearing_from_today_on_wins(world):
    case = world["case"]("2026/1")
    world["hearing"](case, at(-3))
    world["hearing"](case, at(9))
    world["hearing"](case, at(4))
    world["hearing"](case, at(2), event_type=CalendarEventType.MEETING)

    recompute_next_hearing(world["db"], case, TODAY)

    assert case.next_hearing_date == TODAY + timedelta(days=4)


def test_a_hearing_today_counts_even_after_its_time_and_none_left_clears_the_date(world):
    case = world["case"]("2026/1", next_hearing_date=TODAY - timedelta(days=20))
    hearing = world["hearing"](case, at(0, hour=0))

    recompute_next_hearing(world["db"], case, TODAY)
    assert case.next_hearing_date == TODAY

    recompute_next_hearing(world["db"], case, TODAY + timedelta(days=1))  # the next local day
    assert case.next_hearing_date is None
    world["db"].delete(hearing)
    recompute_next_hearing(world["db"], case, TODAY)
    assert case.next_hearing_date is None


def test_other_cases_and_other_firms_do_not_leak_in(world):
    mine = world["case"]("2026/1")
    other = world["case"]("2026/2")
    foreign = world["case"]("2026/3", firm_id=world["other_firm"].id)
    world["hearing"](other, at(1))
    world["hearing"](foreign, at(2))

    recompute_next_hearing(world["db"], mine, TODAY)

    assert mine.next_hearing_date is None


def test_recompute_open_cases_only_touches_open_cases(world):
    stale = world["case"]("2026/1", next_hearing_date=TODAY - timedelta(days=1))
    fresh = world["case"]("2026/2")
    closed = world["case"]("2026/3", status=CaseStatus.KAPALI, next_hearing_date=TODAY - timedelta(days=1))
    archived = world["case"]("2026/4", is_archived=True, next_hearing_date=TODAY - timedelta(days=1))
    precedent = world["case"]("2026/5", is_precedent=True, next_hearing_date=TODAY - timedelta(days=1))
    unchanged = world["case"]("2026/6", next_hearing_date=TODAY + timedelta(days=2))
    world["hearing"](stale, at(6))
    world["hearing"](fresh, at(3))
    world["hearing"](unchanged, at(2))
    world["hearing"](closed, at(3))
    world["db"].commit()

    changed = recompute_open_cases(world["db"], TODAY)

    assert changed == 2
    world["db"].expire_all()
    assert stale.next_hearing_date == TODAY + timedelta(days=6)
    assert fresh.next_hearing_date == TODAY + timedelta(days=3)
    assert unchanged.next_hearing_date == TODAY + timedelta(days=2)
    # Closed, archived and precedent cases keep what they have.
    assert closed.next_hearing_date == archived.next_hearing_date == precedent.next_hearing_date == TODAY - timedelta(days=1)


def test_recompute_open_cases_moves_a_date_that_has_passed_to_the_next_hearing(world):
    case = world["case"]("2026/1", next_hearing_date=TODAY)
    world["hearing"](case, at(0))
    world["hearing"](case, at(14))
    world["db"].commit()

    assert recompute_open_cases(world["db"], TODAY + timedelta(days=1)) == 1

    world["db"].refresh(case)
    assert case.next_hearing_date == TODAY + timedelta(days=14)


def test_add_all_day_hearing_defaults(world):
    case = world["case"]("2026/1")
    day = TODAY + timedelta(days=7)

    event = add_all_day_hearing(world["db"], case, day, world["lawyer"].id)
    world["db"].flush()

    assert (event.title, event.event_type, event.all_day, event.starts_at) == ("Duruşma", CalendarEventType.HEARING, True, datetime.combine(day, datetime.min.time()))
    assert (event.case_id, event.assignee_id, event.created_by, event.reminder_days) == (case.id, world["lawyer"].id, world["lawyer"].id, [3, 1])
    assert event.law_firm_id == world["firm"].id
