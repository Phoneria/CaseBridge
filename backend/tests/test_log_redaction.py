import logging

from app.core.log_redaction import TokenRedactionFilter, install_access_log_redaction


def _record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", path, "1.1", 200), None,
    )


def test_filter_redacts_token_and_keeps_other_params():
    record = _record("/auth/token-info?token=abc123&x=1")
    assert TokenRedactionFilter().filter(record) is True
    line = record.getMessage()
    assert "token=***" in line and "x=1" in line and "abc123" not in line


def test_filter_redacts_token_in_last_position_and_leaves_plain_paths():
    record = _record("/auth/token-info?x=1&token=zzz")
    TokenRedactionFilter().filter(record)
    assert "x=1&token=***" in record.getMessage()
    plain = _record("/cases?status=open")
    TokenRedactionFilter().filter(plain)
    assert "/cases?status=open" in plain.getMessage()


def test_installed_on_uvicorn_access_logger_via_caplog(caplog):
    install_access_log_redaction()
    install_access_log_redaction()  # idempotent
    logger = logging.getLogger("uvicorn.access")
    assert sum(isinstance(f, TokenRedactionFilter) for f in logger.filters) == 1
    with caplog.at_level(logging.INFO, logger="uvicorn.access"):
        logger.info('%s - "%s %s HTTP/%s" %d', "1.2.3.4:1", "GET", "/auth/token-info?token=secret9", "1.1", 200)
    assert "secret9" not in caplog.text
    assert "token=***" in caplog.text


def test_app_import_installs_filter():
    import app.main  # noqa: F401

    assert any(isinstance(f, TokenRedactionFilter) for f in logging.getLogger("uvicorn.access").filters)
