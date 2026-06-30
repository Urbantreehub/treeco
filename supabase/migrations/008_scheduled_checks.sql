-- Scheduled H&S checks — toolbox meetings, audits, equipment inspections, licence reviews
CREATE TABLE IF NOT EXISTS scheduled_checks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  check_type   TEXT NOT NULL, -- 'toolbox' | 'equipment' | 'audit' | 'first_aid' | 'licence' | 'other'
  frequency_days INT NOT NULL,          -- recurrence period in days
  last_done    DATE,                    -- NULL = never done
  next_due     DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Seed default scheduled checks
INSERT INTO scheduled_checks (title, check_type, frequency_days, next_due) VALUES
  ('Monthly Toolbox Meeting',        'toolbox',   30,  (CURRENT_DATE + INTERVAL '7 days')::DATE),
  ('Monthly Equipment Inspection',   'equipment', 30,  (CURRENT_DATE + INTERVAL '7 days')::DATE),
  ('Monthly First Aid Kit Check',    'first_aid', 30,  (CURRENT_DATE + INTERVAL '7 days')::DATE),
  ('Quarterly H&S Site Audit',       'audit',     90,  (CURRENT_DATE + INTERVAL '30 days')::DATE),
  ('Annual Licence Review',          'licence',   365, (CURRENT_DATE + INTERVAL '90 days')::DATE),
  ('Annual H&S Policy Review',       'audit',     365, (CURRENT_DATE + INTERVAL '335 days')::DATE)
ON CONFLICT DO NOTHING;

-- RLS — only staff and above can see / edit
ALTER TABLE scheduled_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_checks" ON scheduled_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.access_level IN ('staff', 'office', 'admin')
    )
  );

CREATE POLICY "admin_write_checks" ON scheduled_checks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.access_level IN ('office', 'admin')
    )
  );
