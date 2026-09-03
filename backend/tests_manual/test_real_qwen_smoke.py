"""Optional, explicit smoke test against the real Qwen3-32B API
(Alibaba Model Studio / DashScope, OpenAI-compatible mode).

NOT part of the default test suite. Run explicitly with:

    pytest tests_manual -m real_qwen --run-real-qwen

Requires QWEN_API_KEY and QWEN_BASE_URL in the environment. Costs real
API credits/usage against your Model Studio account.
"""
import pytest

from app.ai.engine import run_simulation
from app.ai.providers.qwen_provider import QwenProvider
from app.ai.schemas import AIAnalysisResult

pytestmark = pytest.mark.real_qwen

_SAMPLE_CASE_CONTEXT = {
    "case_name": "Kiracı Tahliye Davası",
    "case_type": "kira",
    "client_name": "Ahmet Yılmaz",
    "opposing_party": "Zeynep Kaya",
    "court": "İstanbul 3. Sulh Hukuk Mahkemesi",
    "status": "devam_eden",
    "description": (
        "Kiracı üç aydır kira bedelini ödememektedir. Ev sahibi tahliye "
        "ve birikmiş kira alacağının tahsilini talep etmektedir."
    ),
}


def test_full_agent_pipeline_returns_valid_structured_result(require_qwen_config):
    """Same wire-compatibility sanity check as the real-OpenAI smoke
    test: the four-agent pipeline against the real qwen3-32b model must
    produce a judge response that parses into AIAnalysisResult."""
    provider = QwenProvider(
        api_key=require_qwen_config["api_key"],
        base_url=require_qwen_config["base_url"],
        model="qwen3-32b",
    )

    result = run_simulation(_SAMPLE_CASE_CONTEXT, provider)

    assert isinstance(result, AIAnalysisResult)
    assert result.summary.strip() != ""
    assert 0 <= result.assessment.score <= 100
    assert result.assessment.confidence in ("low", "medium", "high")
    assert result.ai_disclaimer.strip() != ""


def test_thinking_mode_aggregates_final_content_only(require_qwen_config):
    """With QWEN_ENABLE_THINKING behavior on, the provider must still
    return only the final answer text - never raw reasoning_content."""
    provider = QwenProvider(
        api_key=require_qwen_config["api_key"],
        base_url=require_qwen_config["base_url"],
        model="qwen3-32b",
        enable_thinking=True,
    )

    result = provider.complete(
        system_prompt="Sen yardımsever bir asistansın.",
        user_prompt="1+1 kaçtır? Tek kelimeyle cevap ver.",
    )
    assert result.strip() != ""
