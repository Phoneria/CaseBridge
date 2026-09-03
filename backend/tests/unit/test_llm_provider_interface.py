"""LLM provider abstraction (section 10/27): business logic must depend
only on the LLMProvider interface, never directly on the OpenAI SDK."""


def test_mock_provider_satisfies_llm_provider_interface():
    from app.ai.providers.base import LLMProvider
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(default_response="hello")
    assert isinstance(provider, LLMProvider)


def test_mock_provider_returns_configured_response():
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(default_response="canned answer")
    result = provider.complete(system_prompt="You are a judge.", user_prompt="Evaluate this case.")
    assert result == "canned answer"


def test_mock_provider_records_calls_for_contract_tests():
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(default_response="x")
    provider.complete(system_prompt="SYS_A", user_prompt="USER_A")
    provider.complete(system_prompt="SYS_B", user_prompt="USER_B")

    assert len(provider.calls) == 2
    assert provider.calls[0]["system_prompt"] == "SYS_A"
    assert provider.calls[1]["user_prompt"] == "USER_B"


def test_openai_provider_satisfies_llm_provider_interface():
    from app.ai.providers.base import LLMProvider
    from app.ai.providers.openai_provider import OpenAIProvider

    provider = OpenAIProvider(api_key="sk-fake-for-construction-only", model="gpt-4o-mini")
    assert isinstance(provider, LLMProvider)


# NOTE: provider-factory selection behavior (Mock/OpenAI/Qwen, config
# validation, safe-error status) moved to tests/unit/test_provider_factory.py
# as part of the Phase 1 explicit LLM_PROVIDER migration - see
# IMPLEMENTATION_LOG.md. The two tests previously here asserted the OLD
# implicit "OPENAI_API_KEY present => use OpenAI" behavior, which the
# explicit LLM_PROVIDER contract intentionally supersedes.
