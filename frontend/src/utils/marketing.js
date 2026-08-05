// Pure helpers for the social media & marketing programme. Kept dependency-free
// so they can be unit-tested and reused by the composer, the queue, and the
// blog editor.

// The channels we publish to. `needsImage` platforms are skipped (with a warning)
// when a post has no photo. `label`/`color` drive the UI chips.
export const PLATFORMS = [
  { key: 'facebook',        label: 'Facebook',        short: 'FB', color: '#1877F2', needsImage: false },
  { key: 'instagram',       label: 'Instagram',       short: 'IG', color: '#E1306C', needsImage: true  },
  { key: 'google_business', label: 'Google Business', short: 'GB', color: '#4285F4', needsImage: false },
  { key: 'linkedin',        label: 'LinkedIn',        short: 'in', color: '#0A66C2', needsImage: false },
]

export const PLATFORM_LABELS = Object.fromEntries(PLATFORMS.map(p => [p.key, p.label]))

// URL-safe slug from a title. Falls back to a timestamped stub if the title has
// no usable characters, so a slug is always produced.
export function slugify(title = '', fallback = 'post') {
  const base = String(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')      // strip accents
    .replace(/[^a-z0-9]+/g, '-')          // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '')              // trim leading/trailing hyphens
    .slice(0, 80)
    .replace(/-+$/g, '')
  return base || fallback
}

// Validate a post before it can be scheduled/published. Returns { errors, warnings }.
// errors block publishing; warnings are advisory (e.g. a platform that will be
// skipped because it requires a photo the post doesn't have).
export function validatePost({ body = '', platforms = [], imageUrls = [], scheduledAt = null } = {}) {
  const errors = []
  const warnings = []

  if (!body.trim() && imageUrls.length === 0) errors.push('Add a caption or at least one photo')
  if (!platforms || platforms.length === 0) errors.push('Choose at least one channel to post to')

  const hasImage = imageUrls.length > 0
  for (const key of platforms) {
    const p = PLATFORMS.find(x => x.key === key)
    if (p?.needsImage && !hasImage) warnings.push(`${p.label} needs a photo — it will be skipped`)
  }

  if (scheduledAt) {
    const t = new Date(scheduledAt).getTime()
    if (Number.isNaN(t)) errors.push('Schedule time is invalid')
    else if (t < Date.now() - 60_000) errors.push('Schedule time is in the past')
  }

  return { errors, warnings, ok: errors.length === 0 }
}

// The channels that will actually receive a post, given its photos (drops
// image-only platforms when there's no image).
export function effectivePlatforms(platforms = [], imageUrls = []) {
  const hasImage = imageUrls.length > 0
  return platforms.filter(key => {
    const p = PLATFORMS.find(x => x.key === key)
    return !(p?.needsImage && !hasImage)
  })
}

// Compose the social post that promotes a blog article: caption from the
// excerpt/title, link to the public blog page, cover image, and a CTA.
export function buildBlogSocialPost(blog, { blogBaseUrl, ctaLabel } = {}) {
  const url = `${(blogBaseUrl ?? '').replace(/\/$/, '')}/${blog.slug}`
  const caption = [blog.title, blog.excerpt].filter(Boolean).join('\n\n')
  return {
    kind: 'blog',
    blog_id: blog.id,
    title: blog.title,
    body: caption,
    link_url: url,
    cta_label: ctaLabel ?? 'Read more',
    image_urls: blog.cover_image_url ? [blog.cover_image_url] : [],
  }
}

// Human summary of a post's per-platform results map ({facebook:{ok:true},…}).
export function summariseResults(results = {}) {
  const entries = Object.entries(results)
  const ok = entries.filter(([, r]) => r?.ok).length
  return { ok, total: entries.length, failed: entries.filter(([, r]) => !r?.ok) }
}

// Badge colour + label for a marketing_post status.
export const STATUS_META = {
  draft:      { label: 'Draft',     bg: '#EEE',     fg: '#666' },
  scheduled:  { label: 'Scheduled', bg: '#FDF3E3',  fg: '#B87309' },
  publishing: { label: 'Posting…',  bg: '#E3F0FB',  fg: '#1565C0' },
  published:  { label: 'Posted',    bg: '#E8F0E6',  fg: '#3A5C2E' },
  partial:    { label: 'Partial',   bg: '#FDF3E3',  fg: '#B87309' },
  failed:     { label: 'Failed',    bg: '#FDECEA',  fg: '#C0392B' },
}
