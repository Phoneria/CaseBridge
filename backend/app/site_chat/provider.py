"""The site chat's model: the PLATFORM OpenAI key with SITE_CHAT_MODEL, or a
deterministic mock when LLM_PROVIDER=mock. A bureau key is never looked up:
get_openai_api_key is called with law_firm_id=None, which reads only the
platform's own active key (or OPENAI_API_KEY). No tools are offered."""
import re
from typing import Iterator, Optional

from app.ai.chat.base import ChatProvider, ChatTurn
from app.ai.chat.openai_provider import OpenAIChatProvider
from app.core.config import settings
from app.services import ai_credentials
from app.site_chat.guard import classify_topic
from app.site_chat.knowledge import BOOKING_URL, load_knowledge

LANGUAGE_LINE = "VISITOR_LANGUAGE: "

TOPIC_TITLES_EN = {
    "overview": "Overview", "cases": "Cases and daily work", "bureau": "Bureau management",
    "past-analysis": "Past case analysis", "scenario-tree": "Probability tree", "precedents": "Precedents and similar cases",
    "casebridge-ai": "CaseBridge AI", "courtroom": "Hearing simulation", "anonymisation": "Data anonymisation",
    "security": "Security and privacy", "how-ai-works": "How the AI works", "demo": "Demo and contact", "team": "Team",
}


def unknown_answer(lang: str) -> str:
    if lang == "en":
        return ("I can only help with questions about CaseBridge, and I don't have information on that. "
                f"You can book a demo and ask the team directly: {BOOKING_URL}")
    return ("Yalnızca CaseBridge hakkındaki sorulara yardımcı olabiliyorum ve bu konuda bilgim yok. "
            f"Ekibe doğrudan sormak için demo planlayabilirsiniz: {BOOKING_URL}")


def _first_sentences(markdown: str, limit: int = 420) -> str:
    text = re.sub(r"^\s*-\s*", "", markdown, flags=re.M)
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind(": "))
    return (cut[: end + 1] if end > 120 else cut.rstrip()) + " …"


def mock_answer(question: str, lang: str) -> str:
    """Deterministic answer from the knowledge file (tests, demos, LLM_PROVIDER=mock)."""
    topic = classify_topic(question)
    if topic is None or topic == "pricing":
        return unknown_answer(lang)
    section = load_knowledge().sections[topic]
    snippet = _first_sentences(section.text)
    if lang == "en":
        return f"[Test answer] CaseBridge site information — {TOPIC_TITLES_EN[topic]}: {snippet}"
    return f"[Test yanıtı] CaseBridge site bilgisi — {section.title}: {snippet}"


class MockSiteChatProvider(ChatProvider):
    provider = "mock"
    model = "mock"
    external = False

    def __init__(self):
        self.calls: list[list[ChatTurn]] = []
        self.last_usage = None
        self.last_finish_reason = None

    def stream(self, messages: list[ChatTurn]) -> Iterator[str]:
        self.calls.append(list(messages))
        lang = "tr"
        for message in messages:
            if message["role"] == "system":
                for line in message["content"].splitlines():
                    if line.startswith(LANGUAGE_LINE):
                        lang = line[len(LANGUAGE_LINE):].strip()
        question = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        answer = mock_answer(question, lang)
        self.last_usage = {"prompt_tokens": 0, "completion_tokens": 0}
        self.last_finish_reason = "stop"
        yield answer


def build_site_chat_provider() -> Optional[ChatProvider]:
    """None when the real provider cannot be used (no platform key)."""
    if settings.llm_provider == "mock":
        return MockSiteChatProvider()
    key = ai_credentials.get_openai_api_key(None)  # platform key only - never a bureau's
    if not key:
        return None
    return OpenAIChatProvider(
        api_key=key,
        model=settings.site_chat_model,
        timeout_seconds=settings.site_chat_timeout_seconds,
        max_tokens=settings.site_chat_max_output_tokens,
        max_retries=1,
    )
