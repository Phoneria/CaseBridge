"""Rules that derive the legacy case columns from the party list."""
from app.services.case_parties import (
    PartyData,
    derive_client_name,
    derive_client_role,
    derive_opposing_party,
    legacy_parties,
)


def _p(name, role, is_client=False, counsel=None):
    return PartyData(name=name, role=role, is_client=is_client, counsel_name=counsel)


def test_client_name_joins_every_client_party():
    parties = [_p("A Ltd.", "plaintiff", True), _p("B A.Ş.", "defendant"), _p("C Bey", "plaintiff", True)]
    assert derive_client_name(parties) == "A Ltd., C Bey"


def test_client_name_is_cut_to_255_characters():
    parties = [_p("A" * 200, "plaintiff", True), _p("B" * 200, "plaintiff", True)]
    assert len(derive_client_name(parties)) == 255


def test_client_role_comes_from_the_first_client_party():
    assert derive_client_role([_p("X", "defendant"), _p("A", "plaintiff", True), _p("B", "defendant", True)]) == "plaintiff"
    assert derive_client_role([_p("A", "defendant", True)]) == "defendant"


def test_intervener_and_other_clients_map_to_other():
    assert derive_client_role([_p("A", "intervener", True)]) == "other"
    assert derive_client_role([_p("A", "other", True)]) == "other"


def test_client_role_is_none_without_a_client():
    assert derive_client_role([_p("A", "plaintiff")]) is None


def test_opposing_party_is_the_opposite_role_of_a_plaintiff_client():
    parties = [_p("A", "plaintiff", True), _p("B", "defendant"), _p("C", "defendant"), _p("D", "intervener"), _p("E", "plaintiff")]
    assert derive_opposing_party(parties, "plaintiff") == "B, C"


def test_opposing_party_is_the_opposite_role_of_a_defendant_client():
    parties = [_p("A", "defendant", True), _p("B", "plaintiff"), _p("C", "defendant")]
    assert derive_opposing_party(parties, "defendant") == "B"


def test_opposing_party_is_every_other_party_when_the_client_role_is_other():
    parties = [_p("A", "other", True), _p("B", "defendant"), _p("C", "intervener")]
    assert derive_opposing_party(parties, "other") == "B, C"
    assert derive_opposing_party(parties, None) == "B, C"


def test_opposing_party_is_none_without_opposing_parties():
    assert derive_opposing_party([_p("A", "plaintiff", True), _p("D", "intervener")], "plaintiff") is None


def test_opposing_party_is_cut_to_255_characters():
    parties = [_p("A", "plaintiff", True), _p("B" * 200, "defendant"), _p("C" * 200, "defendant")]
    assert len(derive_opposing_party(parties, "plaintiff")) == 255


def test_legacy_parties_use_role_other_client_first():
    assert legacy_parties("Ahmet", "Zeynep") == [
        PartyData(name="Ahmet", role="other", is_client=True),
        PartyData(name="Zeynep", role="other", is_client=False),
    ]


def test_legacy_parties_skip_a_blank_opposing_party():
    assert legacy_parties("Ahmet", None) == [PartyData(name="Ahmet", role="other", is_client=True)]
    assert legacy_parties("Ahmet", "  ") == [PartyData(name="Ahmet", role="other", is_client=True)]
