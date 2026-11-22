"""Authenticated stateless Sufle APIs. Tenant comes exclusively from the session."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import is_rate_limited, record_attempt
from app.models.user import User
from app.services import sufle_service, voice_service

router = APIRouter(prefix="/sufle", tags=["sufle"])


def _bureau(user):
    if user.law_firm.is_platform:
        raise HTTPException(403, "Sufle için bir büro hesabıyla giriş yapın.")
    return user.law_firm_id


def _limit(user, kind):
    key = f"sufle:{kind}:{user.law_firm_id}:{user.id}"
    if is_rate_limited(key, 15):
        raise HTTPException(429, "Çok sık istek gönderildi. Biraz bekleyip yeniden deneyin.")
    record_attempt(key)


@router.get("/status")
def status(user: User = Depends(get_current_user)):
    firm = _bureau(user)
    return {"configured": sufle_service.configured(firm), "model": sufle_service.model_name(),
            "transcription_model": settings.voice_transcription_model}


@router.post("/analyze")
def analyze(payload: sufle_service.AnalysisRequest, user: User = Depends(get_current_user)):
    firm = _bureau(user)
    _limit(user, "analyze")
    try:
        return sufle_service.analyze(payload, firm)
    except sufle_service.SufleUnavailable as exc:
        raise HTTPException(503, str(exc)) from None


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), acknowledged: bool = Form(...),
                     user: User = Depends(get_current_user)):
    firm = _bureau(user)
    if not acknowledged:
        raise HTTPException(422, "Görüşmenin işlenmesine ilişkin bilgilendirmeyi onaylayın.")
    _limit(user, "audio")
    if not sufle_service.configured(firm):
        raise HTTPException(503, "Büronuzun GPT bağlantısı hazır değil. Ayarlar'ı kontrol edin.")
    kind = (file.content_type or "").split(";")[0]
    extension = {"audio/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/wav": ".wav"}.get(kind)
    if not extension:
        raise HTTPException(422, "WebM, MP4, Ogg veya WAV ses kullanın.")
    data = await file.read(8 * 1024 * 1024 + 1)
    await file.close()
    if not data or len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "Ses parçası boş olmamalı ve 8 MB'ı aşmamalı.")
    try:
        text = await run_in_threadpool(voice_service.transcribe, f"sufle{extension}", kind, data, law_firm_id=firm)
    except voice_service.VoiceUnavailable:
        raise HTTPException(503, "Ses yazıya çevrilemedi. Parça bu sayfada bekliyor; yeniden deneyin.") from None
    return {"text": text}
