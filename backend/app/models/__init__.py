"""SQLAlchemy ORM models. Importing this package registers all models
on the shared declarative Base so Base.metadata.create_all() sees them."""
from app.models.law_firm import LawFirm  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.case import Case, CaseType, CaseStatus, CaseOutcome, CaseEvent, CaseEventType  # noqa: F401
from app.models.document import Document, DocumentType  # noqa: F401
from app.models.simulation import Simulation, SimulationStatus, AIAnalysis, AnalysisType, AssessmentConfidence  # noqa: F401
from app.models.task import Task, TaskStatus  # noqa: F401
from app.models.courtroom import (  # noqa: F401
    CourtroomActor,
    CourtroomPhase,
    CourtroomRole,
    CourtroomScenario,
    CourtroomSession,
    CourtroomSessionStatus,
    CourtroomTurn,
    CourtroomTurnType,
    JudgeEvaluation,
    ScenarioDifficulty,
    ScenarioEvidence,
)
