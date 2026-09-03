"""Config for the OPTIONAL real-provider test suites (real_openai,
real_qwen).

This directory is intentionally outside `testpaths` in pytest.ini, so a
plain `pytest` run from backend/ never collects it and never touches
the network or spends real tokens/credits. Each suite must be run
explicitly:

    pytest tests_manual -m real_openai --run-real-openai
    pytest tests_manual -m real_qwen --run-real-qwen

The --run-real-* flag is required (in addition to the marker) as a
second, explicit safety gate against accidentally spending real
credits in CI or a routine local run.
"""
import os
import sys

import pytest

# This directory is outside `testpaths` (tests/), so plain `pytest`
# never imports it and tests/conftest.py's sys.path bootstrap never
# runs for it either. Running it explicitly (pytest tests_manual ...)
# needs the same bootstrap so `from app... import` resolves.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest_plugins: list[str] = []


def pytest_addoption(parser):
    parser.addoption(
        "--run-real-openai",
        action="store_true",
        default=False,
        help="Actually call the real OpenAI API (costs tokens). Requires OPENAI_API_KEY.",
    )
    parser.addoption(
        "--run-real-qwen",
        action="store_true",
        default=False,
        help="Actually call the real Qwen (Alibaba Model Studio) API. Requires QWEN_API_KEY and QWEN_BASE_URL.",
    )


def pytest_collection_modifyitems(config, items):
    skip_openai = pytest.mark.skip(
        reason="real_openai tests are opt-in: rerun with --run-real-openai to enable"
    )
    skip_qwen = pytest.mark.skip(
        reason="real_qwen tests are opt-in: rerun with --run-real-qwen to enable"
    )
    run_openai = config.getoption("--run-real-openai")
    run_qwen = config.getoption("--run-real-qwen")
    for item in items:
        if "real_openai" in item.keywords and not run_openai:
            item.add_marker(skip_openai)
        if "real_qwen" in item.keywords and not run_qwen:
            item.add_marker(skip_qwen)


@pytest.fixture(scope="session")
def require_openai_api_key() -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        pytest.skip("OPENAI_API_KEY not set - cannot run a real OpenAI test")
    return api_key


@pytest.fixture(scope="session")
def require_qwen_config() -> dict:
    api_key = os.environ.get("QWEN_API_KEY")
    base_url = os.environ.get("QWEN_BASE_URL")
    if not api_key or not base_url:
        pytest.skip("QWEN_API_KEY and QWEN_BASE_URL must both be set to run a real Qwen test")
    return {"api_key": api_key, "base_url": base_url}
