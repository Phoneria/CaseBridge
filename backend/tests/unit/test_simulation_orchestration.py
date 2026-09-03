"""Simulation orchestration (section 13, 22 - Simulation).

Pipeline order: Case Context -> Researcher (case analysis) -> Plaintiff
-> Defendant -> Judge (sees both perspectives, produces the final
structured report). Uses MockProvider only - no network.
"""
import json

VALID_JUDGE_JSON = json.dumps(
    {
        "summary": "Genel degerlendirme.",
        "strong_points": ["Guclu nokta 1"],
        "weak_points": ["Zayif nokta 1"],
        "opposing_arguments": ["Karsi arguman 1"],
        "missing_information": ["Eksik bilgi 1"],
        "possible_scenarios": ["Senaryo 1"],
        "questions": ["Soru 1"],
        "recommended_actions": ["Aksiyon 1"],
        "assessment": {"score": 65, "confidence": "medium"},
    }
)


def test_agents_are_called_in_the_documented_order():
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(
        responses=[
            "RESEARCHER_OUTPUT",
            "PLAINTIFF_OUTPUT",
            "DEFENDANT_OUTPUT",
            VALID_JUDGE_JSON,
        ]
    )

    run_simulation(case_context={"case_name": "Test"}, provider=provider)

    assert len(provider.calls) == 4
    assert "araştırma" in provider.calls[0]["system_prompt"].lower()
    assert "davacı" in provider.calls[1]["system_prompt"].lower()
    assert "davalı" in provider.calls[2]["system_prompt"].lower() or "savunma" in provider.calls[2]["system_prompt"].lower()
    assert "hakim" in provider.calls[3]["system_prompt"].lower() or "tarafsız" in provider.calls[3]["system_prompt"].lower()


def test_judge_step_receives_both_plaintiff_and_defendant_output():
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(
        responses=[
            "RESEARCHER_OUTPUT",
            "PLAINTIFF_ARGUMENT_XYZ",
            "DEFENDANT_ARGUMENT_ABC",
            VALID_JUDGE_JSON,
        ]
    )

    run_simulation(case_context={"case_name": "Test"}, provider=provider)

    judge_call = provider.calls[-1]
    assert "PLAINTIFF_ARGUMENT_XYZ" in judge_call["user_prompt"]
    assert "DEFENDANT_ARGUMENT_ABC" in judge_call["user_prompt"]


def test_defendant_step_receives_plaintiff_argument():
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(
        responses=[
            "RESEARCHER_OUTPUT",
            "PLAINTIFF_ARGUMENT_XYZ",
            "DEFENDANT_OUTPUT",
            VALID_JUDGE_JSON,
        ]
    )

    run_simulation(case_context={"case_name": "Test"}, provider=provider)

    defendant_call = provider.calls[2]
    assert "PLAINTIFF_ARGUMENT_XYZ" in defendant_call["user_prompt"]


def test_simulation_result_is_valid_structured_output():
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(
        responses=["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )

    result = run_simulation(case_context={"case_name": "Test"}, provider=provider)

    assert result.assessment.score == 65
    assert result.assessment.confidence == "medium"
    assert result.ai_disclaimer


def test_invalid_judge_response_raises_validation_error():
    from app.ai.engine import run_simulation
    from app.ai.errors import AIResponseValidationError
    from app.ai.providers.mock_provider import MockProvider
    import pytest

    provider = MockProvider(
        responses=["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", "not valid json"]
    )

    with pytest.raises(AIResponseValidationError):
        run_simulation(case_context={"case_name": "Test"}, provider=provider)


def test_on_stage_callback_reports_each_pipeline_stage_in_order():
    """Phase 3: the simulation job needs stage visibility (research /
    plaintiff / defendant / judge / validation) while the 4-agent
    pipeline is running, for progress reporting - without changing the
    function's return value or requiring a callback."""
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(
        responses=["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )
    stages_seen = []

    run_simulation(
        case_context={"case_name": "Test"}, provider=provider, on_stage=stages_seen.append
    )

    assert stages_seen == ["research", "plaintiff", "defendant", "judge", "validation"]


def test_on_stage_callback_is_optional():
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    provider = MockProvider(
        responses=["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON]
    )
    result = run_simulation(case_context={"case_name": "Test"}, provider=provider)
    assert result.assessment.score == 65
