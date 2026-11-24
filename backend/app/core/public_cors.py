"""CORS for the public marketing endpoints (/public/*) only.

The app-wide CORSMiddleware allows the application's own origins with
credentials. The marketing site (casebridge.com.tr) must reach /public/*
without widening CORS for every authenticated route, so this outermost
middleware handles /public/* by itself:

- preflight from an allowed origin: answered here (no credentials);
- a request carrying a disallowed Origin: rejected with 403 before it can
  spend model tokens (a browser would block reading the answer anyway);
- an allowed origin: Access-Control-Allow-Origin is set on the response, and
  Access-Control-Allow-Credentials is always removed (no cookies, no auth).

Requests without an Origin header (curl, server-to-server) pass; the
endpoint's own rate limits still apply.
"""
import re

from starlette.responses import PlainTextResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import settings

PUBLIC_PREFIX = "/public/"
_LOCAL = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d{1,5})?$")


def allowed_origin(origin: str) -> bool:
    exact = {o.strip().rstrip("/") for o in settings.site_chat_allowed_origins.split(",") if o.strip()}
    return origin in exact or bool(_LOCAL.match(origin))


class PublicCORSMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(PUBLIC_PREFIX):
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        origin = headers.get("origin")
        if origin is not None and not allowed_origin(origin):
            await PlainTextResponse("Origin not allowed", status_code=403)(scope, receive, send)
            return
        if scope["method"] == "OPTIONS" and origin and "access-control-request-method" in headers:
            await Response(status_code=204, headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            })(scope, receive, send)
            return

        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                # Public endpoints never use cookies or auth: drop the app-wide
                # middleware's Allow-Credentials and set our own origin header.
                raw = [(name, value) for name, value in message.get("headers", [])
                       if name.lower() not in (b"access-control-allow-credentials", b"access-control-allow-origin")]
                if origin:
                    raw += [(b"access-control-allow-origin", origin.encode("latin-1")), (b"vary", b"Origin")]
                message = {**message, "headers": raw}
            await send(message)

        await self.app(scope, receive, send_with_cors)
