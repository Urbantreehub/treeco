// Internal notification recipients — one list, used by every function that
// emails the office about a lead, an acceptance, a decline or a client comment.
//
// Override without a redeploy by setting the NOTIFY_EMAILS secret to a
// comma-separated list. Default: Josh and the office inbox (Ashley).

const DEFAULT_RECIPIENTS = ['josh@urbantreeservices.net', 'office@urbantreeservices.net']

export const NOTIFY_RECIPIENTS: string[] = (() => {
  const raw = Deno.env.get('NOTIFY_EMAILS') ?? ''
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_RECIPIENTS
})()

export const NOTIFY_FROM = 'TreeCo <office@urbantreeservices.net>'
