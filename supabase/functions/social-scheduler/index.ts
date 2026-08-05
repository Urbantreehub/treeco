// Publishes every scheduled marketing_post whose time has come. Intended to be
// run by a Supabase scheduled cron (e.g. every 5 minutes), but is safe to call
// manually — it only picks up rows with status='scheduled' and scheduled_at in
// the past, and flips each to 'publishing' before working it so a second run
// won't double-post.
//
// Respects the app_settings.marketing_autopost_enabled flag: when that's false
// (the default), nothing is auto-published — posts just wait in the queue.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY + the platform
// secrets used by _shared/social.ts.

import { CORS, json, serviceClient, publishPost, MarketingPost } from '../_shared/social.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = serviceClient()

  // Auto-post kill switch (paused by default, like the DBS portal sync).
  const { data: flag } = await supabase
    .from('app_settings').select('value').eq('key', 'marketing_autopost_enabled').maybeSingle()
  if (flag?.value !== true) {
    return json({ ok: true, published: 0, message: 'Auto-posting is paused' })
  }

  const nowIso = new Date().toISOString()
  const { data: due } = await supabase
    .from('marketing_posts')
    .select('id, body, link_url, cta_label, image_urls, platforms')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(25)

  if (!due || due.length === 0) return json({ ok: true, published: 0, message: 'Nothing due' })

  const summary: { id: string; status: string }[] = []
  for (const post of due) {
    // Claim the row so a concurrent run skips it.
    const { data: claimed } = await supabase
      .from('marketing_posts')
      .update({ status: 'publishing' })
      .eq('id', post.id)
      .eq('status', 'scheduled') // only if still scheduled
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    try {
      const { status } = await publishPost(supabase, post as MarketingPost)
      summary.push({ id: post.id, status })
    } catch (err) {
      await supabase.from('marketing_posts')
        .update({ status: 'failed', error: (err as Error).message }).eq('id', post.id)
      summary.push({ id: post.id, status: 'failed' })
    }
  }

  return json({ ok: true, processed: summary.length, results: summary })
})
