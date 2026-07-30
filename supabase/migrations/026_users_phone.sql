-- Staff contact number, used by the relay-message function to text a team
-- member a DM from the office. Email already lives on users.email. Idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
