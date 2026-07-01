-- Quotes: add notes, private_notes, and valid_until columns.
-- These were used by QuoteBuilder but never added to the initial schema.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS notes         TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS private_notes TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until   DATE;
