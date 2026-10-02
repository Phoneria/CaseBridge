FROM python:3.11-slim AS base

# psycopg2-binary needs libpq at runtime; build tools only needed if a
# future dependency requires compiling (kept minimal on purpose).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Storage dir for uploaded documents - mount a volume here in
# docker-compose/production so uploads survive container restarts.
RUN mkdir -p /app/storage

EXPOSE 8000

# Apply migrations, then start the API. Alembic is the source of
# truth for schema; app startup's create_all() is left as a defensive
# fallback only (see docs/IMPLEMENTATION_LOG.md, Phase 6 slice 1).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
