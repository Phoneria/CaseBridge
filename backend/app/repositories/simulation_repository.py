from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models.simulation import Simulation, SimulationStatus


class SimulationRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, simulation: Simulation) -> Simulation:
        self.db.add(simulation)
        self.db.commit()
        self.db.refresh(simulation)
        return simulation

    def save(self, simulation: Simulation) -> Simulation:
        self.db.add(simulation)
        self.db.commit()
        self.db.refresh(simulation)
        return simulation

    def list_for_case(self, case_id: str, law_firm_id: str) -> list[Simulation]:
        return (
            self.db.query(Simulation)
            .options(joinedload(Simulation.result))
            .filter(Simulation.case_id == case_id, Simulation.law_firm_id == law_firm_id)
            .order_by(Simulation.started_at.desc())
            .all()
        )

    def get_by_id_in_firm(self, simulation_id: str, law_firm_id: str) -> Optional[Simulation]:
        return (
            self.db.query(Simulation)
            .options(joinedload(Simulation.result))
            .filter(Simulation.id == simulation_id, Simulation.law_firm_id == law_firm_id)
            .first()
        )

    def get_active_for_case(self, case_id: str, law_firm_id: str) -> Optional[Simulation]:
        """The single non-terminal (PENDING/RUNNING) simulation for a
        case, if any - used to make simulation creation idempotent
        (Phase 3): a duplicate POST while one is already in flight must
        never create a second job."""
        return (
            self.db.query(Simulation)
            .filter(
                Simulation.case_id == case_id,
                Simulation.law_firm_id == law_firm_id,
                Simulation.status.in_([SimulationStatus.PENDING, SimulationStatus.RUNNING]),
            )
            .order_by(Simulation.started_at.desc())
            .first()
        )

    def list_for_firm_with_case(self, law_firm_id: str) -> list[tuple[Simulation, str, str]]:
        from app.models.case import Case

        return (
            self.db.query(Simulation, Case.case_name, Case.case_number)
            .options(joinedload(Simulation.result))
            .join(Case, Simulation.case_id == Case.id)
            .filter(Simulation.law_firm_id == law_firm_id, Case.is_precedent.is_(False))
            .order_by(Simulation.started_at.desc())
            .all()
        )

    def get_oldest_pending(self) -> Optional[Simulation]:
        """Infra-level (not tenant-scoped): the single job queue's next
        unit of work, oldest-first, for the in-process worker
        (app/services/simulation_worker.py, Phase 3)."""
        return (
            self.db.query(Simulation)
            .filter(Simulation.status == SimulationStatus.PENDING)
            .order_by(Simulation.started_at.asc())
            .first()
        )
