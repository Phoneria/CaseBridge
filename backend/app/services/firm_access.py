"""Whether a firm's users may use CaseBridge: a firm suspended by the
CaseBridge team locks every one of its users out (the data stays)."""
from app.models.user import User

FIRM_SUSPENDED = "Büronuzun erişimi askıya alındı."


def firm_is_open(user: User) -> bool:
    return bool(user.law_firm.is_active)
