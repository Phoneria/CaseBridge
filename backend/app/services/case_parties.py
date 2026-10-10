"""Rules that keep the legacy case columns in step with the party list.

`cases.client_name` and `cases.opposing_party` are still read by the case
list, search, reports, precedents and the courtroom, so whenever parties are
written they are derived from the parties with the functions below.
"""
from dataclasses import dataclass
from typing import Optional, Sequence

from app.models.case import CaseParty

MAX_JOINED_LENGTH = 255
_OPPOSITE_ROLE = {"plaintiff": "defendant", "defendant": "plaintiff"}


class InvalidPartiesError(ValueError):
    """The party list breaks a business rule (mapped to HTTP 422)."""


@dataclass(frozen=True)
class PartyData:
    name: str
    role: str
    is_client: bool
    counsel_name: Optional[str] = None


def require_client(parties: Sequence[PartyData]) -> None:
    if not any(party.is_client for party in parties):
        raise InvalidPartiesError("En az bir taraf müvekkil olarak işaretlenmeli.")


def _join(names: Sequence[str]) -> Optional[str]:
    joined = ", ".join(names)
    return joined[:MAX_JOINED_LENGTH] if joined else None


def derive_client_name(parties: Sequence[PartyData]) -> Optional[str]:
    return _join([party.name for party in parties if party.is_client])


def derive_client_role(parties: Sequence[PartyData]) -> Optional[str]:
    """Role of the first client party; an intervener counts as "other"."""
    for party in parties:
        if party.is_client:
            return party.role if party.role in _OPPOSITE_ROLE else "other"
    return None


def derive_opposing_party(parties: Sequence[PartyData], client_role: Optional[str]) -> Optional[str]:
    """Non-client parties on the opposite side of the client; every non-client
    party when the client's side is "other" or unknown. When the client is a
    plaintiff/defendant but nobody holds the opposite role, the non-client
    parties with role "other" stand in (an intervener alone yields None)."""
    others = [party for party in parties if not party.is_client]
    opposite = _OPPOSITE_ROLE.get(client_role or "")
    if opposite is None:
        return _join([party.name for party in others])
    opposing = [party for party in others if party.role == opposite]
    if not opposing:
        opposing = [party for party in others if party.role == "other"]
    return _join([party.name for party in opposing])


def legacy_parties(client_name: str, opposing_party: Optional[str]) -> list[PartyData]:
    """The parties of a case that only knows client_name / opposing_party."""
    parties = [PartyData(name=client_name, role="other", is_client=True)]
    if opposing_party and opposing_party.strip():
        parties.append(PartyData(name=opposing_party, role="other", is_client=False))
    return parties


def party_models(parties: Sequence[PartyData], law_firm_id: str) -> list[CaseParty]:
    return [
        CaseParty(
            law_firm_id=law_firm_id,
            name=party.name,
            role=party.role,
            is_client=party.is_client,
            counsel_name=party.counsel_name,
            sort_order=index,
        )
        for index, party in enumerate(parties)
    ]
