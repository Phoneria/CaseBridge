"""A firm's clients and the link between case client parties and them.

Every write of a non-precedent case's parties goes through
resolve_party_clients(): a client party ends up with the client_id of one of
the firm's clients and with that client's name; a non-client party never has
a client_id.
"""
from dataclasses import replace
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from app.models.client import Client, ClientType
from app.services.case_parties import InvalidPartiesError, PartyData
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
