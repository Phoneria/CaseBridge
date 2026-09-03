"""Report endpoints (Phase 4 - Raporlar). CSV export of the firm's
cases - real data pulled from the same CaseService used everywhere
else, not a separate/duplicated query path.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/cases.csv")
def export_cases_csv(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    csv_content = ReportService(db).cases_csv(law_firm_id)
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=davalar.csv"},
    )
