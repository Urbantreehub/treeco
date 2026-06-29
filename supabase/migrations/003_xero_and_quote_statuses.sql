-- Add complete + invoiced to quote lifecycle
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'complete';
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'invoiced';

-- Xero invoice tracking on quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS xero_invoice_id     TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS xero_invoice_number TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS xero_invoice_url    TEXT;

-- Client email (may already exist from earlier migration)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email           TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS xero_contact_id TEXT;

-- Xero OAuth connection (one row per org, fixed UUID)
CREATE TABLE IF NOT EXISTS xero_connections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  tenant_name   TEXT        NOT NULL,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
