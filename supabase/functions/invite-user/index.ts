// Invites a new team member: generates a Supabase magic-link, sends a branded
// email via Resend, and creates the user's profile row.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
//   RESEND_API_KEY, APP_URL
//
// POST body: { email, name, access_level, resource_id }

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function buildHtml(opts: { name: string; inviteUrl: string; invitedBy: string }) {
  const { name, inviteUrl, invitedBy } = opts
  const firstName = name.split(' ')[0]
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F4;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:#2C2416;border-radius:10px 10px 0 0;padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><div style="font-size:18px;font-weight:700;color:#fff">🌲 Urban Tree Services</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:3px">Wellington, New Zealand</div></td>
              <td align="right" style="color:rgba(255,255,255,0.4);font-size:12px">TreeCo</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="height:3px;background:#4A6741"></td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:32px">
          <p style="margin:0 0 16px;font-size:15px;color:#2C2416">Hi ${firstName},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6">
            <strong>${invitedBy}</strong> has invited you to join the Urban Tree Services team on <strong>TreeCo</strong> — the team's scheduling, quoting, and field ops app.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6">
            Click the button below to set up your account. This link expires in <strong>24 hours</strong>.
          </p>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td align="center">
              <a href="${inviteUrl}"
                style="display:inline-block;background:#4A6741;color:#fff;text-decoration:none;
                       padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700">
                Accept Invitation →
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#aaa;line-height:1.6">
            If the button doesn't work, copy and paste this link:<br>
            <a href="${inviteUrl}" style="color:#4A7FA5;word-break:break-all;font-size:12px">${inviteUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#2C2416;border-radius:0 0 10px 10px;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4)">
            Urban Tree Services · office@urbantreeservices.net · 027 203 1446
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ error: 'RESEND_API_KEY not set' }, 500)

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '')

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Verify caller is a full-access user
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)

  const { data: callerProfile } = await supabaseAdmin
    .from('users').select('access_level, name').eq('id', caller.id).single()

  if (callerProfile?.access_level !== 'full') {
    return json({ error: 'Forbidden — full access required' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const { email, name, access_level = 'restricted', resource_id } = body
  if (!email || !name) return json({ error: 'email and name are required' }, 400)

  // Check for existing user
  const { data: existing } = await supabaseAdmin
    .from('users').select('id').eq('email', email).single()
  if (existing) return json({ error: 'A user with that email already exists' }, 409)

  const appUrl = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'

  // Generate invite link via Supabase (bypasses their rate-limited email)
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${appUrl}/login`,
      data: { name },
    },
  })

  if (linkErr || !linkData) {
    console.error('Generate link error:', linkErr)
    return json({ error: linkErr?.message ?? 'Failed to generate invite link' }, 500)
  }

  const inviteUrl = linkData.properties?.action_link ?? linkData.properties?.hashed_token
  if (!inviteUrl) return json({ error: 'Could not extract invite URL from Supabase response' }, 500)

  // Send branded email via Resend
  const invitedBy = callerProfile?.name ?? caller.email ?? 'Your manager'
  const html = buildHtml({ name, inviteUrl, invitedBy })

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:     'Urban Tree Services <noreply@urbantreeservices.net>',
      reply_to: 'office@urbantreeservices.net',
      to:       email,
      subject:  `You've been invited to TreeCo — Urban Tree Services`,
      html,
    }),
  })

  if (!emailRes.ok) {
    const detail = await emailRes.json().catch(() => ({}))
    console.error('Resend error:', detail)
    return json({ error: 'Invite link created but email failed: ' + (detail.message ?? emailRes.status) }, 500)
  }

  // Create profile row
  const { error: profileErr } = await supabaseAdmin
    .from('users')
    .upsert({
      id:          linkData.user.id,
      email,
      name,
      access_level,
      resource_id: resource_id || null,
    }, { onConflict: 'id' })

  if (profileErr) {
    console.error('Profile error:', profileErr)
    return json({ warning: 'Invite sent but profile creation failed: ' + profileErr.message }, 207)
  }

  return json({ ok: true, user_id: linkData.user.id })
})
