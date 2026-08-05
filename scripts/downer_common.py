#!/usr/bin/env python3
"""
Shared helpers for the Downer (MyWork/Spotless) integration — used by both the
inbound scraper (downer_to_treeco.py) and the outbound worker
(portal_actions_worker.py).

The important bit is the MFA/session signal: MyWork requires MFA, so the worker
runs off a persisted browser session (DOWNER_STORAGE_STATE). When that session
expires, automated Downer sync + uploads stop working — and the office needs to
know, in TreeCo, with instructions. We surface that as a job_alerts row:

    { job_id: null, kind: 'downer_mfa', status: 'open', title, detail }

The frontend shows a red banner + an Actions entry for it. We OPEN it on an
expired/missing session and RESOLVE it (status 'done') on the next good login.
"""

import os
import requests
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zagwhnnxjtimzvvjaujm.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
DOWNER_URL           = os.environ.get("DOWNER_URL", "https://mywork.spotless.com.au")
DOWNER_STORAGE_STATE = os.environ.get("DOWNER_STORAGE_STATE", "downer_session.json")

# Shown verbatim in the TreeCo banner + Actions alert when the session dies.
MFA_TITLE = "Downer (MyWork) login expired — reconnect"
MFA_DETAIL = (
    "Automated Downer sync is paused until the MyWork login is refreshed.\n\n"
    "To reconnect (on the office computer running Downer Desk):\n"
    "1. Find the open Downer Desk browser/Terminal window.\n"
    "2. Sign in to MyWork again and approve the MFA prompt on your phone.\n"
    "3. Back in the Terminal window, press Enter — the sync resumes.\n\n"
    "If Downer Desk isn't running, double-click 'Downer Desk.command' in the "
    "scripts folder and sign in when the browser opens.\n\n"
    "This message clears itself once the login is working again."
)


def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def _now():
    return datetime.now(timezone.utc).isoformat()


def flag_downer_mfa(expired: bool):
    """Open or resolve the single 'downer_mfa' system alert.

    expired=True  → ensure exactly one OPEN downer_mfa alert exists.
    expired=False → resolve any open downer_mfa alert (login is working again).
    Best-effort: never raises (a Supabase hiccup shouldn't crash the worker)."""
    if not SUPABASE_KEY:
        return
    try:
        if expired:
            existing = requests.get(
                f"{SUPABASE_URL}/rest/v1/job_alerts",
                headers=_headers(),
                params={"select": "id", "kind": "eq.downer_mfa", "status": "eq.open", "limit": "1"},
                timeout=20,
            )
            if existing.ok and existing.json():
                return  # already flagged
            requests.post(
                f"{SUPABASE_URL}/rest/v1/job_alerts",
                headers={**_headers(), "Prefer": "return=minimal"},
                json={
                    "job_id": None, "kind": "downer_mfa", "source": "portal",
                    "title": MFA_TITLE, "detail": MFA_DETAIL, "status": "open",
                },
                timeout=20,
            )
        else:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/job_alerts",
                headers={**_headers(), "Prefer": "return=minimal"},
                params={"kind": "eq.downer_mfa", "status": "eq.open"},
                json={"status": "done", "actioned_at": _now()},
                timeout=20,
            )
    except Exception as e:
        print(f"  ⚠  downer_mfa alert update failed: {e}", flush=True)


async def downer_session_ok(page) -> bool:
    """True if the page is signed in to MyWork; False if it's showing the login
    ('Sign in as a subcontractor'). Raising the alert is the caller's job so it
    can also stop the run."""
    import re
    try:
        if await page.get_by_text(re.compile(r"sign in", re.I)).count() > 0:
            return False
    except Exception:
        pass
    return True
