#!/usr/bin/env bash
set -euo pipefail

# Run on the live server after reviewing the release checkout. Build before
# replacing running services; never touch the shared Autosense stack or DB.
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"
docker run --rm -v "$repo_dir:/workspace" -w /workspace/frontend node:20-slim node scripts/update-version.mjs
compose=(docker compose --env-file /etc/casebridge/production.env -f deployment/compose.production.yml)
"${compose[@]}" config --quiet
"${compose[@]}" build cb-backend cb-frontend
"${compose[@]}" up -d --no-deps --wait cb-backend cb-frontend
curl --fail --show-error --silent https://app.casebridge.com.tr/api/health
