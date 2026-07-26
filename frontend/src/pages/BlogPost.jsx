import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { COMPANY, BOOKING_URL } from '../config/company'

// Public, no-auth landing page for a single blog article (/blog/:slug). This is
// the page social posts link back to, so it carries the brand header and a
// prominent call-to-action to request a quote.
export default function BlogPost() {
  const { slug } = useParams()
  const [post, setPost] = useState(undefined) // undefined = loading, null = not found

  useEffect(() => {
    let live = true
    supabase.from('blog_posts')
      .select('title, excerpt, body, cover_image_url, author, published_at, slug')
      .eq('slug', slug).eq('status', 'published').maybeSingle()
      .then(({ data }) => { if (live) setPost(data ?? null) })
    return () => { live = false }
  }, [slug])

  if (post === undefined) return <div style={s.loading}>Loading…</div>
  if (post === null) return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div style={s.notFound}>
          <h1 style={s.h1}>Article not found</h1>
          <Link to="/blog" style={s.backLink}>← Back to all articles</Link>
        </div>
      </div>
    </div>
  )

  const date = post.published_at ? new Date(post.published_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div style={s.page}>
      <header style={s.brandBar}>
        <a href={`https://${COMPANY.website}`} style={s.brand}>🌲 {COMPANY.shortName}</a>
        <a href={`tel:${COMPANY.phoneRaw}`} style={s.brandPhone}>{COMPANY.phone}</a>
      </header>

      <article style={s.wrap}>
        <Link to="/blog" style={s.backLink}>← All articles</Link>
        <h1 style={s.h1}>{post.title}</h1>
        <div style={s.meta}>{[post.author, date].filter(Boolean).join(' · ')}</div>
        {post.cover_image_url && <img src={post.cover_image_url} alt="" style={s.cover} />}
        {post.excerpt && <p style={s.excerpt}>{post.excerpt}</p>}
        <div style={s.bodyText}>
          {String(post.body || '').split(/\n{2,}/).map((para, i) => <p key={i} style={s.para}>{para}</p>)}
        </div>

        {/* Call to action */}
        <div style={s.cta}>
          <div style={s.ctaTitle}>Need a tree looked at?</div>
          <div style={s.ctaSub}>Free, no-obligation quotes across {COMPANY.region}. Qualified, fully insured arborists.</div>
          <div style={s.ctaBtns}>
            <a href={BOOKING_URL} style={s.ctaPrimary}>Get a free quote</a>
            <a href={`tel:${COMPANY.phoneRaw}`} style={s.ctaGhost}>Call {COMPANY.phone}</a>
          </div>
        </div>
      </article>

      <footer style={s.footer}>© {COMPANY.name} · {COMPANY.region}, New Zealand</footer>
    </div>
  )
}

const s = {
  loading:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: 'var(--ink-3)' },
  page:     { minHeight: '100dvh', background: 'var(--cream)', color: 'var(--ink)' },
  brandBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--ink)', color: '#fff', position: 'sticky', top: 0, zIndex: 10 },
  brand:    { color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' },
  brandPhone: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  wrap:     { maxWidth: 720, margin: '0 auto', padding: '28px 20px 60px' },
  backLink: { display: 'inline-block', color: 'var(--terra)', fontSize: 13, fontWeight: 700, marginBottom: 14, textDecoration: 'none' },
  h1:       { fontSize: 30, fontWeight: 800, lineHeight: 1.2, margin: '0 0 10px', letterSpacing: '-0.5px' },
  meta:     { fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 },
  cover:    { width: '100%', borderRadius: 14, marginBottom: 22, display: 'block' },
  excerpt:  { fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.6, fontWeight: 500, margin: '0 0 20px' },
  bodyText: { fontSize: 16, lineHeight: 1.75, color: 'var(--ink)' },
  para:     { margin: '0 0 18px', whiteSpace: 'pre-wrap' },
  cta:      { marginTop: 36, padding: '26px 24px', borderRadius: 16, background: 'linear-gradient(135deg, var(--terra), var(--terra-deep))', color: '#fff', textAlign: 'center' },
  ctaTitle: { fontSize: 20, fontWeight: 800, marginBottom: 6 },
  ctaSub:   { fontSize: 14, opacity: 0.92, lineHeight: 1.55, marginBottom: 18, maxWidth: 420, marginInline: 'auto' },
  ctaBtns:  { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  ctaPrimary: { background: '#fff', color: 'var(--terra-deep)', padding: '12px 26px', borderRadius: 10, fontWeight: 800, fontSize: 15, textDecoration: 'none' },
  ctaGhost: { background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '12px 22px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', border: '1.5px solid rgba(255,255,255,0.5)' },
  footer:   { textAlign: 'center', padding: '24px 20px', color: 'var(--ink-3)', fontSize: 12 },
  notFound: { textAlign: 'center', padding: '80px 0' },
}
