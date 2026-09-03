"""Baseline security response headers (Phase 6 hardening).

Not a substitute for a real edge/WAF layer in production, but closes
the cheapest, most common gaps: MIME-sniffing, clickjacking via
iframe embedding, referrer leakage, and unneeded browser feature
access (camera/mic/geolocation - this API serves none of those).
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response
