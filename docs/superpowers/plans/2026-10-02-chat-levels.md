# Hukuk Asistanı Yanıt Seviyeleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick an answer level (Basit / Standart / Kapsamlı) per message; the backend maps it to a model, a token cap, a history size and a system-prompt addendum so simple questions cost fewer tokens.

**Architecture:** Levels are defined only in the backend (`app/ai/chat/levels.py`) from settings; the frontend sends just the level name. The chat provider factory builds a provider per level (model + `max_tokens`). The send route resolves the provider through an overridable resolver dependency, stores `level` on the assistant message, and builds history with the level's limit and prompt. The frontend adds a radiogroup above the composer, remembers the choice in `localStorage`, and labels answers "Seviye · model".

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2, Alembic, openai 1.51 (`max_completion_tokens` supported), httpx 0.27, pytest; Next.js 14.2, React 18, TypeScript, Vitest; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-chat-levels-design.md`

## Global Constraints

- Branch: `feature/ai-chat`. One commit per task. Do not push.
- Levels: `basic` → "Basit", `standard` → "Standart", `deep` → "Kapsamlı". Default level `standard`.
- Settings (defaults): `CHAT_MODEL=gpt-4o-mini` (Standart), `CHAT_MODEL_BASIC=""`, `CHAT_MODEL_DEEP=""` (empty → `CHAT_MODEL`), `CHAT_MAX_TOKENS_BASIC=500`, `CHAT_MAX_TOKENS_STANDARD=1500`, `CHAT_MAX_TOKENS_DEEP=4000`, `CHAT_HISTORY_LIMIT_BASIC=6`, `CHAT_HISTORY_LIMIT=20` (Standart and Kapsamlı).
- All levels use the same `CHAT_PROVIDER`. With `CHAT_PROVIDER=mock` every level's model is `"mock"`.
- No model names are hardcoded besides the existing `gpt-4o-mini` default.
- Token cap: OpenAI `max_completion_tokens`; Ollama `options.num_predict`.
- The `standard` level's system prompt is exactly `CHAT_SYSTEM_PROMPT` (unchanged); `basic`/`deep` append an instruction after a blank line.
- Request body `{content, level}`; missing level → `standard`; invalid → 422. A misconfigured provider → 503 with "Sohbet modeli yapılandırılmamış." and nothing saved.
- `chat_messages.level` String(16), nullable; set on assistant messages only.
- Frontend `localStorage` key `casebridge_chat_level`; unreadable/invalid → `standard`; storage errors are swallowed.
- Answer label text: `"<Seviye> · <model>"`; level missing → model only; both missing → nothing.
- All user-facing copy Turkish. No new dependencies.

**Environment:** backend `cd backend && source .venv/bin/activate` (full `pytest -q` ~2 min); frontend from `frontend/`: `npx vitest run <path>`, `npx vitest run`, `npx tsc --noEmit`. Component tests mock `next/navigation` with `vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);`.

---

## File Map

| File | Responsibility |
|---|---|
| `backend/app/core/config.py`, `.env.example` | Level settings |
| `backend/app/ai/chat/levels.py` (new) | Level names, labels, per-level config |
| `backend/app/ai/chat/prompt.py` | `system_prompt_for(level)` |
| `backend/app/ai/chat/base.py`, `openai_provider.py`, `ollama_provider.py`, `mock_provider.py` | `max_tokens` support |
| `backend/app/ai/chat/factory.py` | Provider per level; status `levels` |
| `backend/app/models/chat.py`, `backend/alembic/versions/d7a3c9e1b5f2_add_chat_message_level.py` (new) | `level` column |
| `backend/app/schemas/chat.py`, `services/chat_service.py`, `api/deps.py`, `api/routes/chat.py` | API + history + export |
| `frontend/src/types/index.ts`, `lib/api.ts`, `lib/chatStream.ts`, `lib/chatLevels.ts` (new) | Types, request, storage helpers |
| `frontend/src/components/ai/chat/ChatLevelPicker.tsx` (new), `ChatView.tsx`, `ChatThread.tsx` | UI |
| `tests/e2e/specs/07-ai-chat.spec.ts` | E2E |

---

### Task 1: Level settings, prompts and per-level providers

**Files:**
- Modify: `backend/app/core/config.py`, `.env.example`
- Create: `backend/app/ai/chat/levels.py`
- Modify: `backend/app/ai/chat/prompt.py`, `base.py`, `openai_provider.py`, `ollama_provider.py`, `mock_provider.py`, `factory.py`
- Test: `backend/tests/unit/test_chat_providers.py` (append + update one test)

**Interfaces:**
- Produces:
  - `app.ai.chat.levels`: `ChatLevel` (Literal), `CHAT_LEVELS: tuple[str, ...]` (`("basic","standard","deep")`), `DEFAULT_CHAT_LEVEL = "standard"`, `LEVEL_LABELS: dict[str, str]`, `ChatLevelConfig(level, label, model, max_tokens, history_limit)`, `get_level_config(level="standard") -> ChatLevelConfig` (raises `ValueError` for unknown level).
  - `app.ai.chat.prompt.system_prompt_for(level: Optional[str]) -> str`.
  - Providers accept `max_tokens: Optional[int] = None` (keyword); attribute `max_tokens`.
  - `get_chat_provider(level: str = "standard") -> ChatProvider`; `get_chat_provider_status()` adds `"levels": [{"level", "label", "model"}, ...]` (three entries, in `CHAT_LEVELS` order) in both configured and unconfigured results.

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/unit/test_chat_providers.py`:

```python
from app.ai.chat.levels import CHAT_LEVELS, DEFAULT_CHAT_LEVEL, get_level_config
from app.ai.chat.prompt import system_prompt_for


def _level_settings(monkeypatch, **overrides):
    values = {
        "chat_model": "model-standard",
        "chat_model_basic": "",
        "chat_model_deep": "",
        "chat_max_tokens_basic": 500,
        "chat_max_tokens_standard": 1500,
        "chat_max_tokens_deep": 4000,
        "chat_history_limit_basic": 6,
        "chat_history_limit": 20,
    }
    values.update(overrides)
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)


def test_levels_are_ordered_and_default_to_standard():
    assert CHAT_LEVELS == ("basic", "standard", "deep")
    assert DEFAULT_CHAT_LEVEL == "standard"


def test_empty_level_models_fall_back_to_chat_model(monkeypatch):
    _level_settings(monkeypatch)
    basic = get_level_config("basic")
    standard = get_level_config("standard")
    deep = get_level_config("deep")
    assert (basic.model, standard.model, deep.model) == ("model-standard",) * 3
    assert (basic.label, standard.label, deep.label) == ("Basit", "Standart", "Kapsamlı")
    assert (basic.max_tokens, standard.max_tokens, deep.max_tokens) == (500, 1500, 4000)
    assert (basic.history_limit, standard.history_limit, deep.history_limit) == (6, 20, 20)


def test_level_specific_models_are_used(monkeypatch):
    _level_settings(monkeypatch, chat_model_basic=" model-basic ", chat_model_deep="model-deep")
    assert get_level_config("basic").model == "model-basic"
    assert get_level_config("deep").model == "model-deep"
    assert get_level_config().model == "model-standard"


def test_unknown_level_raises():
    with pytest.raises(ValueError):
        get_level_config("expert")


def test_system_prompt_for_levels():
    assert system_prompt_for("standard") == CHAT_SYSTEM_PROMPT
    assert system_prompt_for(None) == CHAT_SYSTEM_PROMPT
    basic = system_prompt_for("basic")
    deep = system_prompt_for("deep")
    assert basic.startswith(CHAT_SYSTEM_PROMPT + "\n\n") and "kısa ve öz" in basic
    assert deep.startswith(CHAT_SYSTEM_PROMPT + "\n\n") and "adım adım" in deep


def test_openai_passes_max_completion_tokens_only_when_set():
    completions = _FakeCompletions([_openai_chunk("ok")])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    provider = OpenAIChatProvider(api_key="k", model="m", client=client, max_tokens=500)
    assert "".join(provider.stream(MESSAGES)) == "ok"
    assert completions.kwargs["max_completion_tokens"] == 500

    completions = _FakeCompletions([_openai_chunk("ok")])
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    list(OpenAIChatProvider(api_key="k", model="m", client=client).stream(MESSAGES))
    assert "max_completion_tokens" not in completions.kwargs


def test_ollama_passes_num_predict_only_when_set():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=json.dumps({"message": {"content": "ok"}, "done": True}) + "\n")

    list(OllamaChatProvider(base_url="http://ollama.test", model="m", transport=httpx.MockTransport(handler), max_tokens=300).stream(MESSAGES))
    list(OllamaChatProvider(base_url="http://ollama.test", model="m", transport=httpx.MockTransport(handler)).stream(MESSAGES))
    assert seen[0]["options"] == {"num_predict": 300}
    assert "options" not in seen[1]


def test_factory_builds_a_provider_per_level(monkeypatch):
    _level_settings(monkeypatch, chat_model_basic="model-basic")
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    basic = get_chat_provider("basic")
    assert (basic.model, basic.max_tokens) == ("model-basic", 500)
    standard = get_chat_provider()
    assert (standard.model, standard.max_tokens) == ("model-standard", 1500)

    monkeypatch.setattr(settings, "chat_provider", "mock")
    mock = get_chat_provider("deep")
    assert isinstance(mock, MockChatProvider)
    assert (mock.model, mock.max_tokens) == ("mock", 4000)


def test_status_lists_levels_with_models(monkeypatch):
    _level_settings(monkeypatch, chat_model_deep="model-deep")
    monkeypatch.setattr(settings, "chat_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    status = get_chat_provider_status()
    assert status["configured"] is False
    assert status["levels"] == [
        {"level": "basic", "label": "Basit", "model": "model-standard"},
        {"level": "standard", "label": "Standart", "model": "model-standard"},
        {"level": "deep", "label": "Kapsamlı", "model": "model-deep"},
    ]
```

In the existing `test_factory_defaults_to_mock`, replace the expected dict with:

```python
    assert get_chat_provider_status() == {
        "provider": "mock",
        "model": "mock",
        "configured": True,
        "external": False,
        "error": None,
        "levels": [
            {"level": "basic", "label": "Basit", "model": "mock"},
            {"level": "standard", "label": "Standart", "model": "mock"},
            {"level": "deep", "label": "Kapsamlı", "model": "mock"},
        ],
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/unit/test_chat_providers.py -q`
Expected: FAIL — `ModuleNotFoundError: app.ai.chat.levels` (collection error).

- [ ] **Step 3: Add the settings** — in `backend/app/core/config.py`, after `chat_history_limit: int = 20`:

```python
    # Answer levels (Basit / Standart / Kapsamlı). CHAT_MODEL is the Standart
    # model; an empty level model falls back to CHAT_MODEL.
    chat_model_basic: str = ""
    chat_model_deep: str = ""
    chat_max_tokens_basic: int = 500
    chat_max_tokens_standard: int = 1500
    chat_max_tokens_deep: int = 4000
    chat_history_limit_basic: int = 6
```

In `.env.example`, after `CHAT_HISTORY_LIMIT=20`:

```
# Answer levels: CHAT_MODEL is the "Standart" model. Empty level models
# fall back to CHAT_MODEL. Basit also sends less history and asks for a
# short answer; Kapsamlı asks for a detailed one.
CHAT_MODEL_BASIC=
CHAT_MODEL_DEEP=
CHAT_MAX_TOKENS_BASIC=500
CHAT_MAX_TOKENS_STANDARD=1500
CHAT_MAX_TOKENS_DEEP=4000
CHAT_HISTORY_LIMIT_BASIC=6
```

- [ ] **Step 4: Create `backend/app/ai/chat/levels.py`**

```python
"""Answer levels for the Hukuk Asistanı. The user picks a level per message;
the backend maps it to a model, a token cap and a history size. The frontend
only ever sends the level name, never a model name."""
from dataclasses import dataclass
from typing import Literal, get_args

from app.core.config import settings

ChatLevel = Literal["basic", "standard", "deep"]
CHAT_LEVELS: tuple[str, ...] = get_args(ChatLevel)
DEFAULT_CHAT_LEVEL: ChatLevel = "standard"
LEVEL_LABELS: dict[str, str] = {"basic": "Basit", "standard": "Standart", "deep": "Kapsamlı"}


@dataclass(frozen=True)
class ChatLevelConfig:
    level: str
    label: str
    model: str
    max_tokens: int
    history_limit: int


def get_level_config(level: str = DEFAULT_CHAT_LEVEL) -> ChatLevelConfig:
    if level not in CHAT_LEVELS:
        raise ValueError(f"Unknown chat level: {level}")
    if level == "basic":
        model, max_tokens, history_limit = (
            settings.chat_model_basic,
            settings.chat_max_tokens_basic,
            settings.chat_history_limit_basic,
        )
    elif level == "deep":
        model, max_tokens, history_limit = (
            settings.chat_model_deep,
            settings.chat_max_tokens_deep,
            settings.chat_history_limit,
        )
    else:
        model, max_tokens, history_limit = (
            settings.chat_model,
            settings.chat_max_tokens_standard,
            settings.chat_history_limit,
        )
    return ChatLevelConfig(
        level=level,
        label=LEVEL_LABELS[level],
        model=(model or "").strip() or settings.chat_model,
        max_tokens=max_tokens,
        history_limit=history_limit,
    )
```

- [ ] **Step 5: Add the level prompts** — append to `backend/app/ai/chat/prompt.py` (add `from typing import Optional` at the top):

```python
LEVEL_INSTRUCTIONS: dict[str, str] = {
    "basic": (
        "Bu soru için kısa ve öz yanıt ver: en fazla 3-5 cümle yaz; giriş, tekrar ve uzun açıklama yapma."
    ),
    "standard": "",
    "deep": (
        "Bu soru için kapsamlı yanıt ver: konuyu adım adım ele al, ilgili mevzuatı ve yerleşik içtihadı "
        "açıkla, olası karşı görüşleri ve uygulamada dikkat edilmesi gereken noktaları belirt."
    ),
}


def system_prompt_for(level: Optional[str]) -> str:
    """CHAT_SYSTEM_PROMPT plus the level's instruction. Standart (and messages
    saved before levels existed, level=None) use the base prompt unchanged."""
    extra = LEVEL_INSTRUCTIONS.get(level or "standard", "")
    return f"{CHAT_SYSTEM_PROMPT}\n\n{extra}" if extra else CHAT_SYSTEM_PROMPT
```

- [ ] **Step 6: Add `max_tokens` to the providers**

`backend/app/ai/chat/base.py` — in `ChatProvider`, after `external: bool = True`:

```python
    #: Upper bound on reply tokens for this provider instance (None = provider default).
    max_tokens: Optional[int] = None
```

`backend/app/ai/chat/openai_provider.py` — constructor and request:

```python
    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float = 60.0,
        client: Optional[Any] = None,
        max_tokens: Optional[int] = None,
    ):
        self.model = model
        self._api_key = api_key
        self._timeout = timeout_seconds
        self._client = client
        self.max_tokens = max_tokens
        self.last_usage = None
```

and replace the `create(...)` call with:

```python
            limits = {"max_completion_tokens": self.max_tokens} if self.max_tokens else {}
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
                **limits,
            )
```

`backend/app/ai/chat/ollama_provider.py` — constructor gains `max_tokens: Optional[int] = None` (last parameter) with `self.max_tokens = max_tokens`; after building `payload` add:

```python
        if self.max_tokens:
            payload["options"] = {"num_predict": self.max_tokens}
```

`backend/app/ai/chat/mock_provider.py` — constructor:

```python
    def __init__(
        self,
        model: str = "mock",
        chunks: Optional[list[str]] = None,
        fail_after: Optional[int] = None,
        max_tokens: Optional[int] = None,
    ):
        self.model = model
        self._chunks = chunks
        self._fail_after = fail_after
        self.max_tokens = max_tokens
        self.calls: list[list[ChatTurn]] = []
        self.last_usage = None
```

- [ ] **Step 7: Build providers per level** — replace `backend/app/ai/chat/factory.py` body (keep the module docstring):

```python
from app.ai.chat.base import ChatProvider
from app.ai.chat.levels import CHAT_LEVELS, DEFAULT_CHAT_LEVEL, get_level_config
from app.ai.chat.mock_provider import MockChatProvider
from app.ai.chat.ollama_provider import OllamaChatProvider
from app.ai.chat.openai_provider import OpenAIChatProvider
from app.ai.errors import AIProviderConfigError
from app.core.config import settings


def get_chat_provider(level: str = DEFAULT_CHAT_LEVEL) -> ChatProvider:
    config = get_level_config(level)
    name = settings.chat_provider
    if name == "openai":
        if not settings.openai_api_key or not settings.openai_api_key.strip():
            raise AIProviderConfigError(
                "CHAT_PROVIDER=openai but OPENAI_API_KEY is not set. "
                "Set OPENAI_API_KEY, or set CHAT_PROVIDER=mock to run without a real AI provider."
            )
        return OpenAIChatProvider(
            api_key=settings.openai_api_key,
            model=config.model,
            timeout_seconds=settings.chat_timeout_seconds,
            max_tokens=config.max_tokens,
        )
    if name == "ollama":
        if not settings.ollama_base_url or not settings.ollama_base_url.strip():
            raise AIProviderConfigError("CHAT_PROVIDER=ollama but OLLAMA_BASE_URL is not set.")
        return OllamaChatProvider(
            base_url=settings.ollama_base_url,
            model=config.model,
            timeout_seconds=settings.chat_timeout_seconds,
            max_tokens=config.max_tokens,
        )
    return MockChatProvider(max_tokens=config.max_tokens)


def _levels() -> list[dict]:
    mock = settings.chat_provider not in ("openai", "ollama")
    result = []
    for level in CHAT_LEVELS:
        config = get_level_config(level)
        result.append({"level": level, "label": config.label, "model": "mock" if mock else config.model})
    return result


def get_chat_provider_status() -> dict:
    """Safe, user-facing status (no secrets). Never raises."""
    external = settings.chat_provider == "openai"
    try:
        provider = get_chat_provider()
    except AIProviderConfigError as exc:
        return {
            "provider": settings.chat_provider,
            "model": settings.chat_model,
            "configured": False,
            "external": external,
            "error": str(exc),
            "levels": _levels(),
        }
    return {
        "provider": provider.provider,
        "model": provider.model,
        "configured": True,
        "external": provider.external,
        "error": None,
        "levels": _levels(),
    }
```

- [ ] **Step 8: Run to verify they pass**

Run: `cd backend && pytest tests/unit/test_chat_providers.py -q && pytest -q`
Expected: all PASS (the `/chat/status` API test still passes: the route's `ChatStatusOut` drops `levels` until Task 2).

- [ ] **Step 9: Commit**

```bash
git add backend/app/core/config.py .env.example backend/app/ai/chat backend/tests/unit/test_chat_providers.py
git commit -m "feat(api): chat answer levels with per-level model, token cap and prompt"
```

---

### Task 2: Level on messages, send route, history and export

**Files:**
- Modify: `backend/app/models/chat.py`
- Create: `backend/alembic/versions/d7a3c9e1b5f2_add_chat_message_level.py`
- Modify: `backend/app/schemas/chat.py`, `backend/app/services/chat_service.py`, `backend/app/api/deps.py`, `backend/app/api/routes/chat.py`
- Test: `backend/tests/api/test_chat.py`

**Interfaces:**
- Consumes: Task 1 (`ChatLevel`, `get_level_config`, `system_prompt_for`, `get_chat_provider(level)`, status `levels`).
- Produces:
  - `ChatMessage.level: Optional[str]`; `ChatMessageOut.level: Optional[str]`.
  - `ChatMessageCreate.level: ChatLevel = "standard"`.
  - `ChatLevelOut(level, label, model)`; `ChatStatusOut.levels: list[ChatLevelOut] = []`.
  - `ChatService.create_assistant_placeholder(conversation, model, level=None)`, `build_history(conversation, limit, system_prompt=CHAT_SYSTEM_PROMPT)`, `export_jsonl(law_firm_id, model=None, level=None)`.
  - Dependency `get_chat_provider_resolver() -> Callable[[str], ChatProvider]` (replaces `get_chat_provider_dep`).
  - `GET /chat/export.jsonl?level=` (`basic|standard|deep`; `standard` also matches messages with no level).

- [ ] **Step 1: Write the failing tests** — in `backend/tests/api/test_chat.py`:

Change the import `from app.api.deps import get_chat_provider_dep, get_chat_session_factory` to:

```python
from app.api.deps import get_chat_provider_resolver, get_chat_session_factory
```

Replace the `chat_provider` fixture with:

```python
@pytest.fixture()
def chat_provider(client, db_session):
    from app.main import app

    provider = MockChatProvider(model="gpt-test")
    provider.requested_levels = []

    def resolve(level):
        provider.requested_levels.append(level)
        return provider

    app.dependency_overrides[get_chat_provider_resolver] = lambda: resolve
    app.dependency_overrides[get_chat_session_factory] = lambda: (lambda: db_session)
    yield provider
    app.dependency_overrides.pop(get_chat_provider_resolver, None)
    app.dependency_overrides.pop(get_chat_session_factory, None)
```

Replace `_send` with:

```python
def _send(client, headers, conversation_id, content, level=None):
    body = {"content": content} if level is None else {"content": content, "level": level}
    with client.stream(
        "POST", f"/chat/conversations/{conversation_id}/messages", json=body, headers=headers
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())
    return [json.loads(block[len("data: "):]) for block in raw.strip().split("\n\n")]
```

Replace `test_chat_status_reports_mock_provider`'s assertion with:

```python
    assert body == {
        "provider": "mock",
        "model": "mock",
        "configured": True,
        "external": False,
        "error": None,
        "levels": [
            {"level": "basic", "label": "Basit", "model": "mock"},
            {"level": "standard", "label": "Standart", "model": "mock"},
            {"level": "deep", "label": "Kapsamlı", "model": "mock"},
        ],
    }
```

Append:

```python
def test_send_defaults_to_standard_level(client, two_firms_two_users, chat_provider):
    from app.ai.chat.prompt import CHAT_SYSTEM_PROMPT

    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()

    events = _send(client, headers, conversation["id"], "Soru")

    assert chat_provider.requested_levels == ["standard"]
    assert chat_provider.calls[-1][0] == {"role": "system", "content": CHAT_SYSTEM_PROMPT}
    assert events[-1]["message"]["level"] == "standard"
    assert events[-1]["message"]["model"] == "gpt-test"


def test_basic_level_sends_short_history_and_instruction(client, two_firms_two_users, chat_provider, monkeypatch):
    from app.ai.chat.prompt import system_prompt_for
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_history_limit_basic", 2)
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    for question in ("Bir", "İki", "Üç"):
        events = _send(client, headers, conversation["id"], question, level="basic")

    sent = chat_provider.calls[-1]
    assert sent[0] == {"role": "system", "content": system_prompt_for("basic")}
    assert len(sent) == 3  # system + last 2 messages
    assert sent[-1]["content"] == "Üç"
    assert chat_provider.requested_levels == ["basic", "basic", "basic"]
    assert events[-1]["message"]["level"] == "basic"
    stored = client.get(f"/chat/conversations/{conversation['id']}", headers=headers).json()["messages"]
    assert [m["level"] for m in stored if m["role"] == "assistant"] == ["basic", "basic", "basic"]
    assert all(m["level"] is None for m in stored if m["role"] == "user")


def test_send_rejects_unknown_level(client, two_firms_two_users, chat_provider):
    headers = _headers(client, two_firms_two_users)
    conversation = client.post("/chat/conversations", headers=headers).json()
    response = client.post(
        f"/chat/conversations/{conversation['id']}/messages",
        json={"content": "Soru", "level": "expert"},
        headers=headers,
    )
    assert response.status_code == 422
    assert chat_provider.requested_levels == []


def test_export_uses_each_answers_level_prompt_and_filters_by_level(client, two_firms_two_users, chat_provider, db_session):
    from app.ai.chat.prompt import system_prompt_for

    fixtures = two_firms_two_users
    _make_admin(db_session, fixtures)
    headers = _headers(client, fixtures)
    conversation = client.post("/chat/conversations", headers=headers).json()
    basic = _send(client, headers, conversation["id"], "Kısa soru", level="basic")[-1]["message"]
    deep = _send(client, headers, conversation["id"], "Uzun soru", level="deep")[-1]["message"]
    for answer in (basic, deep):
        client.put(f"/chat/messages/{answer['id']}/feedback", json={"value": 1}, headers=headers)

    lines = [json.loads(line) for line in client.get("/chat/export.jsonl", headers=headers).text.splitlines()]
    assert [line["messages"][0]["content"] for line in lines] == [system_prompt_for("basic"), system_prompt_for("deep")]

    deep_only = client.get("/chat/export.jsonl?level=deep", headers=headers).text.splitlines()
    assert len(deep_only) == 1
    assert json.loads(deep_only[0])["messages"][-1]["content"] == deep["content"]
    assert client.get("/chat/export.jsonl?level=standard", headers=headers).text == ""
    assert client.get("/chat/export.jsonl?level=expert", headers=headers).status_code == 422
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/api/test_chat.py -q`
Expected: FAIL — `ImportError: cannot import name 'get_chat_provider_resolver'`.

- [ ] **Step 3: Add the column and migration**

In `backend/app/models/chat.py`, in `ChatMessage` after `model`:

```python
    level: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
```

Create `backend/alembic/versions/d7a3c9e1b5f2_add_chat_message_level.py`:

```python
"""add answer level to chat messages

Revision ID: d7a3c9e1b5f2
Revises: c4d1a7e9f2b3
Create Date: 2026-10-02 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7a3c9e1b5f2"
down_revision: Union[str, Sequence[str], None] = "c4d1a7e9f2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.add_column(sa.Column("level", sa.String(length=16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.drop_column("level")
```

- [ ] **Step 4: Update the schemas** — in `backend/app/schemas/chat.py` add `from app.ai.chat.levels import ChatLevel` and:

```python
class ChatLevelOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    level: str
    label: str
    model: str
```

(defined above `ChatStatusOut`), add `levels: list[ChatLevelOut] = []` to `ChatStatusOut`, add `level: Optional[str] = None` to `ChatMessageOut` (after `model`), and add to `ChatMessageCreate` (after `content`):

```python
    level: ChatLevel = "standard"
```

- [ ] **Step 5: Update the service** — in `backend/app/services/chat_service.py`:

Add `from app.ai.chat.prompt import system_prompt_for` (keep the `CHAT_SYSTEM_PROMPT` import).

```python
    def create_assistant_placeholder(
        self, conversation: ChatConversation, model: str, level: Optional[str] = None
    ) -> ChatMessage:
        message = ChatMessage(
            conversation_id=conversation.id,
            law_firm_id=conversation.law_firm_id,
            role=ChatRole.ASSISTANT,
            content="",
            status=ChatMessageStatus.STREAMING,
            model=model,
            level=level,
        )
        self.repo.save(message)
        return message

    def build_history(
        self, conversation: ChatConversation, limit: int, system_prompt: str = CHAT_SYSTEM_PROMPT
    ) -> list[ChatTurn]:
        usable = [
            m
            for m in self.repo.list_messages(conversation.id)
            if m.role == ChatRole.USER or m.status == ChatMessageStatus.COMPLETE
        ]
        recent = usable[-limit:] if limit > 0 else usable
        return [{"role": "system", "content": system_prompt}] + [
            {"role": m.role.value, "content": m.content} for m in recent
        ]
```

In `export_jsonl`: change the signature to `def export_jsonl(self, law_firm_id: str, model: Optional[str] = None, level: Optional[str] = None) -> str:`; after the `if model:` filter add:

```python
        if level == "standard":
            query = query.filter(or_(ChatMessage.level == "standard", ChatMessage.level.is_(None)))
        elif level:
            query = query.filter(ChatMessage.level == level)
```

(add `from sqlalchemy import or_`), and replace `turns = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]` with:

```python
            turns = [{"role": "system", "content": system_prompt_for(target.level)}]
```

- [ ] **Step 6: Replace the provider dependency** — in `backend/app/api/deps.py` replace `get_chat_provider_dep` with:

```python
def get_chat_provider_resolver() -> Callable[[str], ChatProvider]:
    """Returns level -> configured chat provider (raises AIProviderConfigError
    when misconfigured). Overridable in tests."""
    return get_chat_provider
```

(`AIProviderConfigError` import is no longer used in deps.py if nothing else uses it — remove it only if unused.)

- [ ] **Step 7: Update the routes** — in `backend/app/api/routes/chat.py`:

Imports: replace `get_chat_provider_dep` with `get_chat_provider_resolver`; add `from app.ai.chat.levels import ChatLevel, get_level_config`, `from app.ai.chat.prompt import system_prompt_for`, `from app.ai.errors import AIProviderConfigError`; remove `from app.core.config import settings` if unused afterwards.

Replace `send_message` with:

```python
@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: str,
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    resolve_provider: Callable[[str], ChatProvider] = Depends(get_chat_provider_resolver),
    session_factory: Callable[[], Session] = Depends(get_chat_session_factory),
):
    service = ChatService(db)
    conversation = _owned_conversation_or_404(service, conversation_id, current_user)
    try:
        provider = resolve_provider(payload.level)
    except AIProviderConfigError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sohbet modeli yapılandırılmamış.")
    level_config = get_level_config(payload.level)
    user_message = service.add_user_message(conversation, payload.content)
    assistant = service.create_assistant_placeholder(conversation, provider.model, payload.level)
    history = service.build_history(conversation, level_config.history_limit, system_prompt_for(payload.level))
    start_event = {
        "type": "start",
        "user_message": ChatMessageOut.model_validate(user_message).model_dump(mode="json"),
        "assistant_message_id": assistant.id,
    }
    return StreamingResponse(
        stream_assistant_reply(
            provider=provider,
            history=history,
            start_event=start_event,
            assistant_message_id=assistant.id,
            conversation_id=conversation.id,
            session_factory=session_factory,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

In `export_training_data` add the query parameter `level: Optional[ChatLevel] = None` (after `model`) and pass it: `ChatService(db).export_jsonl(current_user.law_firm_id, model, level)`.

- [ ] **Step 8: Run to verify they pass, check the migration**

Run:

```bash
cd backend && pytest tests/api/test_chat.py -q && pytest -q
rm -f /tmp/chat-mig.db && DATABASE_URL=sqlite:////tmp/chat-mig.db JWT_SECRET=x alembic upgrade head && DATABASE_URL=sqlite:////tmp/chat-mig.db JWT_SECRET=x alembic downgrade -1 && DATABASE_URL=sqlite:////tmp/chat-mig.db JWT_SECRET=x alembic upgrade head && rm -f /tmp/chat-mig.db
```

Expected: all tests PASS (the existing 503 test still passes: misconfiguration now surfaces from the resolver); the three alembic commands finish without errors.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/chat.py backend/alembic/versions/d7a3c9e1b5f2_add_chat_message_level.py backend/app/schemas/chat.py backend/app/services/chat_service.py backend/app/api/deps.py backend/app/api/routes/chat.py backend/tests/api/test_chat.py
git commit -m "feat(api): send chat messages at a chosen level; store and export it"
```

---

### Task 3: Frontend level types, request and storage helpers

**Files:**
- Modify: `frontend/src/types/index.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/chatStream.ts`
- Create: `frontend/src/lib/chatLevels.ts`
- Test: `frontend/src/lib/__tests__/chatLevels.test.ts` (new), `frontend/src/lib/__tests__/chatStream.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 API (`level` in body, `ChatMessageOut.level`, status `levels`).
- Produces:
  - Types: `ChatLevel = "basic" | "standard" | "deep"`, `ChatLevelInfo { level: ChatLevel; label: string; model: string }`, `ChatStatus.levels?: ChatLevelInfo[]`, `ChatMessage.level?: ChatLevel | null`.
  - `openChatStream(conversationId, content, signal?, level?)`; `streamChatMessage(conversationId, content, { level?, signal?, onEvent })`.
  - `lib/chatLevels.ts`: `CHAT_LEVEL_STORAGE_KEY`, `DEFAULT_CHAT_LEVEL`, `CHAT_LEVEL_OPTIONS: { level, label, hint }[]`, `CHAT_LEVEL_LABELS`, `isChatLevel(value)`, `readStoredChatLevel()`, `storeChatLevel(level)`, `answerLabel(level, model): string | null`.

- [ ] **Step 1: Write the failing tests** — create `frontend/src/lib/__tests__/chatLevels.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_LEVEL_OPTIONS,
  CHAT_LEVEL_STORAGE_KEY,
  DEFAULT_CHAT_LEVEL,
  answerLabel,
  isChatLevel,
  readStoredChatLevel,
  storeChatLevel,
} from "@/lib/chatLevels";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("chat levels", () => {
  it("lists the three levels in order with Turkish labels", () => {
    expect(CHAT_LEVEL_OPTIONS.map((option) => [option.level, option.label])).toEqual([
      ["basic", "Basit"],
      ["standard", "Standart"],
      ["deep", "Kapsamlı"],
    ]);
    expect(DEFAULT_CHAT_LEVEL).toBe("standard");
  });

  it("validates level names", () => {
    expect(isChatLevel("basic")).toBe(true);
    expect(isChatLevel("expert")).toBe(false);
    expect(isChatLevel(null)).toBe(false);
  });

  it("stores and restores the chosen level", () => {
    expect(readStoredChatLevel()).toBe("standard");
    storeChatLevel("deep");
    expect(window.localStorage.getItem(CHAT_LEVEL_STORAGE_KEY)).toBe("deep");
    expect(readStoredChatLevel()).toBe("deep");
  });

  it("falls back to standard for invalid or unreadable storage", () => {
    window.localStorage.setItem(CHAT_LEVEL_STORAGE_KEY, "expert");
    expect(readStoredChatLevel()).toBe("standard");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredChatLevel()).toBe("standard");
    expect(() => storeChatLevel("basic")).not.toThrow();
  });

  it("builds the answer label from level and model", () => {
    expect(answerLabel("basic", "gpt-4o-mini")).toBe("Basit · gpt-4o-mini");
    expect(answerLabel(null, "gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(answerLabel(undefined, null)).toBeNull();
  });
});
```

Append to `frontend/src/lib/__tests__/chatStream.test.ts` (inside `describe("streamChatMessage", ...)`):

```ts
  it("sends the chosen level in the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: bodyFrom([]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await streamChatMessage("c1", "Merhaba", { level: "basic", onEvent: () => {} });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "Merhaba", level: "basic" });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/chatLevels.test.ts src/lib/__tests__/chatStream.test.ts`
Expected: FAIL — `@/lib/chatLevels` cannot be resolved; body lacks `level`.

- [ ] **Step 3: Add the types** — in `frontend/src/types/index.ts`, in the chat section:

```ts
export type ChatLevel = "basic" | "standard" | "deep";

export interface ChatLevelInfo {
  level: ChatLevel;
  label: string;
  model: string;
}
```

add `levels?: ChatLevelInfo[];` to `ChatStatus` (after `error`) and `level?: ChatLevel | null;` to `ChatMessage` (after `model`).

- [ ] **Step 4: Send the level** — in `frontend/src/lib/api.ts` (add `ChatLevel` to the type import):

```ts
export async function openChatStream(
  conversationId: string,
  content: string,
  signal?: AbortSignal,
  level?: ChatLevel,
): Promise<Response> {
  const token = getToken();
  const headers = new Headers({ "Content-Type": "application/json", Accept: "text/event-stream" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, level }),
    signal,
  });
  if (!response.ok) await throwApiError(response);
  return response;
}
```

In `frontend/src/lib/chatStream.ts` (add `ChatLevel` to the type import):

```ts
export async function streamChatMessage(
  conversationId: string,
  content: string,
  { level, signal, onEvent }: { level?: ChatLevel; signal?: AbortSignal; onEvent: (event: ChatStreamEvent) => void },
): Promise<void> {
  const response = await openChatStream(conversationId, content, signal, level);
```

(rest of the function unchanged). `JSON.stringify` drops `level: undefined`, so the existing body assertion `{ content: "Merhaba" }` still holds.

- [ ] **Step 5: Create `frontend/src/lib/chatLevels.ts`**

```ts
/** Answer levels for the Hukuk Asistanı. The backend maps each level to a
 * model, a token cap and a history size; the frontend only sends the name. */
import type { ChatLevel } from "@/types";

export const CHAT_LEVEL_STORAGE_KEY = "casebridge_chat_level";
export const DEFAULT_CHAT_LEVEL: ChatLevel = "standard";

export const CHAT_LEVEL_OPTIONS: { level: ChatLevel; label: string; hint: string }[] = [
  { level: "basic", label: "Basit", hint: "Kısa tanım, süre ve “nedir?” soruları" },
  { level: "standard", label: "Standart", hint: "Çoğu soru için" },
  { level: "deep", label: "Kapsamlı", hint: "Çok adımlı analiz ve mevzuat karşılaştırması" },
];

export const CHAT_LEVEL_LABELS: Record<ChatLevel, string> = {
  basic: "Basit",
  standard: "Standart",
  deep: "Kapsamlı",
};

export function isChatLevel(value: unknown): value is ChatLevel {
  return value === "basic" || value === "standard" || value === "deep";
}

export function readStoredChatLevel(): ChatLevel {
  try {
    const value = window.localStorage.getItem(CHAT_LEVEL_STORAGE_KEY);
    return isChatLevel(value) ? value : DEFAULT_CHAT_LEVEL;
  } catch {
    return DEFAULT_CHAT_LEVEL;
  }
}

export function storeChatLevel(level: ChatLevel): void {
  try {
    window.localStorage.setItem(CHAT_LEVEL_STORAGE_KEY, level);
  } catch {
    // storage unavailable (private mode, blocked) - the choice just isn't remembered
  }
}

/** "Basit · gpt-4o-mini"; model only for answers saved before levels existed. */
export function answerLabel(level: ChatLevel | null | undefined, model: string | null | undefined): string | null {
  const parts = [level ? CHAT_LEVEL_LABELS[level] : null, model || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__ && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts frontend/src/lib/chatStream.ts frontend/src/lib/chatLevels.ts frontend/src/lib/__tests__/chatLevels.test.ts frontend/src/lib/__tests__/chatStream.test.ts
git commit -m "feat(web): chat level types, request field and remembered choice"
```

---

### Task 4: Level picker and answer labels

**Files:**
- Create: `frontend/src/components/ai/chat/ChatLevelPicker.tsx`
- Modify: `frontend/src/components/ai/chat/ChatView.tsx`, `frontend/src/components/ai/chat/ChatThread.tsx`
- Test: `frontend/src/components/__tests__/ChatView.test.tsx` (append; add `window.localStorage.clear()` to `beforeEach`)

**Interfaces:**
- Consumes: Task 3 (`ChatLevel`, `ChatLevelInfo`, `CHAT_LEVEL_OPTIONS`, `DEFAULT_CHAT_LEVEL`, `readStoredChatLevel`, `storeChatLevel`, `answerLabel`, `streamChatMessage(..., { level, signal, onEvent })`).
- Produces: radiogroup "Yanıt seviyesi" with radios "Basit", "Standart", "Kapsamlı" (`aria-checked`, `title` = hint + model); answer label text `"<Seviye> · <model>"` under assistant messages (used by Task 5 E2E).

- [ ] **Step 1: Write the failing tests** — in `frontend/src/components/__tests__/ChatView.test.tsx` add `window.localStorage.clear();` as the first line of `beforeEach`, then append inside `describe("ChatView", ...)`:

```tsx
  it("sends the selected level and remembers it", async () => {
    streamChatMessage.mockResolvedValue(undefined);
    render(<ChatView />);

    const group = screen.getByRole("radiogroup", { name: "Yanıt seviyesi" });
    expect(within(group).getByRole("radio", { name: "Standart" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(within(group).getByRole("radio", { name: "Basit" }));
    expect(within(group).getByRole("radio", { name: "Basit" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("casebridge_chat_level")).toBe("basic");

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Selam{Enter}");
    await waitFor(() =>
      expect(streamChatMessage).toHaveBeenCalledWith("new1", "Selam", expect.objectContaining({ level: "basic" })),
    );
  });

  it("restores the stored level", async () => {
    window.localStorage.setItem("casebridge_chat_level", "deep");
    render(<ChatView />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Kapsamlı" })).toHaveAttribute("aria-checked", "true"));
  });

  it("shows each level's model in its hint", async () => {
    api.getChatStatus.mockResolvedValue({
      ...STATUS,
      levels: [
        { level: "basic", label: "Basit", model: "model-basic" },
        { level: "standard", label: "Standart", model: "model-standard" },
        { level: "deep", label: "Kapsamlı", model: "model-deep" },
      ],
    });
    render(<ChatView />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Basit" }).getAttribute("title")).toContain("model-basic"));
    expect(screen.getByRole("radio", { name: "Kapsamlı" }).getAttribute("title")).toContain("model-deep");
  });

  it("labels answers with their level and model", async () => {
    api.getChatConversation.mockResolvedValue({
      ...CONVERSATION,
      messages: [
        msg({ id: "u1", role: "user", content: "Süre nedir?", status: null, model: null }),
        msg({ id: "a1", content: "İki haftadır.", level: "basic", model: "gpt-4o-mini" }),
      ],
    });
    setUrl("/ai/sohbet?sohbet=c1");
    render(<ChatView />);
    expect(await screen.findByText("Basit · gpt-4o-mini")).toBeInTheDocument();
  });

  it("locks the level while a reply streams", async () => {
    streamChatMessage.mockImplementation(
      (_id: string, content: string, { signal, onEvent }: StreamOptions) =>
        new Promise((_resolve, reject) => {
          onEvent({ type: "start", user_message: msg({ id: "u9", role: "user", content, status: null, model: null }), assistant_message_id: "a9" });
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    render(<ChatView />);

    await userEvent.type(screen.getByLabelText("Mesajınız"), "Soru{Enter}");

    await waitFor(() => expect(screen.getByRole("radio", { name: "Basit" })).toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Durdur" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Basit" })).toBeEnabled());
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/ChatView.test.tsx`
Expected: the five new tests FAIL (no radiogroup / label); existing tests still pass.

- [ ] **Step 3: Create the picker** — `frontend/src/components/ai/chat/ChatLevelPicker.tsx`:

```tsx
"use client";

import { CHAT_LEVEL_OPTIONS } from "@/lib/chatLevels";
import type { ChatLevel, ChatLevelInfo } from "@/types";

export function ChatLevelPicker({
  value,
  levels,
  disabled,
  onChange,
}: {
  value: ChatLevel;
  /** From /chat/status; used to show each level's model in its hint. */
  levels: ChatLevelInfo[];
  disabled: boolean;
  onChange: (level: ChatLevel) => void;
}) {
  const selected = CHAT_LEVEL_OPTIONS.find((option) => option.level === value);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="radiogroup" aria-label="Yanıt seviyesi" className="inline-flex rounded-xl bg-white p-1 ring-1 ring-surface-border">
        {CHAT_LEVEL_OPTIONS.map((option) => {
          const checked = option.level === value;
          const model = levels.find((level) => level.level === option.level)?.model;
          return (
            <button
              key={option.level}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              title={model ? `${option.hint} · Model: ${model}` : option.hint}
              onClick={() => onChange(option.level)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? "bg-accent-600 text-white" : "text-navy-600 hover:bg-accent-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selected && <span className="text-[11px] text-navy-500">{selected.hint}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `ChatView.tsx`**

Imports: add `ChatLevel` to the `@/types` import, plus:

```tsx
import { DEFAULT_CHAT_LEVEL, readStoredChatLevel, storeChatLevel } from "@/lib/chatLevels";
import { ChatLevelPicker } from "@/components/ai/chat/ChatLevelPicker";
```

`draftMessage` gains a level:

```tsx
function draftMessage(
  role: ChatRole,
  content: string,
  status: ChatMessageStatus | null,
  level: ChatLevel | null = null,
): ChatThreadMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    status,
    model: null,
    level,
    feedback: null,
    created_at: new Date().toISOString(),
  };
}
```

State (with the other `useState`s) and restore-on-mount (localStorage is read in an effect, not during render, to avoid a server/client mismatch):

```tsx
  const [level, setLevel] = useState<ChatLevel>(DEFAULT_CHAT_LEVEL);

  useEffect(() => {
    setLevel(readStoredChatLevel());
  }, []);

  function changeLevel(next: ChatLevel) {
    setLevel(next);
    storeChatLevel(next);
  }
```

In `send`: create the assistant draft with the level — `const assistantDraft = draftMessage("assistant", "", "streaming", level);` — and pass it to the stream:

```tsx
      await streamChatMessage(conversationId, content, {
        level,
        signal: controller.signal,
        onEvent: (event) => {
```

Render the picker directly above `<ChatComposer ...>`:

```tsx
            <ChatLevelPicker
              value={level}
              levels={status?.levels ?? []}
              disabled={composerDisabled || streaming}
              onChange={changeLevel}
            />
```

- [ ] **Step 5: Label answers in `ChatThread.tsx`**

Add `import { answerLabel } from "@/lib/chatLevels";`. In `AssistantMessage`, compute `const label = answerLabel(message.level, message.model);` next to `streaming`/`stopped`, and render after the feedback block (still inside the `min-w-0 max-w-[85%]` div):

```tsx
        {label && <p className="mt-1 text-[11px] text-navy-500">{label}</p>}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: full Vitest suite PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ai/chat/ChatLevelPicker.tsx frontend/src/components/ai/chat/ChatView.tsx frontend/src/components/ai/chat/ChatThread.tsx frontend/src/components/__tests__/ChatView.test.tsx
git commit -m "feat(web): answer level picker and level/model labels in the chat"
```

---

### Task 5: End-to-end check and full verification

**Files:**
- Modify: `tests/e2e/specs/07-ai-chat.spec.ts` (append a test)

**Interfaces:**
- Consumes: everything above. With `CHAT_PROVIDER=mock` (pinned in the Playwright config) every level's model is `mock`.

- [ ] **Step 1: Append the E2E test** — to `tests/e2e/specs/07-ai-chat.spec.ts`:

```ts
test("answer at the Basit level and keep the choice after a reload", async ({ page }) => {
  await login(page, DEMO_LAWYER);
  await page.goto("/ai/sohbet");

  const levels = page.getByRole("radiogroup", { name: "Yanıt seviyesi" });
  await levels.getByRole("radio", { name: "Basit" }).click();
  await expect(levels.getByRole("radio", { name: "Basit" })).toHaveAttribute("aria-checked", "true");

  await page.getByLabel("Mesajınız").fill("İstinaf süresi kaç gündür?");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Sorunuz: İstinaf süresi kaç gündür?")).toBeVisible();
  await expect(page.getByText("Basit · mock")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: "Basit" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Basit · mock")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E spec**

Run: `cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test specs/07-ai-chat.spec.ts`
Expected: 2 passed.

- [ ] **Step 3: Full verification**

```bash
cd backend && source .venv/bin/activate && pytest -q && cd ..
cd frontend && npx vitest run && npx tsc --noEmit && npm run build && cd ..
cd tests/e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test && cd ../..
```

Expected: all green (there is no `npm run lint` script in `frontend/`).

- [ ] **Step 4: Visual check** — screenshot `/ai/sohbet` at 1440px and 390px with the picker visible (empty state and after a Basit answer). The picker must sit above the composer without overflowing at 390px (it may wrap the hint text onto a second line). Fix real layout problems minimally.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/07-ai-chat.spec.ts
git commit -m "test(e2e): answer at a chosen chat level"
```

---

## Spec Coverage

| Spec section | Task |
|---|---|
| 3.1 Settings, `.env.example` | 1 |
| 3.2 Level layer, `system_prompt_for` | 1 |
| 3.3 Providers `max_tokens`, factory per level, status `levels` | 1 |
| 3.4 `level` column, request field, 422/503, history per level, export prompt + `?level=` | 2 |
| 4 Picker, remembered choice, sending level, answer label, disabled while streaming | 3–4 |
| 5 Tests (backend, Vitest, E2E) | 1–5 |
