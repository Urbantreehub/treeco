# TreeCo — Client Showcase Demo

This repo can build a **fully-functional, self-contained demo** of TreeCo to send
to a potential client. The demo runs with **no backend and no real data** — every
page is populated with invented sample data held in the visitor's browser, so it's
safe to share a public link.

## What the demo does

- **Auto-logs in** as a "Demo User" (full access) — no login screen, no password.
- **Every feature works**: Jobs pipeline, Calendar, Planner, Clients, Quotes,
  Safety & Compliance, Team, Mulch, Tool requests, Dashboard metrics.
- **Upload buttons work** — safety records, company documents and job photos
  accept files and show/download them (held in-browser for the session).
- **Nothing is real** — no Urban Tree Services customers, GST number, phone,
  personal name or Google-reviews link. The demo uses a neutral fictional
  company ("Evergreen Arbor Co.") and invented Wellington clients.
- **"Live demo" badge** (bottom-right) explains it's a sandbox and offers a
  **Reset demo data** button to restore the clean sample set at any time.

It's all driven by one build flag: **`VITE_DEMO=true`** with **no** Supabase
credentials set. That switches the app to an in-memory backend
(`frontend/src/demo/`). Your production app is completely unaffected.

## Deploy it on its own domain (Vercel) — ~2 minutes

The demo is a **separate Vercel project** pointing at this same repo. It gets its
own URL and never touches your live app or database.

1. Go to **vercel.com → Add New → Project** and import this repository.
2. Name it something like **`treeco-demo`**.
3. Leave the **Root Directory** as the repo root (the root `vercel.json` already
   builds `frontend/` and outputs `frontend/dist`).
4. Under **Environment Variables**, add just one:
   - `VITE_DEMO` = `true`
   - **Do NOT** add `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` — leaving them
     unset is what makes the app use the safe in-memory demo backend.
5. Pick the branch that has this code, then **Deploy**.
6. You'll get a link like **`https://treeco-demo.vercel.app`** to send the client.

### (Optional) custom domain
In the demo project → **Settings → Domains**, add a subdomain you own, e.g.
**`demo.urbantreeservices.net`**, and follow Vercel's DNS instructions.

> Your production project stays on its own domain with its real data. Only this
> new project has `VITE_DEMO=true`, so only it runs in demo mode.

## Build it locally

```bash
cd frontend
npm install --legacy-peer-deps
VITE_DEMO=true npm run build   # output in frontend/dist
VITE_DEMO=true npm run dev     # or run it locally at http://localhost:5173
```

## Resetting / clearing demo data

Demo data lives in the browser's `localStorage` under `treeco_demo_db_v2`. The
**Reset demo data** button (in the "Live demo" badge) wipes it back to the seed.
Each visitor gets their own independent copy — one person's clicking never
affects another's.
