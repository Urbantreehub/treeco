// Shared messaging helpers for the SMS/email trigger functions.
//
// Centralises the phone/number/name/escape helpers that were previously
// copy-pasted into every sender, plus the Twilio send + SMS-log write and the
// copy templates for the *automated* client triggers.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const COMPANY = 'Urban Tree Services'

// ── Formatting helpers ──────────────────────────────────────────────────────

export function firstName(name: unknown): string {
  return String(name ?? 'there').trim().split(/\s+/)[0] || 'there'
}

export function nzd(v: number): string {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Normalise NZ mobile numbers to E.164 (+64…) for Twilio.
export function toE164(raw: string): string | null {
  if (!raw) return null
  const n = raw.replace(/[\s()-]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('00')) return '+' + n.slice(2)
  if (n.startsWith('0')) return '+64' + n.slice(1)
  if (n.startsWith('64')) return '+' + n
  return null
}

// ── Twilio ──────────────────────────────────────────────────────────────────

export interface SendResult {
  ok: boolean
  sid?: string
  to?: string
  error?: string
  notConfigured?: boolean
}

export async function sendTwilio(to: string, body: string): Promise<SendResult> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_FROM')
  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio not configured', notConfigured: true }
  }
  const e164 = toE164(to)
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: e164, From: from, Body: body }),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.message ?? `Twilio ${res.status}` }
  return { ok: true, sid: data.sid, to: e164 }
}

// Send an SMS and record the attempt in sms_messages. Returns the send result.
export async function sendAndLog(
  supabase: SupabaseClient,
  args: { to: string; body: string; kind: string; quote_id?: string | null; job_id?: string | null; client_id?: string | null },
): Promise<SendResult> {
  const result = await sendTwilio(args.to, args.body)
  // Don't log a "failed" row when Twilio simply isn't set up — otherwise a
  // scheduled sender records the same failure for every eligible record on
  // every run. Genuine send failures are still logged.
  if (result.notConfigured) return result
  await supabase.from('sms_messages').insert({
    to_number: args.to,
    body: args.body,
    kind: args.kind,
    quote_id: args.quote_id ?? null,
    job_id: args.job_id ?? null,
    client_id: args.client_id ?? null,
    status: result.ok ? 'sent' : 'failed',
    provider_id: result.ok ? result.sid : null,
    error: result.ok ? null : result.error,
  })
  return result
}

// ── Automated-trigger copy ──────────────────────────────────────────────────
// Kept in sync with the staff-facing one-tap templates in
// frontend/src/utils/smsTemplates.js.

export const templates = {
  quoteFollowup: (name: unknown, link: string) =>
    `Hi ${firstName(name)}, just checking you received your tree quote from ${COMPANY}? View or accept it here: ${link}`,

  bookingAck: (name: unknown) =>
    `Hi ${firstName(name)}, thanks for your enquiry to ${COMPANY} — we've received it and will be in touch within 1 business day to confirm a time.`,
}
