"""Case handover report generation (section 18, 22 - Case Handover).

Pulls together everything a new lawyer taking over a case needs:
overview, chronological timeline, current situation, key documents,
important arguments/risks (from the most recent AI simulation, if
any), upcoming dates, and recommended next steps.

`pending_tasks` reflects real Task rows for the case (Phase 4) -
titles of PENDING tasks, ordered by due date. No longer a placeholder.
"""
from sqlalchemy.orm import Session

from app.models.case import Case
from app.repositories.ai_analysis_repository import AIAnalysisRepository
from app.repositories.case_event_repository import CaseEventRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.case import CaseEventOut
from app.schemas.document import DocumentOut
from app.schemas.handover import CaseOverview, HandoverReport

_STATUS_LABELS = {
    "devam_eden": "Dava devam ediyor.",
    "durusma_bekleyen": "Duruşma bekleniyor.",
    "karar_bekleyen": "Karar bekleniyor.",
    "kapali": "Dava kapatıldı.",
}


class HandoverService:
    def __init__(self, db: Session):
        self.db = db
        self.events = CaseEventRepository(db)
        self.documents = DocumentRepository(db)
        self.analyses = AIAnalysisRepository(db)
        self.tasks = TaskRepository(db)

    def generate(self, case: Case) -> HandoverReport:
        timeline = self.events.list_for_case(case.id, case.law_firm_id)
        documents = self.documents.list_for_case(case.id, case.law_firm_id)
        latest_analysis = self.analyses.get_latest_for_case(case.id, case.law_firm_id)

        current_situation = _STATUS_LABELS.get(case.status.value, "Durum bilinmiyor.")
        important_arguments: list[str] = []
        risks: list[str] = []
        recommended_next_steps: list[str] = []

        if latest_analysis is not None:
            current_situation = latest_analysis.summary
            important_arguments = list(latest_analysis.strong_points)
            risks = list(latest_analysis.weak_points) + list(latest_analysis.missing_information)
            recommended_next_steps = list(latest_analysis.recommended_actions)

        upcoming_dates = [case.next_hearing_date.isoformat()] if case.next_hearing_date else []

        return HandoverReport(
            case_id=case.id,
            case_overview=CaseOverview(
                case_number=case.case_number,
                case_name=case.case_name,
                client_name=case.client_name,
                opposing_party=case.opposing_party,
                case_type=case.case_type.value,
                court=case.court,
                status=case.status.value,
                opening_date=case.opening_date,
            ),
            timeline=[CaseEventOut.model_validate(e) for e in timeline],
            current_situation=current_situation,
            key_documents=[DocumentOut.model_validate(d) for d in documents],
            important_arguments=important_arguments,
            risks=risks,
            pending_tasks=self.tasks.list_pending_titles_for_case(case.id, case.law_firm_id),
            upcoming_dates=upcoming_dates,
            recommended_next_steps=recommended_next_steps,
        )
