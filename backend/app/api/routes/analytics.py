from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_law_firm_id
from app.db.session import get_db
from app.models.case import CaseType
from app.schemas.analytics import AnalyticsOverview
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])

_ALLOWED_MONTHS = {3: 3, 6: 6, 12: 12}


@router.get("/overview", response_model=AnalyticsOverview)
def get_overview(
    months: Optional[int] = Query(default=None, description="3, 6, or 12 - omit for all time"),
    case_type: Optional[CaseType] = None,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    resolved_months = _ALLOWED_MONTHS.get(months) if months is not None else None
    return AnalyticsService(db).compute_overview(law_firm_id, months=resolved_months, case_type=case_type)
