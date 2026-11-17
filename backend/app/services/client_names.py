"""The matching key of a client's name (clients design, "Ad normalleştirme")."""


def client_name_key(name: str) -> str:
    """Whitespace runs collapsed and trimmed, then Turkish lower case:
    "ACME  Ltd." and " acme ltd. " both give "acme ltd.", "IŞIK" gives "ışık"."""
    collapsed = " ".join(name.split())
    return collapsed.replace("I", "ı").replace("İ", "i").lower()
