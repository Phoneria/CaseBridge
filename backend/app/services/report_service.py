"""Report generation (Phase 4 - Raporlar). CSV exports and the numbers
shown on the report cards. Every number uses the same definition as the
list it links to (spec 5.1), so cards and lists never disagree."""
import csv
import io

from sqlalchemy.orm import Session

from app.models.task import TaskStatus
from app.repositories.task_repository import TaskRepository
from app.schemas.report import ReportSummary
from app.services.analytics_service import AnalyticsService
from app.services.case_service import CaseService

UPCOMING_HEARING_WINDOW_DAYS = 30

_HEADERS = [
    "case_number",
    "case_name",
    "client_name",
    "opposing_party",
    "case_type",
    "status",
    "outcome",
    "opening_date",
    "next_hearing_date",
]

_BOM = "﻿"  # lets Excel open the Turkish CSVs as UTF-8

_TASK_STATUS_LABELS = {TaskStatus.PENDING: "Açık", TaskStatus.COMPLETED: "Tamamlandı"}

_CASE_TYPE_LABELS = {
    "is_hukuku": "İş Hukuku",
    "ticaret_hukuku": "Ticaret Hukuku",
    "sozlesme": "Sözleşme",
    "kira": "Kira",
    "icra": "İcra",
    "diger": "Diğer",
}


_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe_cell(value):
    """Neutralise spreadsheet formula injection: text that Excel would treat
    as a formula gets a leading quote. Numbers and other values pass through."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _bom_csv(rows: list[list]) -> str:
    buffer = io.StringIO()
    csv.writer(buffer).writerows([[_safe_cell(cell) for cell in row] for row in rows])
    return _BOM + buffer.getvalue()


class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self.cases = CaseService(db)

    def cases_csv(self, law_firm_id: str) -> str:
        cases = self.cases.list_cases(law_firm_id, include_archived=True)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(_HEADERS)
        for case in cases:
            writer.writerow(
                _safe_cell(cell)
                for cell in [
                    case.case_number,
                    case.case_name,
                    case.client_name,
                    case.opposing_party or "",
                    case.case_type.value,
                    case.status.value,
                    case.outcome.value,
                    case.opening_date.isoformat() if case.opening_date else "",
                    case.next_hearing_date.isoformat() if case.next_hearing_date else "",
                ]
            )
        return buffer.getvalue()

    def upcoming_hearings(self, law_firm_id: str):
        cases = self.cases.list_cases(law_firm_id, hearing_within_days=UPCOMING_HEARING_WINDOW_DAYS)
        return sorted(cases, key=lambda c: c.next_hearing_date)

    def hearings_csv(self, law_firm_id: str) -> str:
        rows: list[list] = [["Tarih", "Dava No", "Dava", "Müvekkil", "Mahkeme"]]
        for case in self.upcoming_hearings(law_firm_id):
            rows.append(
                [
                    case.next_hearing_date.isoformat(),
                    case.case_number,
                    case.case_name,
                    case.client_name,
                    case.court or "",
                ]
            )
        return _bom_csv(rows)

    def tasks_csv(self, law_firm_id: str) -> str:
        rows: list[list] = [["Görev", "Dava No", "Dava", "Son Tarih", "Durum"]]
        for task, case_name, case_number in TaskRepository(self.db).list_for_firm_with_case(law_firm_id):
            rows.append(
                [
                    task.title,
                    case_number,
                    case_name,
                    task.due_date.isoformat() if task.due_date else "",
                    _TASK_STATUS_LABELS[task.status],
                ]
            )
        return _bom_csv(rows)

    def performance_csv(self, law_firm_id: str) -> str:
        overview = AnalyticsService(self.db).compute_overview(law_firm_id)
        rows: list[list] = [
            ["Kategori", "Toplam", "Kazanılan", "Kaybedilen", "Kazanma Oranı (%)"],
            ["Tümü", overview.total_cases, overview.won_cases, overview.lost_cases, overview.win_rate],
        ]
        for row in overview.by_category:
            rows.append(
                [
                    _CASE_TYPE_LABELS.get(row.case_type.value, row.case_type.value),
                    row.total,
                    row.won,
                    row.lost,
                    row.win_rate,
                ]
            )
        return _bom_csv(rows)

    def summary(self, law_firm_id: str) -> ReportSummary:
        overview = AnalyticsService(self.db).compute_overview(law_firm_id)
        open_tasks = TaskRepository(self.db).list_for_firm_with_case(law_firm_id, status=TaskStatus.PENDING)
        return ReportSummary(
            total_cases=overview.total_cases,
            upcoming_hearings_30d=len(self.upcoming_hearings(law_firm_id)),
            open_tasks=len(open_tasks),
            win_rate=overview.win_rate,
        )
