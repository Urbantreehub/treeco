-- =====================================================================
-- Catch-up: apply migration 027 (truck access level) to PROD, then put
-- the two truck iPad logins onto it so they get the Calendar.
--
-- Why: on the truck iPads "no calendar shows at all". The Calendar tab
-- (and the /calendar route) is gated to full / office / truck logins —
-- a 'restricted' (Crew) login has no calendar. The truck accounts can
-- only sit on the 'truck' access level if that enum value exists in
-- prod; if migration 027 was never applied, setting "Truck" in Settings
-- silently fails and the account stays Crew.
--
-- Paste into Supabase Dashboard -> SQL Editor.
-- IMPORTANT: run STEP 1 on its own and let it finish first. A new enum
-- value can't be added and then used in the same transaction, so STEP 2
-- must be a separate Run.
-- Both steps are idempotent — safe to re-run.
-- =====================================================================

-- ── STEP 1 — run this ALONE first ────────────────────────────────────
ALTER TYPE access_level ADD VALUE IF NOT EXISTS 'truck';


-- ── STEP 2 — run AFTER step 1 has completed ──────────────────────────
-- First, see the current logins so you can pick the right rows:
--   SELECT id, name, email, access_level, resource_id FROM users ORDER BY name;
--
-- Then set each truck iPad account. Mapping (per Josh): the Big Truck is
-- the Nissan, the Small Truck is the Isuzu. Fill in the real login emails:

-- Small Truck iPad  ->  Isuzu
UPDATE users
   SET access_level = 'truck', resource_id = 'isuzu'
 WHERE email = 'REPLACE_WITH_SMALL_TRUCK_LOGIN_EMAIL';

-- Big Truck iPad  ->  Nissan
UPDATE users
   SET access_level = 'truck', resource_id = 'nissan'
 WHERE email = 'REPLACE_WITH_BIG_TRUCK_LOGIN_EMAIL';

-- Verify:
--   SELECT name, email, access_level, resource_id FROM users
--    WHERE access_level = 'truck';
