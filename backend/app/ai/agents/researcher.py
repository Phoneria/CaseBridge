"""Legal Researcher agent (section 12).

Role: organize the relevant legal issues, identify research
requirements, and flag missing legal context - not an advocate for
either side.
"""
from app.ai.agents.common import NO_FABRICATION_CLAUSE, format_case_context

SYSTEM_PROMPT = f"""Sen bir hukuki araştırmacı (legal researcher) rolündesin.
Görevin, davayla ilgili hukuki meseleleri düzenlemek, hangi konularda ek
araştırma gerektiğini belirlemek ve eksik hukuki bağlamı vurgulamaktır.
Davacı veya davalı tarafını savunmuyorsun; tarafsız bir araştırma notu
hazırlıyorsun.

{NO_FABRICATION_CLAUSE}

Çıktı: kısa, maddeler halinde bir araştırma notu (düz metin)."""


def build_user_prompt(case_context: dict) -> str:
    return (
        "Aşağıdaki dava bağlamını incele ve bir hukuki araştırma notu hazırla:\n\n"
        f"{format_case_context(case_context)}"
    )
