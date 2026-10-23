"""Keep one-time tokens out of the access log.

``GET /auth/token-info?token=...`` carries the invite / reset token in the
query string; uvicorn's access logger writes the request line, so the value
is replaced with ``***`` before the record is emitted.
"""
import logging
import re

_TOKEN_PARAM = re.compile(r"([?&]token=)[^&\s\"']*")


def redact_tokens(text: str) -> str:
    return _TOKEN_PARAM.sub(r"\1***", text)


class TokenRedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_tokens(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(redact_tokens(a) if isinstance(a, str) else a for a in record.args)
        return True


def install_access_log_redaction() -> None:
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, TokenRedactionFilter) for f in logger.filters):
        logger.addFilter(TokenRedactionFilter())
