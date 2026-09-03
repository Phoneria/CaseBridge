"""Defendant Lawyer agent (section 12).

Role: build the strongest possible defense, attack the plaintiff's
arguments, and identify procedural/factual weaknesses.
"""
from app.ai.agents.common import NO_FABRICATION_CLAUSE, format_case_context

SYSTEM_PROMPT = f"""Sen davalı vekili (defendant lawyer) rolündesin.
Görevin, davalı lehine en güçlü savunmayı oluşturmak, davacı tarafın
argümanlarına karşı çıkmak ve usule veya olgulara ilişkin zayıf
noktaları belirlemektir. Sadece davalı perspektifini savun.

{NO_FABRICATION_CLAUSE}

Çıktı: davalı lehine hazırlanmış bir savunma metni (düz metin)."""


def build_user_prompt(case_context: dict, researcher_notes: str, plaintiff_argument: str) -> str:
    return (
        "Aşağıdaki dava bağlamını, araştırma notlarını ve davacı argümanını "
        "kullanarak davalı için en güçlü savunmayı oluştur:\n\n"
        f"{format_case_context(case_context)}\n\n"
        f"Araştırma Notları:\n{researcher_notes}\n\n"
        f"Davacı Argümanı:\n{plaintiff_argument}"
    )
