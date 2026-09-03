"""Structured AI output validation (section 14, 22 - Structured Outputs
and Assessment)."""
import pytest
from pydantic import ValidationError

VALID_PAYLOAD = {
    "summary": "Davaci guclu bir pozisyonda, ancak eksik belge riski var.",
    "strong_points": ["Yazili sozlesme mevcut", "Tanik beyani destekleyici"],
    "weak_points": ["Odeme kanitlari eksik"],
    "opposing_arguments": ["Karsi taraf fesih bildirimini reddediyor"],
    "missing_information": ["Ihtarname tebligat kaydi"],
    "possible_scenarios": ["Kismi kabul", "Tam ret"],
    "questions": ["Ihtarname ne zaman tebligat edildi?"],
    "recommended_actions": ["Tebligat kaydi talep edilmeli"],
    "assessment": {"score": 72, "confidence": "medium"},
}


def test_valid_structured_response_parses():
    from app.ai.schemas import AIAnalysisResult

    result = AIAnalysisResult.model_validate(VALID_PAYLOAD)
    assert result.assessment.score == 72
    assert result.assessment.confidence == "medium"
    assert len(result.strong_points) == 2


def test_structured_response_includes_disclaimer_by_default():
    from app.ai.schemas import AIAnalysisResult

    result = AIAnalysisResult.model_validate(VALID_PAYLOAD)
    assert result.ai_disclaimer
    assert "tahmin" in result.ai_disclaimer.lower() or "estimate" in result.ai_disclaimer.lower() or "ai" in result.ai_disclaimer.lower()


def test_missing_required_field_is_rejected():
    from app.ai.schemas import AIAnalysisResult

    payload = dict(VALID_PAYLOAD)
    del payload["summary"]
    with pytest.raises(ValidationError):
        AIAnalysisResult.model_validate(payload)


def test_score_above_100_is_rejected():
    from app.ai.schemas import AIAnalysisResult

    payload = {**VALID_PAYLOAD, "assessment": {"score": 150, "confidence": "high"}}
    with pytest.raises(ValidationError):
        AIAnalysisResult.model_validate(payload)


def test_score_below_0_is_rejected():
    from app.ai.schemas import AIAnalysisResult

    payload = {**VALID_PAYLOAD, "assessment": {"score": -5, "confidence": "low"}}
    with pytest.raises(ValidationError):
        AIAnalysisResult.model_validate(payload)


def test_invalid_confidence_value_is_rejected():
    from app.ai.schemas import AIAnalysisResult

    payload = {**VALID_PAYLOAD, "assessment": {"score": 50, "confidence": "certain"}}
    with pytest.raises(ValidationError):
        AIAnalysisResult.model_validate(payload)


def test_parse_ai_response_helper_raises_clear_error_on_malformed_json():
    from app.ai.schemas import parse_ai_response
    from app.ai.errors import AIResponseValidationError

    with pytest.raises(AIResponseValidationError):
        parse_ai_response("not valid json {{{")


def test_parse_ai_response_helper_raises_clear_error_on_missing_fields():
    from app.ai.schemas import parse_ai_response
    from app.ai.errors import AIResponseValidationError
    import json

    incomplete = json.dumps({"summary": "only summary, nothing else"})
    with pytest.raises(AIResponseValidationError):
        parse_ai_response(incomplete)


def test_parse_ai_response_helper_succeeds_on_valid_json():
    from app.ai.schemas import parse_ai_response
    import json

    result = parse_ai_response(json.dumps(VALID_PAYLOAD))
    assert result.assessment.score == 72
