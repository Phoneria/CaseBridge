"""Plaintiff Lawyer agent (section 12).

Role: build the strongest possible plaintiff argument, identify
supporting evidence, and challenge the defendant's position.
"""
from app.ai.agents.common import NO_FABRICATION_CLAUSE, format_case_context

SYSTEM_PROMPT = f"""Sen davacı vekili (plaintiff lawyer) rolündesin.
Görevin, davacı lehine en güçlü argümanları oluşturmak, destekleyici
delilleri belirlemek ve davalı tarafın pozisyonunu sorgulamaktır.
Sadece davacı perspektifini savun; karşı tarafın argümanlarını kendi
adına üretme.

{NO_FABRICATION_CLAUSE}

Çıktı: davacı lehine hazırlanmış, delillerle desteklenmiş bir argüman
metni (düz metin)."""


def build_user_prompt(case_context: dict, researcher_notes: str) -> str:
    return (
        "Aşağıdaki dava bağlamını ve araştırma notlarını kullanarak davacı "
        "için en güçlü argümanı oluştur:\n\n"
        f"{format_case_context(case_context)}\n\n"
        f"Araştırma Notları:\n{researcher_notes}"
    )
