import pytest

from app.services.client_names import client_name_key


@pytest.mark.parametrize(
    "name, key",
    [
        ("ACME  Ltd.", "acme ltd."),
        ("  acme ltd. ", "acme ltd."),
        ("IŞIK Hukuk", "ışık hukuk"),
        ("İSTANBUL", "istanbul"),
        ("Ali\tVeli\n", "ali veli"),
    ],
)
def test_client_name_key_collapses_spaces_and_lowers_the_turkish_way(name, key):
    assert client_name_key(name) == key


def test_dotted_and_dotless_capital_i_stay_different():
    assert client_name_key("IRMAK") == "ırmak"
    assert client_name_key("İRMAK") == "irmak"
