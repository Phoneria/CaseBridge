"""Simulation endpoints (Phase 3 - non-blocking job flow).

POST creates a PENDING simulation and returns 202 immediately - it
never calls the LLM provider itself. Actual execution happens on the
in-process worker (app/services/simulation_worker.py). The frontend
polls GET .../simulations/{id} until the status is terminal
(completed/failed).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.providers.base import LLMProvider
from app.api.deps import get_current_law_firm_id, get_current_user, get_llm_provider_dep
from app.db.session import get_db
from app.models.simulation import SimulationStatus
from app.models.user import User
from app.schemas.simulation import SimulationOut, SimulationWithCaseOut
from app.repositories.simulation_repository import SimulationRepository
from app.services.case_service import CaseService
from app.services.simulation_service import SimulationService

router = APIRouter(prefix="/cases", tags=["simulations"])
global_router = APIRouter(prefix="/simulations", tags=["simulations"])


def _get_owned_case_or_404(db: Session, case_id: str, law_firm_id: str):
    case = CaseService(db).get_case(case_id, law_firm_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


@router.post(
    "/{case_id}/simulations", response_model=SimulationOut, status_code=status.HTTP_202_ACCEPTED
)
def start_simulation(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    provider: LLMProvider = Depends(get_llm_provider_dep),
    db: Session = Depends(get_db),
):
    """Returns immediately with a PENDING (or the already-in-flight)
    simulation - duplicate clicks never create a second job. Poll GET
    .../simulations/{id} for progress/completion."""
    case = _get_owned_case_or_404(db, case_id, law_firm_id)
    service = SimulationService(db, provider)
    simulation = service.create_pending_simulation(case, requested_by=current_user.id)
    return SimulationService.to_out(simulation)


@router.get("/{case_id}/simulations", response_model=list[SimulationOut])
def list_simulations(
    case_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    _get_owned_case_or_404(db, case_id, law_firm_id)
    simulations = SimulationRepository(db).list_for_case(case_id, law_firm_id)
    return [SimulationService.to_out(s) for s in simulations]


@router.get("/{case_id}/simulations/{simulation_id}", response_model=SimulationOut)
def get_simulation(
    case_id: str,
    simulation_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    """The polling endpoint: current state of one simulation, whatever
    it is (pending/running/completed/failed)."""
    _get_owned_case_or_404(db, case_id, law_firm_id)
    simulation = SimulationRepository(db).get_by_id_in_firm(simulation_id, law_firm_id)
    if simulation is None or simulation.case_id != case_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation not found")
    return SimulationService.to_out(simulation)


@router.post(
    "/{case_id}/simulations/{simulation_id}/retry",
    response_model=SimulationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def retry_simulation(
    case_id: str,
    simulation_id: str,
    law_firm_id: str = Depends(get_current_law_firm_id),
    current_user: User = Depends(get_current_user),
    provider: LLMProvider = Depends(get_llm_provider_dep),
    db: Session = Depends(get_db),
):
    """Explicit user-facing recovery for a FAILED simulation: creates a
    NEW pending job (the failed row stays as an audit trail) and
    returns it immediately, same shape as POST."""
    case = _get_owned_case_or_404(db, case_id, law_firm_id)
    failed_simulation = SimulationRepository(db).get_by_id_in_firm(simulation_id, law_firm_id)
    if failed_simulation is None or failed_simulation.case_id != case_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation not found")
    if failed_simulation.status != SimulationStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a failed simulation can be retried.",
        )

    service = SimulationService(db, provider)
    retried = service.retry_simulation(failed_simulation, case, requested_by=current_user.id)
    return SimulationService.to_out(retried)


@global_router.get("", response_model=list[SimulationWithCaseOut])
def list_all_simulations(
    law_firm_id: str = Depends(get_current_law_firm_id),
    db: Session = Depends(get_db),
):
    rows = SimulationService(db, provider=None).list_for_firm_with_case(law_firm_id)
    return [
        SimulationWithCaseOut(
            **SimulationService.to_out(simulation).model_dump(),
            case_name=case_name,
            case_number=case_number,
        )
        for simulation, case_name, case_number in rows
    ]
