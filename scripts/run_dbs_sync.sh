#!/bin/bash
# DBS Portal → TreeCo sync server launcher
# Run this once, then click "Sync DBS jobs" in Settings whenever you need to pull jobs.
#
# Usage:
#   bash scripts/run_dbs_sync.sh
#
# The DBS password is loaded from scripts/.env (never committed to git).
# Create scripts/.env with:
#   DBS_PASSWORD=your_password_here
#   SUPABASE_SERVICE_KEY=sb_secret_...

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Load .env if it exists
if [ -f "$ENV_FILE" ]; then
  echo "→ Loading $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "⚠  No .env found at $ENV_FILE"
  echo "   Create it with:"
  echo "     DBS_PASSWORD=your_password"
  echo "     SUPABASE_SERVICE_KEY=sb_secret_..."
  echo ""
fi

# Defaults
export DBS_URL="${DBS_URL:-https://jobs.spencerhenshaw.co.nz}"
export DBS_USERNAME="${DBS_USERNAME:-URBAN}"
export SUPABASE_URL="${SUPABASE_URL:-https://zagwhnnxjtimzvvjaujm.supabase.co}"

# Check dependencies
if ! python3 -c "import playwright" 2>/dev/null; then
  echo "→ Installing playwright…"
  pip install playwright requests
  playwright install chromium
fi

echo "→ Starting DBS sync server on http://localhost:7700"
python3 "$SCRIPT_DIR/dbs_sync_server.py"
