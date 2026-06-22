#!/usr/bin/env python3
"""
Local DBS sync server
=====================
Tiny HTTP server that the TreeCo Settings page calls when you click "Sync DBS jobs".
Runs the DBS extraction and upserts results into Supabase.

Start it with:
    bash scripts/run_dbs_sync.sh
"""

import asyncio
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 7700
SCRIPT = Path(__file__).parent / "dbs_to_treeco.py"


class SyncHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default access log

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/sync":
            self.send_response(404)
            self.end_headers()
            return

        print("→ DBS sync triggered…", flush=True)
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                capture_output=True,
                text=True,
                timeout=300,
                env={**os.environ},
            )
            if result.returncode != 0:
                print(result.stderr, flush=True)
                self.send_response(500)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": result.stderr[-500:]}).encode())
                return

            # dbs_to_treeco.py prints JSON counts to stdout
            counts = json.loads(result.stdout.strip().splitlines()[-1])
            print(f"✓ Done: {counts}", flush=True)
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(counts).encode())

        except subprocess.TimeoutExpired:
            self.send_response(504)
            self._cors()
            self.end_headers()
        except Exception as e:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


if __name__ == "__main__":
    # Check required env vars
    missing = [v for v in ("DBS_PASSWORD", "SUPABASE_SERVICE_KEY") if not os.environ.get(v)]
    if missing:
        print(f"✗  Missing env vars: {', '.join(missing)}", file=sys.stderr)
        print("   Set them in scripts/.env or export them before running.", file=sys.stderr)
        sys.exit(1)

    print(f"✓  DBS sync server listening on http://localhost:{PORT}")
    print(f"   Click 'Sync DBS jobs' in Settings to trigger a sync.")
    print(f"   Press Ctrl+C to stop.\n")
    HTTPServer(("localhost", PORT), SyncHandler).serve_forever()
