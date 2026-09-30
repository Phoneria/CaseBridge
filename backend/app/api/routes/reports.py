"""Report endpoints (Phase 4 - Raporlar). CSV exports and the card
summary - real data pulled from the same services used everywhere else,
not a separate/duplicated query path.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.schemas.report import ReportSummary
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


def _csv_response(content: str, filename: str) -> PlainTextResponse:
    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/cases.csv")
def export_cases_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).cases_csv(law_firm_id), "davalar.csv")


@router.get("/hearings.csv")
def export_hearings_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).hearings_csv(law_firm_id), "durusmalar.csv")


@router.get("/tasks.csv")
def export_tasks_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).tasks_csv(law_firm_id), "gorevler.csv")


@router.get("/performance.csv")
def export_performance_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return _csv_response(ReportService(db).performance_csv(law_firm_id), "performans.csv")


@router.get("/summary", response_model=ReportSummary)
def report_summary(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    return ReportService(db).summary(law_firm_id)
