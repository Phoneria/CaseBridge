"""Encrypted platform-scope storage for the owner's Claude setup-token.

One file, `.system-secrets/claude-subagent.enc`, written with the same
Fernet mechanism, permissions and atomic replace as the AI keys
(app.services.ai_credentials). It holds one JSON envelope: the token, the
user ids it serves, its last test status and timestamps. Nothing here is ever
returned or logged with the token value; `public_status()` exposes only
set / last 4 / dates / status / user ids.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Optional

from app.core.config import settings
from app.services import ai_credentials

logger = logging.getLogger("casebridge")

TOKEN_PATTERN = re.compile(r"^sk-ant-oat01-[A-Za-z0-9_\-]{20,400}$")
MAX_USERS = 10
STATUSES = ("unknown", "ok", "invalid", "error")
_lock = Lock()


class SubagentConfigError(Exception):
    """Fixed, user-safe message."""


def _path() -> Path:
    return Path(settings.storage_dir) / ".system-secrets" / "claude-subagent.enc"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load() -> dict:
    path = _path()
    if not path.exists():
        return {}
    raw = ai_credentials._read_secret(path)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        logger.error("Claude subagent settings could not be read")
        return {}
    return data if isinstance(data, dict) else {}


def _save(data: dict) -> None:
    try:
        ai_credentials._write_secret(_path(), json.dumps(data, ensure_ascii=False))
    except ai_credentials.CredentialError as exc:
        raise SubagentConfigError(str(exc)) from None


def get_token() -> Optional[str]:
    token = _load().get("token")
    return token if isinstance(token, str) and token else None


def allowed_user_ids() -> list[str]:
    ids = _load().get("user_ids") or []
    return [i for i in ids if isinstance(i, str)]


def is_enabled_for(user_id: Optional[str]) -> bool:
    """True only when a token is stored and this exact user is on the list."""
    if not user_id:
        return False
    data = _load()
    return bool(data.get("token")) and user_id in (data.get("user_ids") or [])


def public_status() -> dict:
    data = _load()
    token = data.get("token") or ""
    return {
        "set": bool(token),
        "last4": token[-4:] if token else None,
        "updated_at": data.get("updated_at"),
        "status": data.get("status", "unknown") if token else "none",
        "checked_at": data.get("checked_at"),
        "user_ids": [i for i in data.get("user_ids") or [] if isinstance(i, str)],
    }


def save_token(token: str) -> None:
    token = (token or "").strip()
    if not TOKEN_PATTERN.fullmatch(token):
        raise SubagentConfigError("Geçerli bir Claude setup-token yapıştırın (sk-ant-oat01-…).")
    with _lock:
        data = _load()
        data.update({"token": token, "updated_at": _now(), "status": "unknown", "checked_at": None})
        _save(data)


def delete_token() -> None:
    with _lock:
        data = _load()
        if not data:
            return
        data.update({"token": None, "updated_at": _now(), "status": "unknown", "checked_at": None})
        _save(data)


def set_user_ids(user_ids: list[str]) -> None:
    unique = list(dict.fromkeys(i for i in user_ids if isinstance(i, str) and i))
    if len(unique) > MAX_USERS:
        raise SubagentConfigError(f"En fazla {MAX_USERS} hesap seçilebilir.")
    with _lock:
        data = _load()
        data.update({"user_ids": unique, "updated_at": _now()})
        _save(data)


def mark_status(status: str) -> None:
    if status not in STATUSES:
        return
    with _lock:
        data = _load()
        if not data.get("token"):
            return
        data.update({"status": status, "checked_at": _now()})
        try:
            _save(data)
        except SubagentConfigError:
            logger.warning("Claude subagent status could not be saved")
