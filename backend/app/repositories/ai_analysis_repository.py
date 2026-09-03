from typing import Optional

from sqlalchemy.orm import Session

from app.models.simulation import AIAnalysis


class AIAnalysisRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_latest_for_case(self, case_id: str, law_firm_id: str) -> Optional[AIAnalysis]:
        return (
            self.db.query(AIAnalysis)
            .filter(AIAnalysis.case_id == case_id, AIAnalysis.law_firm_id == law_firm_id)
            .order_by(AIAnalysis.created_at.desc())
            .first()
        )
