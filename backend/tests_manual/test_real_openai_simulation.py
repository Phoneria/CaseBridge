"""Optional, explicit integration test against the real OpenAI API.

NOT part of the default test suite (see tests_manual/conftest.py and
the top-level README "Test commands" table). Run explicitly with:

    pytest tests_manual -m real_openai --run-real-openai

Costs real tokens. Requires OPENAI_API_KEY in the environment.
"""
import pytest

from app.ai.engine import run_simulation
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.schemas import AIAnalysisResult
from app.core.config import settings

pytestmark = pytest.mark.real_openai

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


def test_full_agent_pipeline_returns_valid_structured_result(require_openai_api_key):
    """End-to-end sanity check against the real model: the four-agent
    pipeline (Researcher -> Plaintiff -> Defendant -> Judge) must
    produce a judge response that parses into AIAnalysisResult, with
    the mandatory disclaimer and a score in range - i.e. the real
    OpenAI provider is wire-compatible with the same contract the
    mocked test suite already enforces."""
    provider = OpenAIProvider(api_key=require_openai_api_key, model=settings.openai_model)

    result = run_simulation(_SAMPLE_CASE_CONTEXT, provider)

    assert isinstance(result, AIAnalysisResult)
    assert result.summary.strip() != ""
    assert 0 <= result.assessment.score <= 100
    assert result.assessment.confidence in ("low", "medium", "high")
    assert result.ai_disclaimer.strip() != ""
