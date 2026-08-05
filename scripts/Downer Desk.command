#!/bin/bash
# Double-click this to start Downer Desk.
# It loads your keys from scripts/.env, opens MyWork, and after you log in it
# keeps pulling new Downer jobs into TreeCo until you close the window.
cd "$(dirname "$0")" || exit 1

if [ ! -f .env ]; then
  echo "No .env found. Run 'Setup Downer Desk.command' once first."
  echo "Press Enter to close."; read -r _; exit 1
fi

set -a
. ./.env
set +a

echo "Starting Downer Desk…  (Ctrl+C to stop)"
python3 downer_desk.py
echo
echo "Downer Desk has stopped. Press Enter to close this window."
read -r _
