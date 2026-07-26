// Inbound email lead intake — Postmark inbound webhook → new client + 'new_lead' job.
//
// Postmark POSTs a JSON payload for each inbound email. We create/find a client by
// sender email, open a new_lead job, store image attachments in the public 'job-media'
// bucket as job_photos (kind='lead_reference'), and optionally notify the office.
//
// Webhook URL to configure in Postmark (inbound stream):
//   https://<project-ref>.supabase.co/functions/v1/inbound-lead?token=<INBOUND_LEAD_TOKEN>
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INBOUND_LEAD_TOKEN
// Optional secrets: RESEND_API_KEY, APP_URL

import { createClient } from 'npm:@supabase/supabase-js@2'
import { firstName } from '../_shared/notify.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-lead-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Postmark attachment ContentType → file extension (fallback to name / bin).
function pickExt(name?: string, contentType?: string): string {
  const fromName = name?.includes('.') ? name.split('.').pop() : undefined
  if (fromName) return fromName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
    'image/heif': 'heif', 'image/tiff': 'tiff', 'image/bmp': 'bmp',
  }
  return map[(contentType || '').toLowerCase()] || 'bin'
}

// base64 → Uint8Array (Deno atob).
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function headerVal(headers: any[], name: string): string {
  const h = (headers ?? []).find((x: any) => (x?.Name ?? '').toLowerCase() === name.toLowerCase())
  return h?.Value ?? ''
}

// Guard the auto-acknowledgement against mail loops and backscatter: don't
// auto-reply to auto-responders (out-of-office), bounces, no-reply/daemon
// senders, or our own address — any of which could bounce back into this
// webhook and create an endless lead+ack loop.
function isAutomatedSender(payload: any, fromEmail: string, subject: string): boolean {
  const headers = payload?.Headers ?? []
  const autoSubmitted = headerVal(headers, 'Auto-Submitted').toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  const precedence = headerVal(headers, 'Precedence').toLowerCase()
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true
  if (headerVal(headers, 'X-Auto-Response-Suppress') || headerVal(headers, 'X-Autoreply') || headerVal(headers, 'X-Autorespond')) return true
  const f = (fromEmail ?? '').toLowerCase()
  if (/mailer-daemon|postmaster|no-?reply|do-?not-?reply|donotreply|bounce/.test(f)) return true
  if (f === 'office@urbantreeservices.net' || f === 'noreply@urbantreeservices.net') return true
  if (/^\s*(out of office|automatic reply|auto[- ]?reply|undeliverable|delivery status|returned mail|read:|declined:|accepted:)/i.test(subject ?? '')) return true
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Auth: shared secret via ?token= or x-lead-token header ─────────
    const expected = Deno.env.get('INBOUND_LEAD_TOKEN')
    if (expected) {
      const url = new URL(req.url)
      const provided = url.searchParams.get('token') || req.headers.get('x-lead-token')
      if (!provided || provided !== expected) return json({ error: 'Unauthorized' }, 401)
    } else {
      console.warn('INBOUND_LEAD_TOKEN not set — accepting webhook without auth')
    }

    // ── 2. Parse Postmark payload + resolve sender ───────────────────────
    const payload = await req.json().catch(() => ({}))
    const {
      FromName, From, FromFull, Subject,
      TextBody, HtmlBody, Attachments,
    } = payload ?? {}

    const email: string | null = FromFull?.Email || From || null
    const name: string =
      FromFull?.Name || FromName ||
      (email ? email.split('@')[0] : '') || 'Email Lead'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 3. Find or create client by email ────────────────────────────────
    let clientId: string | null = null
    if (email) {
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      clientId = existing?.id ?? null
    }
    if (!clientId) {
      const { data: created, error: clientErr } = await supabase
        .from('clients')
        .insert({ name, email })
        .select('id')
        .single()
      if (clientErr) throw clientErr
      clientId = created.id
    }

    // ── 4. Create the new_lead job ───────────────────────────────────────
    const title = Subject
      ? ('[LEAD] ' + Subject).slice(0, 120)
      : ('[LEAD] Email enquiry — ' + name).slice(0, 120)

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        client_id:   clientId,
        title,
        status:      'new_lead',
        description: TextBody?.slice(0, 2000) || null,
        enquiry_raw: (TextBody || HtmlBody || '')?.slice(0, 20000) || null,
        lead_source: 'email',
      })
      .select('id')
      .single()
    if (jobErr) throw jobErr
    const jobId: string = job.id

    // ── 5. Store image attachments → job-media bucket + job_photos ────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const attachments: any[] = Array.isArray(Attachments) ? Attachments : []
    let images = 0

    for (const att of attachments) {
      const contentType: string = att?.ContentType || ''
      if (!contentType.toLowerCase().startsWith('image/')) continue
      if (!att?.Content) continue

      try {
        const bytes = b64ToBytes(att.Content)
        const ext   = pickExt(att.Name, contentType)
        const path  = `${jobId}/${crypto.randomUUID()}.${ext}`

        const { error: upErr } = await supabase.storage
          .from('job-media')
          .upload(path, bytes, { contentType, upsert: false })
        if (upErr) { console.error('upload failed', upErr); continue }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/job-media/${path}`
        const { error: photoErr } = await supabase
          .from('job_photos')
          .insert({ job_id: jobId, url: publicUrl, caption: att.Name || null, kind: 'lead_reference' })
        if (photoErr) { console.error('job_photos insert failed', photoErr); continue }

        images++
      } catch (attErr) {
        console.error('attachment processing failed', attErr)
      }
    }

    // ── 6. Optional office notification (never fails the webhook) ─────────
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      try {
        const appUrl  = Deno.env.get('APP_URL') || 'https://app.urbantreeservices.net'
        const preview = (TextBody || '').slice(0, 400)
        const subject = '🌿 New lead: ' + (Subject || name)
        const esc = (s: string) => String(s || '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:10px;border:1px solid #E2DDD6;overflow:hidden">
        <tr><td style="background:#4A6741;padding:20px 28px">
          <div style="font-size:22px;font-weight:700;color:#fff">🌿 New Email Lead</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <div style="font-size:15px;font-weight:700;color:#2C2416;margin-bottom:4px">${esc(name)}</div>
          ${email ? `<div style="font-size:13px;color:#555;margin-bottom:16px">${esc(email)}</div>` : ''}
          ${Subject ? `<div style="font-size:14px;color:#2C2416;margin-bottom:12px"><strong>Subject:</strong> ${esc(Subject)}</div>` : ''}
          <div style="font-size:13px;color:#555;white-space:pre-wrap;background:#FAF8F4;border:1px solid #E2DDD6;border-radius:8px;padding:14px 16px;margin-bottom:16px">${esc(preview) || '(no message body)'}</div>
          <div style="font-size:12px;color:#aaa;margin-bottom:20px">${images} image${images === 1 ? '' : 's'} attached</div>
          <div style="text-align:center">
            <a href="${appUrl}" style="display:inline-block;background:#4A6741;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px">
              Open Pipeline in TreeCo →
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#FAF8F4;padding:14px 28px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #E2DDD6">
          Urban Tree Services · office@urbantreeservices.net · 027 203 1446
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'TreeCo <office@urbantreeservices.net>',
            to:      'office@urbantreeservices.net',
            subject,
            html,
          }),
        })
      } catch (mailErr) {
        console.error('office notification failed', mailErr)
      }
    }

    // ── 6b. Acknowledge the enquirer by email (best-effort) ──────────────
    if (resendKey && email && !isAutomatedSender(payload, email, Subject)) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Urban Tree Services <office@urbantreeservices.net>',
            to: email,
            reply_to: 'office@urbantreeservices.net',
            subject: 'We\'ve received your enquiry — Urban Tree Services',
            html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#22384F">
              <p style="font-size:15px">Hi ${firstName(name)},</p>
              <p style="font-size:15px;line-height:1.5">Thanks for getting in touch with Urban Tree Services — we've received your enquiry and will be in touch within 1 business day to confirm a time.</p>
              <p style="font-size:14px;color:#555">Ngā mihi,<br>The Urban Tree Services team</p>
            </div>`,
          }),
        })
      } catch (ackErr) {
        console.error('enquirer acknowledgement failed', ackErr)
      }
    }

    // ── 7. Done ──────────────────────────────────────────────────────────
    return json({ ok: true, job_id: jobId, images })
  } catch (err) {
    console.error('inbound-lead error', err)
    return json({ error: String(err) }, 500)
  }
})
