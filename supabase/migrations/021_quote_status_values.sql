-- New quote_status values needed by the versioning and expiry work.
--
-- 'editing'  — the quote has been taken offline to be revised. The client link
--              still resolves but shows a "changes are being made" notice rather
--              than stale figures, and acceptance is blocked. Borrowed from
--              Quotient, whose rationale is that it "protects the customer from
--              accepting something that has possibly changed".
-- 'expired'  — past valid_until. Previously expiry was displayed to the client
--              but never enforced anywhere, so a years-old quote could still be
--              accepted.
--
-- Own migration: ALTER TYPE ... ADD VALUE cannot be referenced by other
-- statements in the same transaction, so 022/023 depend on this landing first.

ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'editing';
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'expired';
