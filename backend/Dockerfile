FROM python:3.11-slim AS base

# psycopg2-binary needs libpq at runtime; build tools only needed if a
# future dependency requires compiling (kept minimal on purpose).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The Claude Agent SDK bundles the Claude Code CLI (spec 024). Fail the build,
# not the first request, if the bundled CLI cannot run in this image.
RUN CLAUDE_CLI="$(python -c 'import claude_agent_sdk, os; print(os.path.join(os.path.dirname(claude_agent_sdk.__file__), "_bundled", "claude"))')" \
    && HOME=/tmp/claude-build-home "$CLAUDE_CLI" --version \
    && rm -rf /tmp/claude-build-home

COPY . .

# Storage dir for uploaded documents - mount a volume here in
# docker-compose/production so uploads survive container restarts.
RUN mkdir -p /app/storage

EXPOSE 8000

# Apply migrations, then start the API. Alembic is the source of
# truth for schema; app startup's create_all() is left as a defensive
# fallback only (see docs/IMPLEMENTATION_LOG.md, Phase 6 slice 1).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
