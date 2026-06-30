-- Job Pack: operations checklist attached to quotes, surfaced in the Work Order.
-- Stores crew-facing planning info: time, staff, equipment, tools, difficulty.
-- Separate from quote line items (no pricing) — not shown to the client.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS job_pack JSONB NOT NULL DEFAULT '{}';
