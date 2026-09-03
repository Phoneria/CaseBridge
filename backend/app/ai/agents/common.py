"""Shared fragments composed into every agent's system prompt.

Keeping the no-fabrication / verification clause in one place means
every agent gets it identically - no risk of one role quietly missing
the safety instruction (section 12, 15).
"""

NO_FABRICATION_CLAUSE = (
    "Gerçek mahkeme kararlarını, içtihatları veya mevzuatı asla uydurma (fabricate). "
    "Belirli bir yasa maddesi veya karardan emin değilsen, bunu genel bir ilke olarak "
    "ifade et ve yanına 'doğrulama gerektirir' (requires verification) notu ekle."
)


def format_case_context(case_context: dict) -> str:
    lines = [f"{key}: {value}" for key, value in case_context.items() if value]
    return "\n".join(lines) if lines else "(Dava hakkında ek bilgi sağlanmadı.)"
