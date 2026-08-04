-- 024_mulch_geocode_status.sql
-- Track geocoding state on mulch sites so the app can (a) backfill pins for
-- sites that were never geocoded, (b) retry ones that failed, and (c) show the
-- user which addresses couldn't be placed on the map instead of silently
-- dropping them.

ALTER TABLE mulch_sites
  ADD COLUMN IF NOT EXISTS geocoded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocode_failed BOOLEAN NOT NULL DEFAULT FALSE;
