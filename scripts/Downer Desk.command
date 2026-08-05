#!/bin/bash
# Downer Desk — double-click to sync Downer jobs into TreeCo.
# First run installs what it needs and asks for the key once; after that it just
# opens MyWork and keeps pulling jobs. Works with anyone's MyWork login.
cd "$(dirname "$0")" || exit 1

echo "──────────────  Downer Desk  ──────────────"

# 1) Tools — first run only (quick if they're already installed).
if ! python3 -c "import playwright, requests" >/dev/null 2>&1; then
  echo "First-time setup: installing the tools this needs (2–3 minutes)…"
  pip3 install -r requirements.txt || {
    echo; echo "Couldn't install the tools. Show this window to Josh. Press Enter to close."
    read -r _; exit 1; }
fi
python3 -m playwright install chromium >/dev/null 2>&1

# 2) Key — first run only. Hidden prompt, so pasting can't get mangled.
if [ ! -f .env ]; then
  echo
  echo "One-time: paste the Supabase key Josh gave you (it stays hidden as you paste)."
  python3 - <<'PY'
import getpass, os
key = getpass.getpass("Key (paste, then press Enter): ").strip()
open(".env", "w").write("SUPABASE_URL=https://zagwhnnxjtimzvvjaujm.supabase.co\nSUPABASE_SERVICE_KEY=" + key + "\n")
os.chmod(".env", 0o600)
print("Saved ✓" if len(key) > 20 else "That key looked short — if it can't connect, run this again.")
PY
fi

# 3) Run — load the key, open MyWork, keep syncing.
set -a; . ./.env; set +a
echo
echo "A browser will open on MyWork. Sign in with YOUR login + approve MFA,"
echo "then come back here and press Enter. Leave this window open through the day."
echo
python3 downer_desk.py

echo
echo "Downer Desk has stopped. Press Enter to close this window."
read -r _
