-- =====================================================================
-- Catch-up: apply migration 008 (scheduled_checks) to PROD
-- (zagwhnnxjtimzvvjaujm) AND record the 31 Jul 2026 toolbox as done.
--
-- Why: the Safety → Scheduled Checks panel shows "No scheduled checks
-- found — apply migration 008 in Supabase to activate." because the
-- table was never created in prod. This script creates + seeds it, then
-- marks the Monthly Toolbox Meeting as completed on 31 Jul 2026 (next
-- due 30 Aug 2026), reflecting the toolbox meeting held that day.
--
-- Fully idempotent — safe to run once, safe to re-run.
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_checks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  check_type     TEXT NOT NULL, -- 'toolbox' | 'equipment' | 'audit' | 'first_aid' | 'licence' | 'other'
  frequency_days INT  NOT NULL,
  last_done      DATE,
  next_due       DATE NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Seed default checks (only if the table is empty) ─────────────────
INSERT INTO scheduled_checks (title, check_type, frequency_days, next_due)
SELECT * FROM (VALUES
  ('Monthly Toolbox Meeting',      'toolbox',   30,  (CURRENT_DATE + INTERVAL '7 days')::DATE),
  ('Monthly Equipment Inspection', 'equipment', 30,  (CURRENT_DATE + INTERVAL '7 days')::DATE),
  ('Monthly First Aid Kit Check',  'first_aid', 30,  (CURRENT_DATE + INTERVAL '7 days')::DATE),
  ('Quarterly H&S Site Audit',     'audit',     90,  (CURRENT_DATE + INTERVAL '30 days')::DATE),
  ('Annual Licence Review',        'licence',   365, (CURRENT_DATE + INTERVAL '90 days')::DATE),
  ('Annual H&S Policy Review',     'audit',     365, (CURRENT_DATE + INTERVAL '335 days')::DATE)
) AS v(title, check_type, frequency_days, next_due)
WHERE NOT EXISTS (SELECT 1 FROM scheduled_checks);

-- ── Mark the 31 Jul 2026 toolbox as done ─────────────────────────────
-- last_done = 31 Jul 2026, next_due = 30 Aug 2026 (30-day cadence).
UPDATE scheduled_checks
SET last_done  = DATE '2026-07-31',
    next_due   = DATE '2026-08-30',
    notes      = 'Toolbox held 31 Jul 2026 (Yard, 7:14–7:46am). Record filed in Drive → Toolbox Meetings and on TreeCo (H&S Policy & Documents). Amendments: spear cutting prohibited; overhead/underground services checks; star-picket controls; near-miss reporting.',
    updated_at = now()
WHERE title = 'Monthly Toolbox Meeting';

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE scheduled_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_checks"  ON scheduled_checks;
CREATE POLICY "staff_read_checks" ON scheduled_checks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.access_level IN ('staff', 'office', 'admin')));

DROP POLICY IF EXISTS "admin_write_checks" ON scheduled_checks;
CREATE POLICY "admin_write_checks" ON scheduled_checks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.access_level IN ('office', 'admin')));

-- ── Verify ───────────────────────────────────────────────────────────
SELECT title, check_type, last_done, next_due FROM scheduled_checks ORDER BY next_due;
