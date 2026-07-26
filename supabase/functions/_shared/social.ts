// Shared social-publishing logic used by both `social-publish` (publish one post
// on demand) and `social-scheduler` (publish everything that's due). Keeping the
// per-platform API calls here means there's a single place to fix when a
// platform changes its endpoint.
//
// Each publisher returns a PublishResult; publishPost() fans a marketing_posts
// row out across its selected platforms, collects the results, and writes the
// final status/results back to the row.
//
// Required Edge Function secrets (only the ones for connected platforms matter):
//   META_GRAPH_VERSION           — optional, defaults to v21.0
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — for refreshing the GBP token
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') ?? 'v21.0'}`

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export type Platform = 'facebook' | 'instagram' | 'google_business' | 'linkedin'

export interface Connection {
  platform: Platform
  account_id: string | null
  account_name: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  meta: Record<string, unknown>
}

export interface MarketingPost {
  id: string
  body: string
  link_url: string | null
  cta_label: string | null
  image_urls: string[]
  platforms: Platform[]
}

export interface PublishResult {
  ok: boolean
  id?: string
  url?: string
  error?: string
}

// Map platform → connection row, for quick lookup.
export async function loadConnections(supabase: SupabaseClient): Promise<Record<string, Connection>> {
  const { data } = await supabase.from('social_connections').select('*')
  const out: Record<string, Connection> = {}
  for (const row of data ?? []) out[row.platform] = row as Connection
  return out
}

// ── Facebook Page ───────────────────────────────────────────────────────────
// One photo → direct photo post. Many → upload each unpublished, then a feed
// post that attaches them. None → a plain feed post with the link preview.
// The CTA link is appended to the caption on photo posts (Facebook ignores a
// separate `link` param when a photo is attached).
async function publishFacebook(conn: Connection, post: MarketingPost): Promise<PublishResult> {
  const pageId = conn.account_id
  const token = conn.access_token
  if (!pageId) return { ok: false, error: 'No Facebook Page selected' }

  const linkLine = post.link_url ? `\n\n${post.cta_label ? post.cta_label + ': ' : ''}${post.link_url}` : ''
  const imgs = post.image_urls ?? []

  try {
    if (imgs.length === 0) {
      const res = await fetch(`${GRAPH}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ message: post.body, ...(post.link_url ? { link: post.link_url } : {}), access_token: token }),
      })
      const d = await res.json()
      if (!res.ok) return { ok: false, error: d.error?.message ?? 'Facebook feed post failed' }
      return { ok: true, id: d.id, url: `https://www.facebook.com/${d.id}` }
    }

    if (imgs.length === 1) {
      const res = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ url: imgs[0], caption: post.body + linkLine, access_token: token }),
      })
      const d = await res.json()
      if (!res.ok) return { ok: false, error: d.error?.message ?? 'Facebook photo post failed' }
      return { ok: true, id: d.post_id ?? d.id, url: d.post_id ? `https://www.facebook.com/${d.post_id}` : undefined }
    }

    // Multiple photos: upload each unpublished, collect ids, attach to one post.
    const mediaFbids: { media_fbid: string }[] = []
    for (const url of imgs.slice(0, 10)) {
      const up = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ url, published: 'false', access_token: token }),
      })
      const ud = await up.json()
      if (up.ok && ud.id) mediaFbids.push({ media_fbid: ud.id })
    }
    if (mediaFbids.length === 0) return { ok: false, error: 'Facebook photo uploads failed' }
    const body = new URLSearchParams({ message: post.body + linkLine, access_token: token })
    mediaFbids.forEach((m, i) => body.append(`attached_media[${i}]`, JSON.stringify(m)))
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    })
    const d = await res.json()
    if (!res.ok) return { ok: false, error: d.error?.message ?? 'Facebook multi-photo post failed' }
    return { ok: true, id: d.id, url: `https://www.facebook.com/${d.id}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── Instagram (Business) ─────────────────────────────────────────────────────
// IG needs at least one image. Single image → container + publish. Multiple →
// carousel. The CTA link can't be a clickable link in an IG caption, so it's
// appended as text (the account's link-in-bio still applies).
async function publishInstagram(conn: Connection, post: MarketingPost): Promise<PublishResult> {
  const igUser = conn.account_id
  const token = conn.access_token
  const imgs = post.image_urls ?? []
  if (!igUser) return { ok: false, error: 'No Instagram account selected' }
  if (imgs.length === 0) return { ok: false, error: 'Instagram posts need at least one photo' }

  const caption = post.body + (post.link_url ? `\n\n${post.cta_label ?? 'More'}: ${post.link_url}` : '')

  async function createContainer(params: Record<string, string>): Promise<string | null> {
    const res = await fetch(`${GRAPH}/${igUser}/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: token }),
    })
    const d = await res.json()
    return res.ok ? d.id : null
  }

  try {
    let creationId: string | null
    if (imgs.length === 1) {
      creationId = await createContainer({ image_url: imgs[0], caption })
    } else {
      const children: string[] = []
      for (const url of imgs.slice(0, 10)) {
        const c = await createContainer({ image_url: url, is_carousel_item: 'true' })
        if (c) children.push(c)
      }
      if (children.length === 0) return { ok: false, error: 'Instagram child uploads failed' }
      creationId = await createContainer({ media_type: 'CAROUSEL', caption, children: children.join(',') })
    }
    if (!creationId) return { ok: false, error: 'Instagram media container failed' }

    const pub = await fetch(`${GRAPH}/${igUser}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: creationId, access_token: token }),
    })
    const pd = await pub.json()
    if (!pub.ok) return { ok: false, error: pd.error?.message ?? 'Instagram publish failed' }
    return { ok: true, id: pd.id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── Google Business Profile (local post) ─────────────────────────────────────
// Refresh the Google access token first if it's expired, then create a local
// post with a call-to-action button and (optionally) the first photo.
async function ensureGoogleToken(conn: Connection, supabase: SupabaseClient): Promise<string> {
  const fresh = conn.expires_at && new Date(conn.expires_at).getTime() > Date.now() + 60_000
  if (fresh || !conn.refresh_token) return conn.access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const d = await res.json()
  if (!res.ok || !d.access_token) return conn.access_token // fall back; publish will surface the error
  await supabase.from('social_connections').update({
    access_token: d.access_token,
    expires_at: new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString(),
  }).eq('platform', 'google_business')
  return d.access_token
}

// GBP button action types — map our CTA label to the closest Google action.
function gbpActionType(label: string | null): string {
  const l = (label ?? '').toLowerCase()
  if (/book/.test(l)) return 'BOOK'
  if (/call/.test(l)) return 'CALL'
  if (/buy|shop|order/.test(l)) return 'ORDER'
  if (/sign ?up|subscribe/.test(l)) return 'SIGN_UP'
  return 'LEARN_MORE'
}

async function publishGoogleBusiness(conn: Connection, post: MarketingPost, supabase: SupabaseClient): Promise<PublishResult> {
  const location = conn.account_id // e.g. "accounts/123/locations/456"
  if (!location) return { ok: false, error: 'No Google Business location selected' }

  try {
    const token = await ensureGoogleToken(conn, supabase)
    const payload: Record<string, unknown> = {
      languageCode: 'en-NZ',
      summary: post.body,
      topicType: 'STANDARD',
    }
    if (post.link_url) {
      payload.callToAction = { actionType: gbpActionType(post.cta_label), url: post.link_url }
    }
    if (post.image_urls?.[0]) {
      payload.media = [{ mediaFormat: 'PHOTO', sourceUrl: post.image_urls[0] }]
    }
    const res = await fetch(`https://mybusiness.googleapis.com/v4/${location}/localPosts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await res.json()
    if (!res.ok) return { ok: false, error: d.error?.message ?? 'Google Business post failed' }
    return { ok: true, id: d.name, url: d.searchUrl }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── LinkedIn (organization/person share) ─────────────────────────────────────
// Text + article link (the link renders a preview card with the CTA). Native
// image upload needs the asset-registration flow; for now the link preview
// carries the image, which keeps the CTA click-through intact.
async function publishLinkedIn(conn: Connection, post: MarketingPost): Promise<PublishResult> {
  const author = conn.account_id // "urn:li:organization:123" or "urn:li:person:abc"
  const token = conn.access_token
  if (!author) return { ok: false, error: 'No LinkedIn author selected' }

  const media = post.link_url
    ? {
        shareMediaCategory: 'ARTICLE',
        media: [{ status: 'READY', originalUrl: post.link_url,
          ...(post.image_urls?.[0] ? { thumbnails: [{ url: post.image_urls[0] }] } : {}) }],
      }
    : { shareMediaCategory: 'NONE' }

  const payload = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: post.body },
        ...media,
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return { ok: false, error: d.message ?? `LinkedIn share failed (${res.status})` }
    }
    const id = res.headers.get('x-restli-id') ?? undefined
    return { ok: true, id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function publishOne(
  platform: Platform, conn: Connection, post: MarketingPost, supabase: SupabaseClient,
): Promise<PublishResult> {
  switch (platform) {
    case 'facebook':        return publishFacebook(conn, post)
    case 'instagram':       return publishInstagram(conn, post)
    case 'google_business': return publishGoogleBusiness(conn, post, supabase)
    case 'linkedin':        return publishLinkedIn(conn, post)
    default:                return { ok: false, error: `Unknown platform ${platform}` }
  }
}

// Fan a post out across its selected platforms and persist the outcome.
// Returns the per-platform results map.
export async function publishPost(
  supabase: SupabaseClient, post: MarketingPost,
): Promise<{ status: string; results: Record<string, PublishResult> }> {
  const conns = await loadConnections(supabase)
  const results: Record<string, PublishResult> = {}
  const targets = (post.platforms ?? []).filter(Boolean)

  for (const platform of targets) {
    const conn = conns[platform]
    if (!conn) { results[platform] = { ok: false, error: 'Not connected' }; continue }
    results[platform] = await publishOne(platform, conn, post, supabase)
  }

  const oks = Object.values(results).filter(r => r.ok).length
  const status = targets.length === 0 ? 'failed'
    : oks === targets.length ? 'published'
    : oks === 0 ? 'failed'
    : 'partial'

  const firstError = Object.values(results).find(r => !r.ok)?.error ?? null
  await supabase.from('marketing_posts').update({
    status,
    results,
    error: status === 'published' ? null : firstError,
    published_at: oks > 0 ? new Date().toISOString() : null,
  }).eq('id', post.id)

  return { status, results }
}
