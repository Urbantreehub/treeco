-- 019_quote_ownership.sql
-- Adds ownership columns to quotes so each quote can be attributed to a team
-- member (created_by) and record who last edited it (updated_by).
--
-- This is the foundation for the dashboard "filter by team member" view and for
-- per-person quote analytics (win rate by author, etc). Both columns are
-- nullable: quotes created before this migration have no recorded owner and
-- surface in the UI as "Unassigned".

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Owner filter on the dashboard queries by created_by, so index it.
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON quotes(created_by);
