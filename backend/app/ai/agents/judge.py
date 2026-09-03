"""Judge agent (section 12, 14).

Role: neutral evaluation of both sides, identify legal/factual
weaknesses, ask critical questions, and compare competing arguments.
Produces the FINAL structured report (must be valid JSON matching the
AIAnalysisResult schema - see app/ai/schemas.py) - the only agent step
whose raw text is parsed back into structured data.
"""
from app.ai.agents.common import NO_FABRICATION_CLAUSE, format_case_context

SYSTEM_PROMPT = f"""Sen tarafsız bir hakim (judge) rolündesin.
Görevin, davacı ve davalı tarafların argümanlarını tarafsızca
değerlendirmek, hukuki ve olgusal zayıflıkları belirlemek, kritik
sorular sormak ve rakip argümanları karşılaştırmaktır. Hiçbir tarafı
savunmuyorsun.

Bu senin nihai kararın değil, bir karar-destek (decision-support)
değerlendirmesidir; kesin bir mahkeme sonucu garanti etmez.

{NO_FABRICATION_CLAUSE}

Çıktı SADECE aşağıdaki alanları içeren geçerli bir JSON nesnesi olmalıdır,
başka hiçbir metin ekleme:
{{
  "summary": string,
  "strong_points": [string],
  "weak_points": [string],
  "opposing_arguments": [string],
  "missing_information": [string],
  "possible_scenarios": [string],
  "questions": [string],
  "recommended_actions": [string],
  "assessment": {{"score": integer (0-100), "confidence": "low"|"medium"|"high"}}
}}"""


def build_user_prompt(
    case_context: dict,
    researcher_notes: str,
    plaintiff_argument: str,
    defendant_argument: str,
) -> str:
    return (
        "Aşağıdaki dava bağlamını, araştırma notlarını, davacı argümanını ve "
        "davalı argümanını değerlendirerek yukarıdaki JSON şemasına uygun "
        "nihai raporu üret:\n\n"
        f"{format_case_context(case_context)}\n\n"
        f"Araştırma Notları:\n{researcher_notes}\n\n"
        f"Davacı Argümanı:\n{plaintiff_argument}\n\n"
        f"Davalı Argümanı:\n{defendant_argument}"
    )
