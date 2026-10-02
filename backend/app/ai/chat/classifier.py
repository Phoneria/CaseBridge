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
