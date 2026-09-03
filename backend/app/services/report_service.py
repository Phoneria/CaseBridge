"""Report generation (Phase 4 - Raporlar). CSV export of the firm's
case list. Real data, no PDF yet (documented as a follow-up rather
than faked)."""
import csv
import io

from sqlalchemy.orm import Session

from app.services.case_service import CaseService

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
                [
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
