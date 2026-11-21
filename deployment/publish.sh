#!/usr/bin/env bash
set -euo pipefail
# Manual publication of an immutable artifact from current origin/main only.
# No automatic trigger or schedule is configured here. See immutable-release.md.
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 FULL_MAIN_SHA [app|marketing|all]" >&2
  exit 2
fi
commit="$1"
scope="${2:-all}"
entrypoint=/usr/local/sbin/casebridge-release
sudo -n "$entrypoint" stage "$commit" "$scope"
sudo -n "$entrypoint" activate "$commit"
sudo -n "$entrypoint" verify "$commit"
