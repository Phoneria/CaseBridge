"""Bounded speech input/output for the persisted courtroom workflow.

Speech only changes the interface. Legal moves still go through the existing
validated courtroom API and its role-isolated worker.
"""
import httpx

from app.core.config import settings
from app.services.ai_credentials import get_openai_api_key

_BASE = "https://api.openai.com/v1/audio"


class VoiceUnavailable(Exception):
    pass


def _headers(law_firm_id=None) -> dict[str, str]:
    api_key = get_openai_api_key(law_firm_id)
    if not api_key:
        raise VoiceUnavailable("OpenAI voice is not configured")
    return {"Authorization": f"Bearer {api_key}"}


def transcribe(filename: str, content_type: str, data: bytes, *, law_firm_id=None) -> str:
    try:
        response = httpx.post(
            f"{_BASE}/transcriptions",
            headers=_headers(law_firm_id),
            data={"model": settings.voice_transcription_model},
            files={"file": (filename, data, content_type)},
            timeout=60,
        )
        response.raise_for_status()
        return str(response.json().get("text", "")).strip()
    except httpx.HTTPError as exc:
        raise VoiceUnavailable("Voice transcription failed") from exc


def synthesize(text: str, actor: str, *, law_firm_id=None) -> bytes:
    try:
        response = httpx.post(
            f"{_BASE}/speech",
            headers=_headers(law_firm_id),
            json={
                "model": settings.voice_speech_model,
                "voice": "onyx" if actor == "judge" else "coral",
                "input": text[:4096],
                "response_format": "mp3",
                "instructions": "Türkçe, ciddi ve anlaşılır bir duruşma üslubuyla konuş.",
            },
            timeout=60,
        )
        response.raise_for_status()
        return response.content
    except httpx.HTTPError as exc:
        raise VoiceUnavailable("Voice generation failed") from exc
