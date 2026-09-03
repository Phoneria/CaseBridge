"""Analytics calculations (section 16, 22 - Analytics).

Deterministic seeded data at the service/repository level, no HTTP
involved - isolates the math from routing concerns.
"""
import datetime as dt


def _make_case(firm_id, **overrides):
    from app.models.case import Case, CaseOutcome, CaseStatus, CaseType

    defaults = dict(
        law_firm_id=firm_id,
        case_number="X",
        case_name="X",
        client_name="X",
        case_type=CaseType.IS_HUKUKU,
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=dt.date(2025, 1, 1),
    )
    defaults.update(overrides)
    return Case(**defaults)


def test_empty_dataset_returns_zero_not_error(db_session):
    from app.models.law_firm import LawFirm
    from app.services.analytics_service import AnalyticsService

    firm = LawFirm(name="Empty Firm")
    db_session.add(firm)
    db_session.flush()

    overview = AnalyticsService(db_session).compute_overview(firm.id)

    assert overview.total_cases == 0
    assert overview.active_cases == 0
    assert overview.won_cases == 0
    assert overview.lost_cases == 0
    assert overview.win_rate == 0.0
    assert overview.average_case_duration_days == 0.0
    assert overview.by_category == []


def test_totals_active_won_lost_counts(db_session):
    from app.models.case import CaseOutcome, CaseStatus
    from app.models.law_firm import LawFirm
    from app.services.analytics_service import AnalyticsService

    firm = LawFirm(name="Firm")
    db_session.add(firm)
    db_session.flush()

    db_session.add_all(
        [
            _make_case(firm.id, case_number="1", status=CaseStatus.DEVAM_EDEN, outcome=CaseOutcome.ONGOING),
            _make_case(firm.id, case_number="2", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON),
            _make_case(firm.id, case_number="3", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON),
            _make_case(firm.id, case_number="4", status=CaseStatus.KAPALI, outcome=CaseOutcome.LOST),
        ]
    )
    db_session.commit()

    overview = AnalyticsService(db_session).compute_overview(firm.id)

    assert overview.total_cases == 4
    assert overview.active_cases == 1
    assert overview.won_cases == 2
    assert overview.lost_cases == 1


def test_win_rate_calculation(db_session):
    from app.models.case import CaseOutcome, CaseStatus
    from app.models.law_firm import LawFirm
    from app.services.analytics_service import AnalyticsService

    firm = LawFirm(name="Firm")
    db_session.add(firm)
    db_session.flush()

    db_session.add_all(
        [
            _make_case(firm.id, case_number="1", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON),
            _make_case(firm.id, case_number="2", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON),
            _make_case(firm.id, case_number="3", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON),
            _make_case(firm.id, case_number="4", status=CaseStatus.KAPALI, outcome=CaseOutcome.LOST),
        ]
    )
    db_session.commit()

    overview = AnalyticsService(db_session).compute_overview(firm.id)
    assert overview.win_rate == 75.0


def test_success_rate_by_category(db_session):
    from app.models.case import CaseOutcome, CaseStatus, CaseType
    from app.models.law_firm import LawFirm
    from app.services.analytics_service import AnalyticsService

    firm = LawFirm(name="Firm")
    db_session.add(firm)
    db_session.flush()

    db_session.add_all(
        [
            _make_case(
                firm.id, case_number="1", case_type=CaseType.IS_HUKUKU,
                status=CaseStatus.KAPALI, outcome=CaseOutcome.WON,
            ),
            _make_case(
                firm.id, case_number="2", case_type=CaseType.IS_HUKUKU,
                status=CaseStatus.KAPALI, outcome=CaseOutcome.LOST,
            ),
            _make_case(
                firm.id, case_number="3", case_type=CaseType.KIRA,
                status=CaseStatus.KAPALI, outcome=CaseOutcome.WON,
            ),
        ]
    )
    db_session.commit()

    overview = AnalyticsService(db_session).compute_overview(firm.id)
    by_category = {row.case_type: row for row in overview.by_category}

    assert by_category["is_hukuku"].total == 2
    assert by_category["is_hukuku"].win_rate == 50.0
    assert by_category["kira"].total == 1
    assert by_category["kira"].win_rate == 100.0


def test_average_case_duration_uses_closed_cases_only(db_session):
    from app.models.case import CaseOutcome, CaseStatus
    from app.models.law_firm import LawFirm
    from app.services.analytics_service import AnalyticsService

    firm = LawFirm(name="Firm")
    db_session.add(firm)
    db_session.flush()

    closed = _make_case(
        firm.id,
        case_number="1",
        status=CaseStatus.KAPALI,
        outcome=CaseOutcome.WON,
        opening_date=dt.date(2025, 1, 1),
    )
    still_open = _make_case(
        firm.id,
        case_number="2",
        status=CaseStatus.DEVAM_EDEN,
        outcome=CaseOutcome.ONGOING,
        opening_date=dt.date(2025, 1, 1),
    )
    db_session.add_all([closed, still_open])
    db_session.commit()
    db_session.refresh(closed)

    # Force a deterministic "closed at" timestamp (updated_at) 30 days later.
    closed.updated_at = dt.datetime(2025, 1, 31, tzinfo=dt.timezone.utc)
    db_session.add(closed)
    db_session.commit()

    overview = AnalyticsService(db_session).compute_overview(firm.id)
    assert overview.average_case_duration_days == 30.0


def test_analytics_scoped_to_law_firm(db_session):
    from app.models.case import CaseOutcome, CaseStatus
    from app.models.law_firm import LawFirm
    from app.services.analytics_service import AnalyticsService

    firm_a = LawFirm(name="A")
    firm_b = LawFirm(name="B")
    db_session.add_all([firm_a, firm_b])
    db_session.flush()

    db_session.add_all(
        [
            _make_case(firm_a.id, case_number="A1", status=CaseStatus.KAPALI, outcome=CaseOutcome.WON),
            _make_case(firm_b.id, case_number="B1", status=CaseStatus.KAPALI, outcome=CaseOutcome.LOST),
            _make_case(firm_b.id, case_number="B2", status=CaseStatus.KAPALI, outcome=CaseOutcome.LOST),
        ]
    )
    db_session.commit()

    overview_a = AnalyticsService(db_session).compute_overview(firm_a.id)
    assert overview_a.total_cases == 1
    assert overview_a.won_cases == 1
    assert overview_a.lost_cases == 0
