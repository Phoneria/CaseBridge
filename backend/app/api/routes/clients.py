import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.client import (
    ClientCaseItem,
    ClientCreate,
    ClientDetailOut,
    ClientListItem,
    ClientOut,
    ClientStats,
    ClientUpdate,
)
from app.services.audit import changed_fields, record_audit, snapshot
from app.services.client_service import ClientHasCasesError, ClientService

router = APIRouter(prefix="/clients", tags=["clients"])
logger = logging.getLogger("casebridge")

CLIENT_NOT_FOUND = "Müvekkil bulunamadı."
ONLY_ADMIN_DELETES = "Müvekkili yalnızca yönetici silebilir."


def _log(action: str, client_id: str, user: User) -> None:
    # Ids only: a client's name and contact details are personal data.
    logger.info("Müvekkil işlemi: %s müvekkil=%s büro=%s işlemi yapan=%s", action, client_id, user.law_firm_id, user.id)


def _client_or_404(service: ClientService, client_id: str, user: User):
    client = service.get(client_id, user.law_firm_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=CLIENT_NOT_FOUND)
    return client


@router.get("", response_model=list[ClientListItem])
def list_clients(
    q: Optional[str] = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = ClientService(db).list_clients(current_user.law_firm_id, q, limit, offset)
    return [
        ClientListItem.model_validate(client).model_copy(update={"case_count": total, "open_case_count": open_})
        for client, total, open_ in rows
    ]


def _client_type(client) -> str:
    return getattr(client.client_type, "value", client.client_type)


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = ClientService(db).create(current_user.law_firm_id, payload, current_user.id)
    _log("created", client.id, current_user)
    record_audit(db, current_user, "client.created", target_type="client", target_id=client.id,
                 flags={"client_type": _client_type(client)})
    return client


@router.get("/{client_id}", response_model=ClientDetailOut)
def get_client(client_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service = ClientService(db)
    client = _client_or_404(service, client_id, current_user)
    cases = service.cases_of(client)
    return ClientDetailOut(
        **ClientOut.model_validate(client).model_dump(),
        stats=ClientStats(**service.stats_of(cases)),
        cases=[ClientCaseItem.model_validate(case) for case in cases],
    )


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: str, payload: ClientUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    service = ClientService(db)
    found = _client_or_404(service, client_id, current_user)
    before = snapshot(found, sorted(payload.model_fields_set))
    client = service.update(found, payload)
    _log("updated", client.id, current_user)
    changed = changed_fields(client, before)
    if changed:
        record_audit(db, current_user, "client.updated", target_type="client", target_id=client.id, fields=changed,
                     flags={"client_type": _client_type(client)})
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service = ClientService(db)
    client = _client_or_404(service, client_id, current_user)
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ONLY_ADMIN_DELETES)
    client_type = _client_type(client)
    try:
        service.delete(client)
    except ClientHasCasesError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    _log("deleted", client_id, current_user)
    record_audit(db, current_user, "client.deleted", target_type="client", target_id=client_id,
                 flags={"client_type": client_type})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
