"""A minimal in-memory rate limiter for the login endpoint (Phase 6
hardening - brute-force protection).

Deliberately not a general-purpose rate limiter (no Redis, no
distributed state): this is a single-process MVP, and a login
endpoint is the one place a missing rate limit is a real security
gap (credential stuffing / brute force), not just a nice-to-have.
State resets on process restart and is not shared across multiple
backend instances - both acceptable for the current deployment
target and called out explicitly rather than left implicit.
"""
import time
from collections import defaultdict
from threading import Lock

_WINDOW_SECONDS = 60
_MAX_ATTEMPTS = 5

_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def is_rate_limited(key: str) -> bool:
    """Returns True if `key` has already made >= _MAX_ATTEMPTS login
    attempts within the current sliding window. Does NOT record this
    call as an attempt - call record_attempt() separately once the
    request is actually being processed."""
    now = time.monotonic()
    with _lock:
        recent = [t for t in _attempts[key] if now - t < _WINDOW_SECONDS]
        _attempts[key] = recent
        return len(recent) >= _MAX_ATTEMPTS


def record_attempt(key: str) -> None:
    with _lock:
        _attempts[key].append(time.monotonic())


def reset_all() -> None:
    """Test-only hook so each test starts with a clean limiter state."""
    with _lock:
        _attempts.clear()
