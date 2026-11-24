"""In-memory abuse limits for the public site chat.

Single-process state, like app.core.rate_limit: the production backend runs
one uvicorn process (deployment/compose.production.yml forbids --workers),
and the limits reset on restart. IP addresses are used only as dictionary
keys here; they are never logged or stored.
"""
import time
from collections import defaultdict, deque
from datetime import date
from threading import Lock
from typing import Callable, Optional

from app.core.timeutil import local_today

MINUTE = 60.0
MAX_TRACKED_IPS = 50_000


class SiteChatLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic, today: Callable[[], date] = local_today):
        self._clock = clock
        self._today = today
        self._lock = Lock()
        self.reset()

    def reset(self) -> None:
        self._minute: dict[str, deque] = defaultdict(deque)
        self._day: dict[str, int] = defaultdict(int)
        self._day_key = None
        self._tokens = 0

    def _roll_day(self) -> None:
        today = self._today()
        if today != self._day_key:
            self._day_key, self._day, self._tokens = today, defaultdict(int), 0
            self._minute.clear()

    def hit(self, ip: str, per_minute: int, per_day: int) -> Optional[str]:
        """Counts one request for `ip`. Returns "minute" or "day" when the
        request is over a limit (and then does not count it), else None."""
        with self._lock:
            self._roll_day()
            now = self._clock()
            window = self._minute[ip]
            while window and now - window[0] >= MINUTE:
                window.popleft()
            if len(window) >= per_minute:
                return "minute"
            if self._day[ip] >= per_day:
                return "day"
            if len(self._day) >= MAX_TRACKED_IPS and ip not in self._day:
                return "day"  # memory guard: far beyond any real traffic for a marketing site
            window.append(now)
            self._day[ip] += 1
            return None

    def budget_allows(self, estimated_tokens: int, budget: int) -> bool:
        with self._lock:
            self._roll_day()
            return self._tokens + estimated_tokens <= budget

    def spend(self, tokens: int) -> None:
        with self._lock:
            self._roll_day()
            self._tokens += max(0, int(tokens))

    @property
    def tokens_today(self) -> int:
        with self._lock:
            self._roll_day()
            return self._tokens


limiter = SiteChatLimiter()
