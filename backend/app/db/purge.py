"""Delete cases together with everything that references them."""
import os

from app.models.case import Case, CaseEvent
from app.models.document import Document
from app.models.simulation import AIAnalysis, Simulation
from app.models.task import Task


def delete_cases(db, cases: list[Case]) -> int:
    ids = [c.id for c in cases]
    if not ids:
        return 0
    for doc in db.query(Document).filter(Document.case_id.in_(ids)).all():
        path = doc.storage_path or ""
        if path and not path.startswith("demo://") and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
    for model in (AIAnalysis, Simulation, Task, Document, CaseEvent):
        db.query(model).filter(model.case_id.in_(ids)).delete(synchronize_session=False)
    db.query(Case).filter(Case.id.in_(ids)).delete(synchronize_session=False)
    db.flush()
    return len(ids)
