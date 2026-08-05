-- Lifecycle prompts for Ashley's Actions list, raised by a trigger so they fire
-- no matter who moves the job (office, truck, sync, client accept):
--   * a new residential lead      → "schedule a quote"
--   * a job marked complete       → "ready to invoice"
--   * a job marked invoiced       → auto-resolves its "ready to invoice" prompt
--
-- Portal (Spencers/Downer) jobs are detected by ko_reference and skipped for the
-- new-lead prompt — they have their own portal alert flow. We avoid referencing
-- a `category` column here on purpose (it may not exist in every environment).

CREATE OR REPLACE FUNCTION job_lifecycle_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;  -- status didn't change
  END IF;

  -- New residential lead → prompt to schedule a quote.
  IF NEW.status = 'new_lead' AND NEW.ko_reference IS NULL THEN
    INSERT INTO job_alerts (job_id, kind, title, detail, source, dedupe_key)
    VALUES (NEW.id, 'new_lead', 'New lead — schedule a quote',
            'A new enquiry came in. Book a time to quote it.',
            'residential', NEW.id::text || ':new_lead')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  -- Job marked complete → prompt to invoice.
  IF NEW.status = 'complete_to_invoice' THEN
    INSERT INTO job_alerts (job_id, kind, title, detail, source, dedupe_key)
    VALUES (NEW.id, 'to_invoice', 'Work complete — ready to invoice',
            'This job was marked complete. Raise the invoice when ready.',
            'internal', NEW.id::text || ':to_invoice')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  -- Invoiced → clear the "ready to invoice" prompt.
  IF NEW.status = 'invoiced' THEN
    UPDATE job_alerts SET status = 'done', actioned_at = NOW()
    WHERE job_id = NEW.id AND kind = 'to_invoice' AND status = 'open';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_lifecycle_alert ON jobs;
CREATE TRIGGER trg_job_lifecycle_alert
  AFTER INSERT OR UPDATE OF status ON jobs
  FOR EACH ROW EXECUTE FUNCTION job_lifecycle_alert();
