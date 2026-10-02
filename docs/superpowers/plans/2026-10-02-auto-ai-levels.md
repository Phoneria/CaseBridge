# Otomatik AI Seviyeleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The system, not the user, picks the AI level. Chat: each question is classified by the cheap (Basit) model into `basic`/`standard`/`deep`. Dosya Analizi and Canlı Duruşma: each LLM call is routed to a level by task type, with `LLM_MODEL_BASIC` / `LLM_MODEL_DEEP` settings.

**Architecture:** Chat keeps the existing level layer (`app/ai/chat/levels.py`: model, cap, history, prompt per level) and gains `app/ai/chat/classifier.py` plus an overridable `get_chat_level_classifier` dependency used by the send route; the request no longer carries `level`. The analysis/courtroom side gains `app/ai/llm_levels.py` (task → level table + `provider_for`) and a `LevelRoutedProvider` built by `get_llm_provider()` for real providers; call sites in `engine.py`, `courtroom.py` and `courtroom_service.py` ask `provider_for(provider, task)`. The frontend drops the picker and stored choice but keeps the "Seviye · model" label.

**Tech Stack:** FastAPI, SQLAlchemy, pydantic-settings, pytest; Next.js 14, React 18, Vitest; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-auto-ai-levels-design.md`

## Global Constraints

- Branch `feature/ai-chat`. One commit per task. Do not push. Commit messages end with a blank line then:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Qix6AqbybRF8KuFJeuthrY`.
- Levels: `basic`, `standard`, `deep`; default/fallback `standard`.
- Chat settings: `CHAT_AUTO_LEVEL` (bool, default `true`), `CHAT_CLASSIFIER_TIMEOUT_SECONDS` (positive float, default `8`). Classifier uses the `basic` level's model with `max_tokens=16`.
- Classifier failure of any kind (provider error, timeout, config error, unparseable reply) → `standard`. Log only the exception type, never content.
- In `CHAT_PROVIDER=mock`, the classifier provider deterministically answers `"standard"`.
- `CHAT_AUTO_LEVEL=false` → the classifier is never called; every question is `standard`.
- Chat request body is `{content}`; a `level` field, if sent, is ignored. `/chat/status` no longer returns `levels`.
- LLM settings: `LLM_MODEL_BASIC`, `LLM_MODEL_DEEP` (default empty). Standard model = `OPENAI_MODEL` / `OLLAMA_MODEL` / `QWEN_MODEL` per `LLM_PROVIDER`. Empty level model → standard model. No token caps on LLM calls.
- Task table (exact): `analysis.research`→standard, `analysis.plaintiff`→standard, `analysis.defendant`→standard, `analysis.judge`→deep, `courtroom.opponent`→standard, `courtroom.judge_interim`→basic, `courtroom.judge_final`→deep, `courtroom.json_repair`→basic.
- `LLM_PROVIDER=mock` behaviour is unchanged (no routing). Existing tests that pass `MockProvider` / `CourtroomMockProvider` directly must keep passing unchanged.
- Frontend keeps the answer label `"<Seviye> · <model>"`; removes the picker, stored level and `level` in the request.

**Environment:** backend `cd backend && source .venv/bin/activate` (full `pytest -q` ~2 min); frontend from `frontend/`: `npx vitest run`, `npx tsc --noEmit`.

---

### Task 1: Chat — automatic level classification

**Files:**
- Create: `backend/app/ai/chat/classifier.py`
- Modify: `backend/app/core/config.py`, `.env.example`, `backend/app/ai/chat/factory.py`, `backend/app/schemas/chat.py`, `backend/app/services/chat_service.py`, `backend/app/api/deps.py`, `backend/app/api/routes/chat.py`
- Test: `backend/tests/unit/test_chat_classifier.py` (new), `backend/tests/api/test_chat.py`, `backend/tests/unit/test_chat_providers.py`

**Interfaces:**
- Produces:
  - `app.ai.chat.classifier`: `CLASSIFIER_MAX_TOKENS = 16`, `CLASSIFIER_SYSTEM_PROMPT: str`, `parse_level(text: str) -> str`, `classify_level(provider, question: str, previous_question: Optional[str] = None) -> str`, `classify_chat_level(question: str, previous_question: Optional[str] = None) -> str`.
  - `get_chat_provider(level="standard", *, max_tokens: Optional[int] = None, timeout_seconds: Optional[float] = None)` (overrides for the classifier); `get_chat_classifier_provider() -> ChatProvider`.
  - `ChatService.last_user_content(conversation) -> Optional[str]`.
  - Dependency `get_chat_level_classifier() -> Callable[[str, Optional[str]], str]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_chat_classifier.py`:

```python
"""Automatic chat level classification."""
import pytest

from app.ai.chat.classifier import (
    CLASSIFIER_MAX_TOKENS,
    CLASSIFIER_SYSTEM_PROMPT,
    classify_chat_level,
    classify_level,
    parse_level,
)
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.errors import AIProviderError, AIProviderTimeoutError
from app.core.config import settings


@pytest.mark.parametrize(
    "text,expected",
    [
        ("basic", "basic"),
        ("  DEEP\n", "deep"),
        ("Standard.", "standard"),
        ("Seviye: deep (çok adımlı analiz)", "deep"),
        ("Basit", "basic"),
        ("KAPSAMLI", "deep"),
        ("BASİT", "basic"),
        ("standart", "standard"),
        ("", "standard"),
        ("bilmiyorum", "standard"),
    ],
)
def test_parse_level(text, expected):
    assert parse_level(text) == expected


def test_classify_level_sends_question_and_previous_question():
    provider = MockChatProvider(chunks=["de", "ep"])
    assert classify_level(provider, "Bu sözleşmeyi TBK ve TTK açısından karşılaştır", "Kira sözleşmesi nedir?") == "deep"
    system, user = provider.calls[-1]
    assert system == {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT}
    assert user["role"] == "user"
    assert "Önceki soru: Kira sözleşmesi nedir?" in user["content"]
    assert "Yeni soru: Bu sözleşmeyi TBK ve TTK açısından karşılaştır" in user["content"]


def test_classify_level_without_previous_question():
    provider = MockChatProvider(chunks=["basic"])
    assert classify_level(provider, "İstinaf süresi kaç gün?") == "basic"
    assert "Önceki soru" not in provider.calls[-1][1]["content"]


@pytest.mark.parametrize("error", [AIProviderError("x"), AIProviderTimeoutError("x"), RuntimeError("x")])
def test_classify_level_falls_back_to_standard_on_errors(error):
    class Failing(MockChatProvider):
        def stream(self, messages):
            raise error
            yield  # pragma: no cover

    assert classify_level(Failing(), "Soru") == "standard"


def test_classify_chat_level_uses_basic_provider_with_small_cap(monkeypatch):
    seen = {}

    def fake_classifier_provider():
        provider = MockChatProvider(chunks=["deep"])
        seen["provider"] = provider
        return provider

    monkeypatch.setattr("app.ai.chat.classifier.get_chat_classifier_provider", fake_classifier_provider)
    assert classify_chat_level("Soru") == "deep"
    assert CLASSIFIER_MAX_TOKENS == 16


def test_classify_chat_level_falls_back_when_provider_misconfigured(monkeypatch):
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    assert classify_chat_level("Soru") == "standard"


def test_mock_classifier_provider_answers_standard(monkeypatch):
    from app.ai.chat.factory import get_chat_classifier_provider

    monkeypatch.setattr(settings, "chat_provider", "mock")
    provider = get_chat_classifier_provider()
    assert "".join(provider.stream([{"role": "user", "content": "basit deep kapsamlı"}])) == "standard"
    assert provider.max_tokens == 16


def test_openai_classifier_provider_uses_basic_model_cap_and_timeout(monkeypatch):
    from app.ai.chat.factory import get_chat_classifier_provider

    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "chat_model", "model-standard")
    monkeypatch.setattr(settings, "chat_model_basic", "model-basic")
    monkeypatch.setattr(settings, "chat_classifier_timeout_seconds", 5)
    provider = get_chat_classifier_provider()
    assert (provider.model, provider.max_tokens, provider._timeout) == ("model-basic", 16, 5)
```

In `backend/tests/api/test_chat.py`:

Change the deps import to `from app.api.deps import get_chat_level_classifier, get_chat_provider_resolver, get_chat_session_factory`.

Replace the `chat_provider` fixture with:

```python
@pytest.fixture()
def chat_provider(client, db_session):
    from app.main import app

    provider = MockChatProvider(model="gpt-test")
    provider.requested_levels = []
    provider.classified_level = "standard"
    provider.classify_calls = []

    def resolve(level):
        provider.requested_levels.append(level)
        return provider

    def classify(question, previous_question=None):
        provider.classify_calls.append((question, previous_question))
        return provider.classified_level

    app.dependency_overrides[get_chat_provider_resolver] = lambda: resolve
    app.dependency_overrides[get_chat_level_classifier] = lambda: classify
    app.dependency_overrides[get_chat_session_factory] = lambda: (lambda: db_session)
    yield provider
    app.dependency_overrides.pop(get_chat_provider_resolver, None)
    app.dependency_overrides.pop(get_chat_level_classifier, None)
    app.dependency_overrides.pop(get_chat_session_factory, None)
```

Replace `_send` with (no `level` parameter):

```python
def _send(client, headers, conversation_id, content):
    with client.stream(
        "POST", f"/chat/conversations/{conversation_id}/messages", json={"content": content}, headers=headers
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())
    return [json.loads(block[len("data: "):]) for block in raw.strip().split("\n\n")]
```

In `test_chat_status_reports_mock_provider`, expect exactly `{"provider": "mock", "model": "mock", "configured": True, "external": False, "error": None}`.

Replace `test_send_defaults_to_standard_level`, `test_basic_level_sends_short_history_and_instruction` and `test_send_rejects_unknown_level` with:

```python
def test_classifier_level_drives_provider_history_and_storage(client, two_firms_two_users, chat_provider, monkeypatch):
    from app.ai.chat.prompt import system_prompt_for
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_history_limit_basic", 2)
    chat_provider.classified_level = "basic"
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    for question in ("Bir", "İki", "Üç"):
        events = _send(client, headers, conversation["id"], question)

    assert chat_provider.classify_calls == [("Bir", None), ("İki", "Bir"), ("Üç", "İki")]
    assert chat_provider.requested_levels == ["basic", "basic", "basic"]
    sent = chat_provider.calls[-1]
    assert sent[0] == {"role": "system", "content": system_prompt_for("basic")}
    assert len(sent) == 3  # system + last 2 messages
    assert events[-1]["message"]["level"] == "basic"


def test_auto_level_off_skips_classifier(client, two_firms_two_users, chat_provider, monkeypatch):
    from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_auto_level", False)
    chat_provider.classified_level = "deep"
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()

    events = _send(client, headers, conversation["id"], "Soru")

    assert chat_provider.classify_calls == []
    assert chat_provider.requested_levels == ["standard"]
    assert chat_provider.calls[-1][0] == {"role": "system", "content": CHAT_SYSTEM_PROMPT}
    assert events[-1]["message"]["level"] == "standard"


def test_level_in_request_body_is_ignored(client, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    with client.stream(
        "POST",
        f"/chat/conversations/{conversation['id']}/messages",
        json={"content": "Soru", "level": "deep"},
        headers=headers,
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    assert chat_provider.requested_levels == ["standard"]
```

In `test_export_uses_each_answers_level_prompt_and_filters_by_level`, replace the two sends with:

```python
    chat_provider.classified_level = "basic"
    basic = _send(client, headers, conversation["id"], "Kısa soru")[-1]["message"]
    chat_provider.classified_level = "deep"
    deep = _send(client, headers, conversation["id"], "Uzun soru")[-1]["message"]
```

Fix any other call that passes `level=` to `_send` the same way (set `chat_provider.classified_level` before the call).

In `backend/tests/unit/test_chat_providers.py`: remove `"levels": [...]` from the expected dict in `test_factory_defaults_to_mock`, and delete `test_status_lists_levels_with_models`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/unit/test_chat_classifier.py tests/api/test_chat.py tests/unit/test_chat_providers.py -q`
Expected: FAIL — `ModuleNotFoundError: app.ai.chat.classifier`, `ImportError: get_chat_level_classifier`.

- [ ] **Step 3: Settings** — in `backend/app/core/config.py` add `PositiveFloat` to the pydantic import and, after `chat_history_limit_basic`:

```python
    # Automatic level selection: each question is first classified by the
    # Basit model. Off -> every question uses Standart.
    chat_auto_level: bool = True
    chat_classifier_timeout_seconds: PositiveFloat = 8
```

In `.env.example`, after `CHAT_HISTORY_LIMIT_BASIC=6`:

```
# The level is chosen automatically: each question is first classified by
# the Basit model (a few hundred tokens). CHAT_AUTO_LEVEL=false sends every
# question at Standart and skips the classification call.
CHAT_AUTO_LEVEL=true
CHAT_CLASSIFIER_TIMEOUT_SECONDS=8
```

- [ ] **Step 4: Factory** — in `backend/app/ai/chat/factory.py`:

Change `get_chat_provider` to accept overrides (body otherwise unchanged; use `cap`/`timeout` in the three constructors):

```python
def get_chat_provider(
    level: str = DEFAULT_CHAT_LEVEL,
    *,
    max_tokens: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
) -> ChatProvider:
    config = get_level_config(level)
    cap = max_tokens if max_tokens is not None else config.max_tokens
    timeout = timeout_seconds if timeout_seconds is not None else settings.chat_timeout_seconds
```

(pass `timeout_seconds=timeout, max_tokens=cap` to `OpenAIChatProvider` and `OllamaChatProvider`, `max_tokens=cap` to `MockChatProvider`; add `from typing import Optional`).

Add:

```python
def get_chat_classifier_provider() -> ChatProvider:
    """The Basit model with a tiny output cap and short timeout, used to pick
    each question's level. Mock mode always answers "standard"."""
    from app.ai.chat.classifier import CLASSIFIER_MAX_TOKENS

    if settings.chat_provider not in ("openai", "ollama"):
        return MockChatProvider(chunks=["standard"], max_tokens=CLASSIFIER_MAX_TOKENS)
    return get_chat_provider(
        "basic",
        max_tokens=CLASSIFIER_MAX_TOKENS,
        timeout_seconds=settings.chat_classifier_timeout_seconds,
    )
```

Remove `_levels()`, the `"levels"` keys from `get_chat_provider_status()`, and the now-unused `CHAT_LEVELS` import.

- [ ] **Step 5: Classifier** — create `backend/app/ai/chat/classifier.py`:

```python
"""Automatic answer-level selection for the Hukuk Asistanı. Each question is
classified by the cheap Basit model; anything that goes wrong falls back to
Standart so the chat never fails because of classification."""
import logging
import re
from typing import Optional

from app.ai.chat.base import ChatProvider
from app.ai.chat.factory import get_chat_classifier_provider
from app.ai.chat.levels import DEFAULT_CHAT_LEVEL

logger = logging.getLogger("casebridge")

CLASSIFIER_MAX_TOKENS = 16

CLASSIFIER_SYSTEM_PROMPT = (
    "Sen bir yönlendiricisin. Kullanıcının hukuki sorusunu yanıtlamak için gereken çabayı belirle ve "
    "YALNIZCA şu kelimelerden birini yaz: basic, standard, deep.\n"
    "- basic: tek bir kavram, tanım, süre, sayı ya da evet/hayır; birkaç cümleyle yanıtlanabilir.\n"
    "- deep: çok adımlı hukuki analiz, birden fazla kanun veya görüşün karşılaştırılması, somut olay "
    "değerlendirmesi, dilekçe veya sözleşme taslağı.\n"
    "- standard: diğer her şey.\n"
    "Soruyu yanıtlama; açıklama yazma."
)

_WORDS = {
    "basic": "basic",
    "basit": "basic",
    "standard": "standard",
    "standart": "standard",
    "deep": "deep",
    "kapsamli": "deep",
    "kapsamlı": "deep",
}


def parse_level(text: str) -> str:
    normalized = text.casefold().replace("i̇", "i")
    for token in re.findall(r"[a-zçğıöşü]+", normalized):
        if token in _WORDS:
            return _WORDS[token]
    return DEFAULT_CHAT_LEVEL


def classify_level(provider: ChatProvider, question: str, previous_question: Optional[str] = None) -> str:
    content = f"Yeni soru: {question[:4000]}"
    if previous_question:
        content = f"Önceki soru: {previous_question[:1000]}\n\n{content}"
    try:
        reply = "".join(
            provider.stream(
                [
                    {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
                    {"role": "user", "content": content},
                ]
            )
        )
    except Exception as exc:  # any failure -> Standart; never log content
        logger.warning("Chat level classification failed (%s)", type(exc).__name__)
        return DEFAULT_CHAT_LEVEL
    return parse_level(reply)


def classify_chat_level(question: str, previous_question: Optional[str] = None) -> str:
    try:
        provider = get_chat_classifier_provider()
    except Exception as exc:
        logger.warning("Chat level classifier unavailable (%s)", type(exc).__name__)
        return DEFAULT_CHAT_LEVEL
    return classify_level(provider, question, previous_question)
```

- [ ] **Step 6: Schemas, service, dependency, route**

`backend/app/schemas/chat.py`: delete `ChatLevelOut`, the `levels` field of `ChatStatusOut`, the `level` field of `ChatMessageCreate`, and the now-unused `ChatLevel` import. (Pydantic ignores unknown body fields, so a sent `level` is ignored.)

`backend/app/services/chat_service.py` — add to `ChatService`:

```python
    def last_user_content(self, conversation: ChatConversation) -> Optional[str]:
        for message in reversed(self.repo.list_messages(conversation.id)):
            if message.role == ChatRole.USER:
                return message.content
        return None
```

`backend/app/api/deps.py` — add (import `Optional` and `classify_chat_level`):

```python
def get_chat_level_classifier() -> Callable[[str, Optional[str]], str]:
    """(question, previous_question) -> level. Overridable in tests."""
    return classify_chat_level
```

`backend/app/api/routes/chat.py` — imports: add `from app.ai.chat.levels import DEFAULT_CHAT_LEVEL, get_level_config` (drop `ChatLevel` only if unused — the export route still uses it), `from app.core.config import settings`, and `get_chat_level_classifier` from deps. In `send_message` add the parameter `classify: Callable[[str, Optional[str]], str] = Depends(get_chat_level_classifier),` and replace the body up to `level_config` with:

```python
    service = ChatService(db)
    conversation = _owned_conversation_or_404(service, conversation_id, current_user)
    level = DEFAULT_CHAT_LEVEL
    if settings.chat_auto_level:
        level = classify(payload.content, service.last_user_content(conversation))
    try:
        provider = resolve_provider(level)
    except AIProviderConfigError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sohbet modeli yapılandırılmamış.")
    level_config = get_level_config(level)
    user_message = service.add_user_message(conversation, payload.content)
    assistant = service.create_assistant_placeholder(conversation, provider.model, level)
    history = service.build_history(conversation, level_config.history_limit, system_prompt_for(level))
```

(the rest of the function is unchanged).

- [ ] **Step 7: Run to verify they pass**

Run: `cd backend && pytest tests/unit/test_chat_classifier.py tests/api/test_chat.py tests/unit/test_chat_providers.py -q && pytest -q`
Expected: all PASS.

- [ ] **Step 8: Commit** — `feat(api): pick the chat answer level automatically with the Basit model`

---

### Task 2: Dosya Analizi and Canlı Duruşma — task-based LLM levels

**Files:**
- Create: `backend/app/ai/llm_levels.py`
- Modify: `backend/app/core/config.py`, `.env.example`, `backend/app/ai/provider_factory.py`, `backend/app/ai/engine.py`, `backend/app/ai/courtroom.py`, `backend/app/services/courtroom_service.py`
- Test: `backend/tests/unit/test_llm_levels.py` (new), `backend/tests/unit/test_simulation_orchestration.py` (append), `backend/tests/api/test_courtroom.py` (append)

**Interfaces:**
- Produces:
  - `app.ai.llm_levels`: `LLMLevel`, `TASK_LEVELS: dict[str, str]`, `level_for_task(task) -> str` (raises `ValueError` for unknown task), `provider_for(provider, task) -> LLMProvider`.
  - `app.ai.provider_factory`: `standard_llm_model() -> str`, `llm_model_for_level(level) -> str`, `build_llm_provider(model: str) -> LLMProvider` (config checks as today), `LevelRoutedProvider`; `get_llm_provider()` returns `LevelRoutedProvider` for qwen/openai/ollama, `MockProvider` for mock.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_llm_levels.py`:

```python
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
```

Append to `backend/tests/unit/test_simulation_orchestration.py`:

```python
class _RecordingRouter:
    """Stands in for LevelRoutedProvider: records the task of every call."""

    def __init__(self, inner):
        self.inner = inner
        self.tasks = []
        self.last_usage = None

    def for_task(self, task):
        self.tasks.append(task)
        return self.inner


def test_each_analysis_stage_asks_for_its_task_level():
    from app.ai.engine import run_simulation
    from app.ai.providers.mock_provider import MockProvider

    router = _RecordingRouter(
        MockProvider(responses=["RESEARCHER_OUTPUT", "PLAINTIFF_OUTPUT", "DEFENDANT_OUTPUT", VALID_JUDGE_JSON])
    )
    run_simulation(case_context={"case_name": "Test"}, provider=router)
    assert router.tasks == ["analysis.research", "analysis.plaintiff", "analysis.defendant", "analysis.judge"]
```

Append to `backend/tests/api/test_courtroom.py` (it already imports `CourtroomMockProvider`, `process_one_pending_courtroom_turn` and defines `_seed_and_pick`, `_headers`):

```python
class _RecordingRouter:
    def __init__(self, inner):
        self.inner = inner
        self.tasks = []
        self.last_usage = None
        self.last_latency_ms = 0.0

    def for_task(self, task):
        self.tasks.append(task)
        return self.inner

    def complete(self, system_prompt, user_prompt, *, response_format=None):
        return self.inner.complete(system_prompt, user_prompt, response_format=response_format)


def test_courtroom_calls_ask_for_their_task_levels(client, two_firms_two_users, db_session):
    scenario = _seed_and_pick(db_session)
    headers = _headers(client, two_firms_two_users)
    created = client.post(
        "/courtroom-sessions",
        headers=headers,
        json={"scenario_id": scenario.id, "chosen_role": "plaintiff"},
    ).json()
    router = _RecordingRouter(CourtroomMockProvider())
    moves = [
        ("opening", "Sayın hâkim, transfer geri ödenmek üzere yapılmıştır.", None),
        ("argument", "Tarafların sonraki yazışmaları borç ilişkisini doğrulamaktadır.", None),
        ("evidence", "Dekonttaki vade ve borç açıklaması taraf iradesini gösterir.", "BORC_DEKONT"),
        ("answer", "Yazılı kayıtlar birbirini tamamlamakta ve zaman çizelgesiyle uyuşmaktadır.", None),
        ("rebuttal", "İş planı imzasız bir taslaktır; borç kayıtlarını ortadan kaldırmaz.", None),
        ("closing", "Kabul edilen dekont ve tutarlı beyanlar uyarınca talebimizin kabulünü isteriz.", None),
    ]
    for index, (action, content, evidence) in enumerate(moves):
        client.post(
            f"/courtroom-sessions/{created['id']}/moves",
            headers=headers,
            json={"action_type": action, "content": content, "evidence_code": evidence, "client_request_id": f"r-{index}"},
        )
        process_one_pending_courtroom_turn(db_session, router)

    assert router.tasks == ["courtroom.opponent", "courtroom.judge_interim"] * 5 + [
        "courtroom.opponent",
        "courtroom.judge_final",
    ]


def test_json_repair_uses_the_repair_task():
    from app.ai.courtroom import OpponentOutput, parse_with_one_repair

    router = _RecordingRouter(CourtroomMockProvider())
    try:
        parse_with_one_repair(router, "bozuk çıktı", OpponentOutput)
    except Exception:
        pass  # the mock may not produce a valid repair; only the routing matters here
    assert router.tasks == ["courtroom.json_repair"]
```

(`OpponentOutput` is defined in `app/ai/courtroom.py`. The courtroom test assumes each processed turn makes exactly one opponent call and one judge call with valid mock JSON; if the observed sequence differs, report it — do not change the production flow to fit the test.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/unit/test_llm_levels.py tests/unit/test_simulation_orchestration.py tests/api/test_courtroom.py -q`
Expected: FAIL — `ModuleNotFoundError: app.ai.llm_levels`; router tests fail (`MockProvider`-only path / no `for_task` calls).

- [ ] **Step 3: Settings** — in `backend/app/core/config.py`, after `ollama_num_ctx`:

```python
    # Task-based model levels for analysis and courtroom (Basit / Standart /
    # Kapsamlı). Standart is the provider's own model (OPENAI_MODEL,
    # OLLAMA_MODEL or QWEN_MODEL); an empty level model falls back to it.
    llm_model_basic: str = ""
    llm_model_deep: str = ""
```

In `.env.example`, after the Ollama block:

```
# Analysis/courtroom levels: Standart = the provider's model above.
# Basit is used for interim judge feedback and JSON repair; Kapsamlı for the
# analysis judge and the final courtroom verdict. Empty -> Standart model.
LLM_MODEL_BASIC=
LLM_MODEL_DEEP=
```

- [ ] **Step 4: Create `backend/app/ai/llm_levels.py`**

```python
"""Task-based levels for the single-turn LLM calls of Dosya Analizi and Canlı
Duruşma. The level of every call is fixed by what the call does; a
LevelRoutedProvider (app.ai.provider_factory) maps the level to a model."""
from typing import Literal

from app.ai.providers.base import LLMProvider

LLMLevel = Literal["basic", "standard", "deep"]

TASK_LEVELS: dict[str, str] = {
    "analysis.research": "standard",
    "analysis.plaintiff": "standard",
    "analysis.defendant": "standard",
    "analysis.judge": "deep",
    "courtroom.opponent": "standard",
    "courtroom.judge_interim": "basic",
    "courtroom.judge_final": "deep",
    "courtroom.json_repair": "basic",
}


def level_for_task(task: str) -> str:
    try:
        return TASK_LEVELS[task]
    except KeyError:
        raise ValueError(f"Unknown LLM task: {task}") from None


def provider_for(provider: LLMProvider, task: str) -> LLMProvider:
    """The provider to use for `task`: a routed provider picks the task's
    level; any other provider (mocks in tests, mock mode) is used as is."""
    level_for_task(task)
    for_task = getattr(provider, "for_task", None)
    return for_task(task) if callable(for_task) else provider
```

- [ ] **Step 5: Routed provider in `backend/app/ai/provider_factory.py`**

Rename the body of today's `get_llm_provider()` that builds qwen/openai/ollama into `build_llm_provider(model: str) -> LLMProvider` — identical config checks and constructor arguments, except `model=model` instead of `settings.qwen_model` / `settings.openai_model` / `settings.ollama_model`. It is only called for real providers.

Add (with `from typing import Callable, Optional` and `from app.ai.llm_levels import level_for_task`):

```python
def standard_llm_model() -> str:
    name = settings.llm_provider
    if name == "qwen":
        return settings.qwen_model
    if name == "openai":
        return settings.openai_model
    if name == "ollama":
        return settings.ollama_model
    return "mock"


def llm_model_for_level(level: str) -> str:
    override = {"basic": settings.llm_model_basic, "deep": settings.llm_model_deep}.get(level, "")
    return (override or "").strip() or standard_llm_model()


class LevelRoutedProvider(LLMProvider):
    """One LLMProvider per configured model; `for_task(task)` returns the one
    for the task's level. Direct `complete()` calls use Standart. Usage and
    latency reflect the most recently used underlying provider."""

    def __init__(self, build: Callable[[str], LLMProvider], model_for_level: Callable[[str], str]):
        self._build = build
        self._model_for_level = model_for_level
        self._providers: dict[str, LLMProvider] = {}
        self._last: Optional[LLMProvider] = None
        self._standard = self._provider_for_level("standard")  # surfaces config errors now

    def _provider_for_level(self, level: str) -> LLMProvider:
        model = self._model_for_level(level)
        if model not in self._providers:
            self._providers[model] = self._build(model)
        return self._providers[model]

    def for_task(self, task: str) -> LLMProvider:
        return _TrackedProvider(self, self._provider_for_level(level_for_task(task)))

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        return _TrackedProvider(self, self._standard).complete(
            system_prompt, user_prompt, response_format=response_format
        )

    @property
    def last_usage(self) -> Optional[dict]:  # type: ignore[override]
        return self._last.last_usage if self._last is not None else None

    @property
    def last_latency_ms(self) -> Optional[float]:  # type: ignore[override]
        return self._last.last_latency_ms if self._last is not None else None


class _TrackedProvider(LLMProvider):
    def __init__(self, router: LevelRoutedProvider, inner: LLMProvider):
        self._router = router
        self._inner = inner

    def complete(self, system_prompt: str, user_prompt: str, *, response_format: Optional[str] = None) -> str:
        self._router._last = self._inner
        return self._inner.complete(system_prompt, user_prompt, response_format=response_format)

    @property
    def last_usage(self) -> Optional[dict]:  # type: ignore[override]
        return self._inner.last_usage

    @property
    def last_latency_ms(self) -> Optional[float]:  # type: ignore[override]
        return self._inner.last_latency_ms
```

and make `get_llm_provider()`:

```python
def get_llm_provider() -> LLMProvider:
    if settings.llm_provider in ("qwen", "openai", "ollama"):
        return LevelRoutedProvider(build=build_llm_provider, model_for_level=llm_model_for_level)
    return MockProvider(default_response=_MOCK_DISABLED_RESPONSE)
```

`get_courtroom_provider()` and `get_ai_provider_status()` keep working unchanged (they call `get_llm_provider()`).

- [ ] **Step 6: Route the call sites**

`backend/app/ai/engine.py` (import `from app.ai.llm_levels import provider_for`): each `provider.complete(` becomes `provider_for(provider, "<task>").complete(` with tasks `analysis.research`, `analysis.plaintiff`, `analysis.defendant`, `analysis.judge` respectively.

`backend/app/ai/courtroom.py`: in `repair_structured_output`, `provider.complete(` → `provider_for(provider, "courtroom.json_repair").complete(`.

`backend/app/services/courtroom_service.py`: opponent call → `provider_for(provider, "courtroom.opponent").complete(...)`; final judge → `"courtroom.judge_final"`; interim judge → `"courtroom.judge_interim"`. Keep passing the original `provider` (not the task-specific one) to `parse_with_one_repair`, so the repair uses its own task.

- [ ] **Step 7: Run to verify they pass**

Run: `cd backend && pytest tests/unit/test_llm_levels.py tests/unit/test_simulation_orchestration.py tests/api/test_courtroom.py tests/unit/test_provider_factory.py -q && pytest -q`
Expected: all PASS (existing provider-factory tests may assert `isinstance(get_llm_provider(), OpenAIProvider)` etc.; update such assertions to check the routed provider's Standart model via `provider.for_task("analysis.research")` or `build_llm_provider`, and note each change in the report).

- [ ] **Step 8: Commit** — `feat(ai): route analysis and courtroom calls to Basit/Standart/Kapsamlı models by task`

---

### Task 3: Frontend — remove the picker, keep the label

**Files:**
- Delete: `frontend/src/components/ai/chat/ChatLevelPicker.tsx`
- Modify: `frontend/src/components/ai/chat/ChatView.tsx`, `frontend/src/lib/chatLevels.ts`, `frontend/src/lib/chatStream.ts`, `frontend/src/lib/api.ts`, `frontend/src/types/index.ts`
- Test: `frontend/src/components/__tests__/ChatView.test.tsx`, `frontend/src/lib/__tests__/chatLevels.test.ts`, `frontend/src/lib/__tests__/chatStream.test.ts`, `tests/e2e/specs/07-ai-chat.spec.ts`

**Interfaces:**
- Keeps: `CHAT_LEVEL_LABELS`, `answerLabel(level, model)` in `lib/chatLevels.ts`; `ChatLevel` type; `ChatMessage.level?`; label rendering in `ChatThread.tsx`.
- Removes: `ChatLevelPicker`, `CHAT_LEVEL_STORAGE_KEY`, `DEFAULT_CHAT_LEVEL`, `CHAT_LEVEL_OPTIONS`, `isChatLevel`, `readStoredChatLevel`, `storeChatLevel`, `ChatLevelInfo`, `ChatStatus.levels`, the `level` option of `streamChatMessage` and parameter of `openChatStream`.

- [ ] **Step 1: Update the tests first**

`frontend/src/components/__tests__/ChatView.test.tsx`: delete the tests "sends the selected level and remembers it", "restores the stored level", "shows each level's model in its hint" and "locks the level while a reply streams"; remove `window.localStorage.clear();` from `beforeEach` only if nothing else needs it; keep "labels answers with their level and model" and "notes answers cut off by the length limit…". Add:

```tsx
  it("has no level picker and sends only the question", async () => {
    streamChatMessage.mockResolvedValue(undefined);
    render(<ChatView />);

    expect(screen.queryByRole("radiogroup", { name: "Yanıt seviyesi" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Mesajınız"), "Selam{Enter}");
    await waitFor(() => expect(streamChatMessage).toHaveBeenCalled());
    expect(streamChatMessage.mock.calls[0][2]).not.toHaveProperty("level");
  });
```

`frontend/src/lib/__tests__/chatLevels.test.ts`: keep only the label test:

```ts
import { describe, expect, it } from "vitest";

import { CHAT_LEVEL_LABELS, answerLabel } from "@/lib/chatLevels";

describe("chat level labels", () => {
  it("labels the three levels in Turkish", () => {
    expect(CHAT_LEVEL_LABELS).toEqual({ basic: "Basit", standard: "Standart", deep: "Kapsamlı" });
  });

  it("builds the answer label from level and model", () => {
    expect(answerLabel("basic", "gpt-4o-mini")).toBe("Basit · gpt-4o-mini");
    expect(answerLabel("deep", null)).toBe("Kapsamlı");
    expect(answerLabel(null, "gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(answerLabel(undefined, null)).toBeNull();
  });
});
```

`frontend/src/lib/__tests__/chatStream.test.ts`: delete "sends the chosen level in the request body" (the existing test already asserts the body is exactly `{ content: "Merhaba" }`).

`tests/e2e/specs/07-ai-chat.spec.ts`: replace the "answer at the Basit level…" test with:

```ts
test("the system picks the answer level and labels the reply", async ({ page }) => {
  await login(page, DEMO_LAWYER);
  await page.goto("/ai/sohbet");

  await expect(page.getByRole("radiogroup", { name: "Yanıt seviyesi" })).toHaveCount(0);
  await page.getByLabel("Mesajınız").fill("İstinaf süresi kaç gündür?");
  await page.getByLabel("Mesajınız").press("Enter");

  await expect(page.getByText("Sorunuz: İstinaf süresi kaç gündür?")).toBeVisible();
  // Mock mode: the classifier always answers "standard".
  await expect(page.getByText("Standart · mock")).toBeVisible();
});
```

- [ ] **Step 2: Run to verify the new frontend test fails**

Run: `cd frontend && npx vitest run src/components/__tests__/ChatView.test.tsx`
Expected: "has no level picker…" FAILS (radiogroup present / `level` sent).

- [ ] **Step 3: Remove the picker and stored level**

- Delete `frontend/src/components/ai/chat/ChatLevelPicker.tsx`.
- `ChatView.tsx`: remove the `ChatLevelPicker` and `@/lib/chatLevels` imports, `ChatLevel` from the type import, the `level` state, the restore effect, `changeLevel`, the `<ChatLevelPicker …/>` element, the `level` argument of `draftMessage` (and its `level` field — drafts get `level: null`), and `level` in the `streamChatMessage` options.
- `lib/chatStream.ts`: options back to `{ signal?: AbortSignal; onEvent: … }`; call `openChatStream(conversationId, content, signal)`; drop the `ChatLevel` import.
- `lib/api.ts`: `openChatStream(conversationId, content, signal?)` with body `JSON.stringify({ content })`; drop the `ChatLevel` import if unused.
- `types/index.ts`: delete `ChatLevelInfo` and `ChatStatus.levels`; keep `ChatLevel` and `ChatMessage.level`.
- `lib/chatLevels.ts`: keep only the module comment (updated: "Labels for the answer level the backend chose automatically."), `CHAT_LEVEL_LABELS` and `answerLabel`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit** — `feat(web): drop the chat level picker; the backend picks the level`

---

### Task 4: Full verification

**Files:** none expected (fix only real problems found).

- [ ] **Step 1: Run everything**

```bash
cd backend && source .venv/bin/activate && pytest -q && cd ..
cd frontend && npx vitest run && npx tsc --noEmit && npm run build && cd ..
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test && cd ../..
```

Expected: all green. If a single E2E spec fails with a login 429, re-run once and report it.

- [ ] **Step 2: Visual check** — screenshot `/ai/sohbet` at 1440px after one answer: no picker above the composer; the answer shows "Standart · mock".

- [ ] **Step 3: Commit** only if a fix was needed (`fix: …`).
