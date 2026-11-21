import json
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest

from app.api.deps import get_current_user
from app.core.config import settings
from app.main import app
from app.services import sufle_service as service, voice_service


def payload(mode="live"):
    return {"turns": [{"id": 1, "speaker": "Müvekkil", "text": "Zarfı geçen hafta eşim almış, ben dün gördüm."}],
            "mode": mode, "acknowledged": True}


def advice():
    return {"cards": [{"priority": "important", "category": "deadline", "title": "Tebliğ tarihini doğrulayın",
                       "reason": "Belge teslim tarihi belirsiz.", "question": "Zarf ve resmi kayıt var mı?",
                       "source_id": 1, "source_quote": "Zarfı geçen hafta eşim almış"}],
            "summary": "", "open_questions": [], "documents": []}


@pytest.fixture()
def bureau(client, monkeypatch):
    user = SimpleNamespace(id="user-a", law_firm_id="firm-a", law_firm=SimpleNamespace(is_platform=False))
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr(settings, "chat_provider", "openai")
    return client, user


def provider(monkeypatch, result=None, status=200):
    monkeypatch.setattr(service, "get_openai_api_key", lambda firm: "synthetic-firm-a" if firm == "firm-a" else None)
    body = {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(result or advice())}}], "usage": {"total_tokens": 75}}
    post = Mock(return_value=httpx.Response(status, json=body, request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions")))
    monkeypatch.setattr(service.httpx, "post", post)
    return post


def test_anonymous_cannot_use_sufle(client):
    assert client.get("/sufle/status").status_code == 401
    assert client.post("/sufle/analyze", json=payload()).status_code == 401
    assert client.post("/sufle/transcribe", files={"file": ("a.webm", b"sound", "audio/webm")}, data={"acknowledged": "true"}).status_code == 401


def test_scoped_request_and_grounded_cards(bureau, monkeypatch):
    client, _ = bureau
    post = provider(monkeypatch)
    response = client.post("/sufle/analyze", json=payload())
    assert response.status_code == 200
    assert response.json()["cards"][0]["source_id"] == 1
    assert response.json()["total_tokens"] == 75
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer synthetic-firm-a"
    sent = post.call_args.kwargs["json"]
    assert sent["store"] is False
    assert sent["response_format"]["json_schema"]["strict"] is True
    assert "synthetic-firm-a" not in response.text


def test_other_firm_never_falls_back(bureau, monkeypatch):
    client, user = bureau
    post = provider(monkeypatch)
    user.law_firm_id = "firm-b"
    assert client.get("/sufle/status").json()["configured"] is False
    assert client.post("/sufle/analyze", json=payload()).status_code == 503
    post.assert_not_called()


def test_client_cannot_select_other_firm(bureau, monkeypatch):
    client, _ = bureau
    post = provider(monkeypatch)
    body = {**payload(), "law_firm_id": "firm-b"}
    assert client.post("/sufle/analyze", json=body).status_code == 422
    post.assert_not_called()


def test_platform_cannot_use_shared_key_for_sufle(bureau, monkeypatch):
    client, user = bureau
    post = provider(monkeypatch)
    user.law_firm.is_platform = True
    assert client.get("/sufle/status").status_code == 403
    assert client.post("/sufle/analyze", json=payload()).status_code == 403
    post.assert_not_called()


@pytest.mark.parametrize("mutation", [
    lambda b: b.update(acknowledged=False),
    lambda b: b.update(turns=[]),
    lambda b: b["turns"].append(dict(b["turns"][0])),
    lambda b: b["turns"][0].update(speaker="system"),
    lambda b: b["turns"][0].update(text="x"*6001),
    lambda b: b.update(previous_questions=["x"*401]),
    lambda b: b.update(turns=[{"id": i+1, "speaker": "Müvekkil", "text": "x"*6000} for i in range(14)]),
])
def test_bounded_requests(bureau, monkeypatch, mutation):
    client, _ = bureau
    post = provider(monkeypatch)
    body = payload(); mutation(body)
    assert client.post("/sufle/analyze", json=body).status_code == 422
    post.assert_not_called()


@pytest.mark.parametrize("field,value", [("source_quote", "olmayan alıntı")])
def test_ungrounded_provider_output_is_not_shown(bureau, monkeypatch, field, value):
    client, _ = bureau
    result = advice(); result["cards"][0][field] = value
    provider(monkeypatch, result)
    response = client.post("/sufle/analyze", json=payload())
    assert response.status_code == 503
    assert "olmayan alıntı" not in response.text


def test_closed_question_is_not_repeated(bureau, monkeypatch):
    client, _ = bureau
    provider(monkeypatch)
    body = {**payload(), "previous_questions": [advice()["cards"][0]["question"]]}
    assert client.post("/sufle/analyze", json=body).json()["cards"] == []


def test_finish_returns_summary_not_more_cards(bureau, monkeypatch):
    client, _ = bureau
    result = advice(); result.update(summary="Teslim tarihi doğrulanmadı.", documents=["Zarf"], open_questions=["Teslim günü nedir?"])
    provider(monkeypatch, result)
    response = client.post("/sufle/analyze", json=payload("summary"))
    assert response.status_code == 200
    assert response.json()["cards"] == []
    assert response.json()["summary"]


@pytest.mark.parametrize("status", [401, 429, 500])
def test_provider_errors_are_redacted_and_retryable(bureau, monkeypatch, status):
    client, _ = bureau
    provider(monkeypatch, status=status)
    response = client.post("/sufle/analyze", json=payload())
    assert response.status_code == 503
    assert "synthetic-firm" not in response.text
    assert "choices" not in response.text


def test_truncated_response_is_rejected(bureau, monkeypatch):
    client, _ = bureau
    post = provider(monkeypatch)
    post.return_value.json = lambda: {"choices": [{"finish_reason": "length", "message": {"content": json.dumps(advice())}}]}
    assert client.post("/sufle/analyze", json=payload()).status_code == 503


def test_audio_uses_only_authenticated_bureau(bureau, monkeypatch):
    client, _ = bureau
    provider(monkeypatch)
    transcribe = Mock(return_value="Zarfı dün gördüm.")
    monkeypatch.setattr(voice_service, "transcribe", transcribe)
    response = client.post("/sufle/transcribe", files={"file": ("real-name.webm", b"synthetic-audio", "audio/webm;codecs=opus")}, data={"acknowledged": "true", "law_firm_id": "firm-b"})
    assert response.status_code == 200
    assert transcribe.call_args.kwargs["law_firm_id"] == "firm-a"
    assert transcribe.call_args.args[0] == "sufle.webm"


@pytest.mark.parametrize("mime,content,ack,expected", [("text/plain", b"a", "true", 422), ("audio/webm", b"", "true", 413), ("audio/webm", b"a", "false", 422), ("audio/webm", b"a"*(8*1024*1024+1), "true", 413)])
def test_audio_validation(bureau, monkeypatch, mime, content, ack, expected):
    client, _ = bureau
    provider(monkeypatch)
    transcribe = Mock(); monkeypatch.setattr(voice_service, "transcribe", transcribe)
    response = client.post("/sufle/transcribe", files={"file": ("a.webm", content, mime)}, data={"acknowledged": ack})
    assert response.status_code == expected
    transcribe.assert_not_called()


def test_audio_failure_is_safe(bureau, monkeypatch):
    client, _ = bureau
    provider(monkeypatch)
    monkeypatch.setattr(voice_service, "transcribe", Mock(side_effect=voice_service.VoiceUnavailable("provider internal detail")))
    response = client.post("/sufle/transcribe", files={"file": ("a.webm", b"a", "audio/webm")}, data={"acknowledged": "true"})
    assert response.status_code == 503
    assert "internal detail" not in response.text


def test_request_rate_is_bounded(bureau, monkeypatch):
    client, _ = bureau
    provider(monkeypatch)
    for _ in range(15):
        assert client.post("/sufle/analyze", json=payload()).status_code == 200
    assert client.post("/sufle/analyze", json=payload()).status_code == 429


def test_unique_exact_quote_repairs_wrong_source_id(bureau, monkeypatch):
    client, _ = bureau
    result = advice(); result["cards"][0]["source_id"] = 99
    provider(monkeypatch, result)
    response = client.post("/sufle/analyze", json=payload())
    assert response.status_code == 200
    assert response.json()["cards"][0]["source_id"] == 1


def test_invalid_card_does_not_hide_other_grounded_advice(bureau, monkeypatch):
    client, _ = bureau
    result = advice()
    result["cards"].append({**result["cards"][0], "source_quote": "Bu söz görüşmede bulunmuyor."})
    provider(monkeypatch, result)
    response = client.post("/sufle/analyze", json=payload())
    assert response.status_code == 200
    assert len(response.json()["cards"]) == 1
