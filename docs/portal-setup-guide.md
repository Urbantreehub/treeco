# Portal push — what you need to do

A plain-English checklist to switch on "Push to Portal" for Spencer's and Downer.
Everything else is built. There are two short one-off setup steps, then it's a
button.

---

## Part A — one-time setup (do these once)

**1. Turn on the database update.**
The photo Before/During/After feature needs one database change (migration `031`).
Whoever manages the TreeCo database runs the migrations — same as any other
TreeCo update. Nothing for you to click.

**2. Start the portal worker.**
This is the little program that does the uploading. It runs in the background
(same place the existing Spencer's job-sync worker runs). Deploy steps are in
`scripts/DEPLOY_DBS_WORKER.md`. Set once, then leave it.

**3. Downer login (the only MFA step).**
Downer's portal asks for your authenticator code. You do this **once**:

```
python3 scripts/portal_actions_worker.py --capture-downer
```

A browser window opens → sign in to MyWork and approve the MFA on your phone →
press Enter. It saves the login so the worker reuses it. **You won't touch this
again unless the worker tells you the session expired** (roughly every few weeks),
and then it's the same 30-second step. Spencer's has no MFA — nothing to do there.

**4. One supervised test.**
The first time, run the worker on a single Spencer's job with the window visible
so we confirm the portal's upload buttons line up. If a button moved, it's a
quick tweak. After that it just works.

---

## Part B — every job (you & the crew)

**1. Quote it in TreeCo as normal.**
On Spencer's jobs, for non-agreed-rate work just type the **hours** on the line —
it prices at $320+GST/hr and writes the "Breakdown of Costs" line automatically.
Agreed-rate (schedule) codes are left off the invoice and the portal PDF for you.

**2. Crew photograph the job.**
In the Work Order, each line has **Before / During / After**. The crew add During
and After on site (a job can't be marked complete until both are there). Extra
shots go in the "Additional photos" box.

**3. Mark the job Complete** in TreeCo.

**4. Press "Push to Spencers/Downer portal."**
It uploads every line's photos (Before→Before, During→WIP, After→After) and the
quote PDF into the portal, in the right spots.

**5. Open the portal and hit Submit / Claim yourself.**
The worker gets everything *ready* — you do the final click after a quick look.
(That last step stays with a human on purpose.)

---

## Who does what

| Step | Who |
|---|---|
| DB update, deploy worker | whoever runs TreeCo updates |
| Downer one-time login (MFA) | **you** (needs your authenticator) |
| First supervised test | you + whoever runs the worker |
| Quote, photos, Complete, Push | you & the crew, every job |
| Final Submit/Claim in the portal | **you** (on purpose) |

**MFA, in short:** Spencer's = none. Downer = one 30-second login, reused for
weeks, repeated only when it says it expired. That's the whole of it.
