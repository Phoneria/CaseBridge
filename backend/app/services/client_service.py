"""A firm's clients and the link between case client parties and them.

Every write of a non-precedent case's parties goes through
resolve_party_clients(): a client party ends up with the client_id of one of
the firm's clients and with that client's name; a non-client party never has
a client_id.
"""
from dataclasses import replace
from datetime import date
from typing import Optional, Sequence

from sqlalchemy import and_, case as sql_case, distinct, func, or_
from sqlalchemy.orm import Session

from app.models.case import Case, CaseOutcome, CaseParty, CaseStatus, case_is_active
from app.models.client import Client, ClientType
from app.schemas.client import ClientCreate, ClientUpdate
from app.services.case_parties import InvalidPartiesError, PartyData, derive_client_name
from app.services.client_names import client_name_key

UNKNOWN_CLIENT = "Seçilen müvekkil bulunamadı."


class UnknownClientError(InvalidPartiesError):
    """A party names a client that is not one of the firm's (HTTP 422 like every party rule)."""


def find_or_create_client(db: Session, law_firm_id: str, name: str, created_by: Optional[str] = None) -> Client:
    """The firm's client with this normalized name (the oldest when several
    share it), or a new person client with only the name filled in."""
    key = client_name_key(name)
    client = (
        db.query(Client)
        .filter(Client.law_firm_id == law_firm_id, Client.name_key == key)
        .order_by(Client.created_at, Client.id)
        .first()
    )
    if client is None:
        client = Client(
            law_firm_id=law_firm_id,
            name=" ".join(name.split()),
            name_key=key,
            client_type=ClientType.PERSON.value,
            created_by=created_by,
        )
        db.add(client)
        db.flush()
    return client


def resolve_party_clients(
    db: Session, law_firm_id: str, parties: Sequence[PartyData], created_by: Optional[str] = None
) -> list[PartyData]:
    """Raises UnknownClientError when a party names a client the firm does not have."""
    resolved: list[PartyData] = []
    for party in parties:
        if not party.is_client:
            resolved.append(replace(party, client_id=None))
            continue
        if party.client_id is not None:
            client = (
                db.query(Client)
                .filter(Client.id == party.client_id, Client.law_firm_id == law_firm_id)
                .first()
            )
            if client is None:
                raise UnknownClientError(UNKNOWN_CLIENT)
        else:
            client = find_or_create_client(db, law_firm_id, party.name, created_by)
        resolved.append(replace(party, name=client.name, client_id=client.id))
    return resolved


CLIENT_HAS_CASES = "Bu müvekkilin davaları var; silinemez."


class ClientHasCasesError(Exception):
    """The client is linked to a case party (HTTP 409)."""


def _is_open(case: Case) -> bool:
    return not case.is_archived and case.status != CaseStatus.KAPALI


class ClientService:
    def __init__(self, db: Session):
        self.db = db

    def list_clients(
        self, law_firm_id: str, q: Optional[str] = None, limit: int = 50, offset: int = 0
    ) -> list[tuple[Client, int, int]]:
        """(client, case_count, open_case_count) rows ordered by name. Counts skip precedents."""
        linked_case = and_(Case.id == CaseParty.case_id, Case.is_precedent.is_(False))
        case_count = func.count(distinct(Case.id))
        open_count = func.count(distinct(sql_case((case_is_active(), Case.id), else_=None)))
        query = (
            self.db.query(Client, case_count, open_count)
            .outerjoin(CaseParty, CaseParty.client_id == Client.id)
            .outerjoin(Case, linked_case)
            .filter(Client.law_firm_id == law_firm_id)
        )
        if q and q.strip():
            raw = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    Client.name_key.like(f"%{client_name_key(q)}%"),
                    Client.phone.ilike(raw),
                    Client.email.ilike(raw),
                )
            )
        rows = query.group_by(Client.id).order_by(Client.name_key, Client.id).offset(offset).limit(limit).all()
        return [(client, int(total or 0), int(open_ or 0)) for client, total, open_ in rows]

    def get(self, client_id: str, law_firm_id: str) -> Optional[Client]:
        return self.db.query(Client).filter(Client.id == client_id, Client.law_firm_id == law_firm_id).first()

    def create(self, law_firm_id: str, payload: ClientCreate, created_by: Optional[str]) -> Client:
        name = " ".join(payload.name.split())
        client = Client(
            law_firm_id=law_firm_id,
            name=name,
            name_key=client_name_key(name),
            client_type=payload.client_type.value,
            phone=payload.phone,
            email=str(payload.email) if payload.email else None,
            address=payload.address,
            notes=payload.notes,
            created_by=created_by,
        )
        self.db.add(client)
        self.db.commit()
        self.db.refresh(client)
        return client

    def update(self, client: Client, payload: ClientUpdate) -> Client:
        fields = payload.model_fields_set
        renamed = False
        if "name" in fields:
            name = " ".join(payload.name.split())
            renamed = name != client.name
            client.name = name
            client.name_key = client_name_key(name)
        if "client_type" in fields:
            client.client_type = payload.client_type.value
        if "email" in fields:
            client.email = str(payload.email) if payload.email else None
        for field in ("phone", "address", "notes"):
            if field in fields:
                setattr(client, field, getattr(payload, field))
        if renamed:
            self._rename_linked_parties(client)
        self.db.commit()
        self.db.refresh(client)
        return client

    def _rename_linked_parties(self, client: Client) -> None:
        """Linked party names follow the client's name; every touched case
        (archived ones too: client_name is a derived copy) gets client_name
        re-derived from its client parties."""
        parties = self.db.query(CaseParty).filter(CaseParty.client_id == client.id).all()
        for party in parties:
            party.name = client.name
        self.db.flush()
        case_ids = {party.case_id for party in parties}
        if not case_ids:
            return
        for case in self.db.query(Case).filter(Case.id.in_(case_ids)).all():
            data = [PartyData(p.name, p.role, p.is_client, p.counsel_name) for p in case.parties]
            case.client_name = derive_client_name(data) or case.client_name

    def delete(self, client: Client) -> None:
        if self.db.query(CaseParty.id).filter(CaseParty.client_id == client.id).first() is not None:
            raise ClientHasCasesError(CLIENT_HAS_CASES)
        self.db.delete(client)
        self.db.commit()

    def cases_of(self, client: Client) -> list[Case]:
        """Open cases first, then by next hearing (none last), then newest opening date."""
        cases = (
            self.db.query(Case)
            .filter(
                Case.law_firm_id == client.law_firm_id,
                Case.is_precedent.is_(False),
                Case.parties.any(CaseParty.client_id == client.id),
            )
            .all()
        )

        def order(case: Case):
            hearing = case.next_hearing_date
            opened = case.opening_date or date.min
            return (0 if _is_open(case) else 1, hearing is None, hearing or date.min, -opened.toordinal())

        return sorted(cases, key=order)

    @staticmethod
    def stats_of(cases: list[Case]) -> dict:
        return {
            "total": len(cases),
            "open": sum(1 for c in cases if _is_open(c)),
            "closed": sum(1 for c in cases if c.status == CaseStatus.KAPALI),
            "archived": sum(1 for c in cases if c.is_archived),
            "won": sum(1 for c in cases if c.outcome == CaseOutcome.WON),
            "lost": sum(1 for c in cases if c.outcome == CaseOutcome.LOST),
            "settled": sum(1 for c in cases if c.outcome == CaseOutcome.SETTLED),
            "total_case_value": float(sum(c.case_value or 0 for c in cases)),
        }
