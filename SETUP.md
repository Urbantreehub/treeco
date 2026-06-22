# TreeCo — Week 1 Setup Checklist

## 1. Add your Supabase credentials

**Frontend** — copy `.env.example` to `.env` inside the `frontend/` folder:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Backend** — copy `.env.example` to `.env` inside the `backend/` folder:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    ← from Supabase → Settings → API
APP_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
PORT=3001
```

## 2. Run the database schema

1. Open your Supabase project → SQL Editor → New query
2. Paste the contents of `supabase/schema.sql`
3. Run it — this creates all tables, RLS policies, and triggers

## 3. Create your first user

In Supabase → Authentication → Users → Add user:
- Set email + password
- After creating, go to Table Editor → users table
- Find the new row and change `access_level` to `full`

## 4. Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

## 5. Run locally

Terminal 1 (backend):
```bash
cd backend && npm run dev
```

Terminal 2 (frontend):
```bash
cd frontend && npm run dev
```

Open http://localhost:5173 — you should see the login screen.

## What's built (Week 1)

- ✅ Login screen (bark/moss design)
- ✅ Sidebar navigation shell (full vs restricted access)
- ✅ Auth context (Supabase JWT, access_level enforcement)
- ✅ 9-status config object (single source of truth in `frontend/src/config/statuses.js`)
- ✅ Database schema (users, clients, jobs, quotes, schedule, job_photos)
- ✅ Row Level Security (restricted users can only see their assigned jobs)
- ✅ All Phase 1 API route stubs (jobs, clients, schedule, quotes)
- ✅ Backend auth middleware (server-side access_level check on every endpoint)

## Next session (Week 2–3): Job Pipeline

Tell Claude: "I'm building TreeCo. Blueprint attached. Build Week 2–3: the Kanban job pipeline board with dnd-kit, 9 columns, job cards, and the job detail slide-over panel."
