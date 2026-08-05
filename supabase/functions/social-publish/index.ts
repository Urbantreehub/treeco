// Publishes a single marketing_post to its selected platforms right now.
// Called from the Marketing composer's "Publish now" button.
//
// POST body: { post_id }
// Auth: caller must be a signed-in full/office user (Bearer session token).
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, plus the platform
// secrets used by _shared/social.ts (META_*, GOOGLE_*, LINKEDIN_*).

import { CORS, json, serviceClient, publishPost, MarketingPost } from '../_shared/social.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = serviceClient()

  // Verify caller is a full/office user.
  const callerToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)
  const { data: profile } = await supabase.from('users').select('access_level').eq('id', caller.id).single()
  if (!['full', 'office'].includes(profile?.access_level ?? '')) {
    return json({ error: 'Forbidden — office access required' }, 403)
  }

  const { post_id } = await req.json().catch(() => ({}))
  if (!post_id) return json({ error: 'Missing post_id' }, 400)

  const { data: post } = await supabase
    .from('marketing_posts')
    .select('id, body, link_url, cta_label, image_urls, platforms')
    .eq('id', post_id)
    .single()
  if (!post) return json({ error: 'Post not found' }, 404)
  if (!post.platforms?.length) return json({ error: 'No platforms selected' }, 400)

  // Mark as publishing so a concurrent scheduler run skips it.
  await supabase.from('marketing_posts').update({ status: 'publishing' }).eq('id', post_id)

  try {
    const { status, results } = await publishPost(supabase, post as MarketingPost)
    return json({ ok: status === 'published', status, results })
  } catch (err) {
    await supabase.from('marketing_posts').update({ status: 'failed', error: (err as Error).message }).eq('id', post_id)
    return json({ error: (err as Error).message }, 500)
  }
})
