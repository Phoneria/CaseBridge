"""Task-based model levels for Dosya Analizi and Canlı Duruşma."""
import pytest

from app.ai.llm_levels import TASK_LEVELS, level_for_task, provider_for
from app.ai.providers.mock_provider import MockProvider
from app.core.config import settings


def test_task_table_is_exact():
    assert TASK_LEVELS == {
        "analysis.research": "standard",
        "analysis.plaintiff": "standard",
        "analysis.defendant": "standard",
        "analysis.judge": "deep",
        "courtroom.opponent": "standard",
        "courtroom.judge_interim": "basic",
        "courtroom.judge_final": "deep",
        "courtroom.json_repair": "basic",
    }


def test_unknown_task_raises():
    with pytest.raises(ValueError):
        level_for_task("analysis.typo")


def test_provider_for_returns_plain_providers_unchanged():
    provider = MockProvider(default_response="x")
    assert provider_for(provider, "analysis.judge") is provider
    with pytest.raises(ValueError):
        provider_for(provider, "nope")


def test_level_models_fall_back_to_the_providers_standard_model(monkeypatch):
    from app.ai.provider_factory import llm_model_for_level, standard_llm_model

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_model", "gpt-standard")
    monkeypatch.setattr(settings, "llm_model_basic", "")
    monkeypatch.setattr(settings, "llm_model_deep", "  ")
    assert standard_llm_model() == "gpt-standard"
    assert [llm_model_for_level(level) for level in ("basic", "standard", "deep")] == ["gpt-standard"] * 3

    monkeypatch.setattr(settings, "llm_model_basic", "gpt-small")
    monkeypatch.setattr(settings, "llm_model_deep", "gpt-big")
    assert [llm_model_for_level(level) for level in ("basic", "standard", "deep")] == ["gpt-small", "gpt-standard", "gpt-big"]

    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_model", "qwen3.5:9b")
    assert llm_model_for_level("standard") == "qwen3.5:9b"
    monkeypatch.setattr(settings, "llm_provider", "qwen")
    monkeypatch.setattr(settings, "qwen_model", "qwen3-32b")
    assert llm_model_for_level("standard") == "qwen3-32b"


def test_routed_provider_builds_one_provider_per_model_and_tracks_usage():
    from app.ai.provider_factory import LevelRoutedProvider

    built = []

    def build(model):
        built.append(model)
        provider = MockProvider(default_response=model)
        provider.last_usage = {"model": model}
        return provider

    models = {"basic": "small", "standard": "mid", "deep": "big"}
    routed = LevelRoutedProvider(build=build, model_for_level=models.__getitem__)

    assert routed.for_task("courtroom.json_repair").complete("s", "u") == "small"
    assert routed.last_usage == {"model": "small"}
    assert routed.for_task("analysis.judge").complete("s", "u") == "big"
    assert routed.last_usage == {"model": "big"}
    assert routed.for_task("courtroom.judge_interim").complete("s", "u") == "small"
    assert routed.complete("s", "u") == "mid"  # direct calls use Standart
    assert built == ["mid", "small", "big"]  # standard built eagerly, each model once


def test_get_llm_provider_routes_real_providers_and_keeps_mock(monkeypatch):
    from app.ai.provider_factory import LevelRoutedProvider, get_llm_provider

    monkeypatch.setattr(settings, "llm_provider", "mock")
    assert isinstance(get_llm_provider(), MockProvider)

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    assert isinstance(get_llm_provider(), LevelRoutedProvider)


def test_get_llm_provider_still_raises_config_errors_eagerly(monkeypatch):
    from app.ai.errors import AIProviderConfigError
    from app.ai.provider_factory import get_llm_provider

    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    with pytest.raises(AIProviderConfigError):
        get_llm_provider()
