"""Supplement the on-demand portfolio with varied, repeatable fictional decisions."""
from random import Random

from app.db.seed import DEMO_CASES
from app.models.case import CaseOutcome

# Each reference has a known result. A complementary decision guarantees a mixed
# category even for the small portfolios. The second decision varies by bureau.
EXAMPLES = {
    "2025/240": ("Mal tesliminden doğan alacak", "Hizmet faturası uyuşmazlığı"),
    "2025/201": ("Fazla çalışma ücreti", "İşçilik alacağı"),
    "2025/142": ("Kira bedeli uyuşmazlığı", "Kira farkı alacağı"),
    "2025/175": ("Hizmet sözleşmesinden doğan zarar", "Sözleşme bedeli uyuşmazlığı"),
    "2024/284": ("Takip konusu borca itiraz", "Ödenen borcun iadesi"),
}


def outcome_examples(firm_id):
    rng = Random(f"casebridge/demo-outcomes/v1/{firm_id}")
    for source in DEMO_CASES:
        number = source["case_number"]
        if number not in EXAMPLES:
            continue
        opposite = CaseOutcome.LOST if source["outcome"] == CaseOutcome.WON else CaseOutcome.WON
        for index, title in enumerate(EXAMPLES[number], start=1):
            result = opposite if index == 1 else rng.choice((CaseOutcome.WON, CaseOutcome.LOST))
            decision = "Müvekkilin talebi kabul edildi." if result == CaseOutcome.WON else "Müvekkilin talebi reddedildi."
            yield number, {
                **source,
                "case_number": f"SONUC-{number}-{index}",
                "case_name": title,
                "outcome": result,
                "description": f"{title} hakkında sonuçlanan kurgusal dosya. {decision}",
                "closing_note": f"{title} hakkında karar verildi. {decision}",
            }


def template_numbers():
    return [row["case_number"] for row in DEMO_CASES] + [
        f"SONUC-{number}-{index}" for number in EXAMPLES for index in (1, 2)
    ]
