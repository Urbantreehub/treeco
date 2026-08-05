#!/bin/bash
# Run this ONCE to save your Supabase key safely into scripts/.env.
# It reads the key with a hidden prompt (getpass) so there's no Terminal-quoting
# mess and the key never lands in your shell history.
cd "$(dirname "$0")" || exit 1

python3 - <<'PY'
import getpass, os

url = os.environ.get("SUPABASE_URL", "https://zagwhnnxjtimzvvjaujm.supabase.co")
print("Setting up Downer Desk.")
print("Paste your Supabase SERVICE ROLE key when asked — it stays hidden and")
print("gets written only to scripts/.env on this machine.\n")
key = getpass.getpass("Supabase service_role key (paste, then Enter): ").strip()
if not key or key.count(".") < 2:
    print("\nThat didn't look like a key (expected something with two dots). Nothing saved.")
    raise SystemExit(1)

with open(".env", "w") as f:
    f.write(f"SUPABASE_URL={url}\n")
    f.write(f"SUPABASE_SERVICE_KEY={key}\n")
os.chmod(".env", 0o600)
print("\nSaved scripts/.env (readable only by you).")
print("You can now double-click 'Downer Desk.command' to start syncing.")
PY

echo
echo "Press Enter to close this window."
read -r _
