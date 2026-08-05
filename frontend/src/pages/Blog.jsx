import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { COMPANY, BOOKING_URL } from '../config/company'

// Public, no-auth index of published blog articles (/blog).
export default function Blog() {
  const [posts, setPosts] = useState(null)

  useEffect(() => {
    supabase.from('blog_posts')
      .select('slug, title, excerpt, cover_image_url, published_at')
      .eq('status', 'published').order('published_at', { ascending: false })
      .then(({ data }) => setPosts(data ?? []))
  }, [])

  return (
    <div style={s.page}>
      <header style={s.brandBar}>
        <a href={`https://${COMPANY.website}`} style={s.brand}>🌲 {COMPANY.shortName}</a>
        <a href={`tel:${COMPANY.phoneRaw}`} style={s.brandPhone}>{COMPANY.phone}</a>
      </header>

      <div style={s.wrap}>
        <h1 style={s.h1}>News & Advice</h1>
        <p style={s.intro}>Tree care tips, recent jobs and seasonal advice from the {COMPANY.shortName} crew.</p>

        {posts === null ? <div style={s.empty}>Loading…</div>
          : posts.length === 0 ? <div style={s.empty}>No articles published yet — check back soon.</div>
          : (
            <div style={s.grid}>
              {posts.map(p => (
                <Link key={p.slug} to={`/blog/${p.slug}`} style={s.cardLink}>
                  {p.cover_image_url && <img src={p.cover_image_url} alt="" style={s.cardImg} />}
                  <div style={s.cardBody}>
                    <div style={s.cardTitle}>{p.title}</div>
                    {p.excerpt && <div style={s.cardExcerpt}>{p.excerpt}</div>}
                    {p.published_at && <div style={s.cardDate}>{new Date(p.published_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}

        <div style={s.cta}>
          <a href={BOOKING_URL} style={s.ctaPrimary}>Get a free quote</a>
        </div>
      </div>
    </div>
  )
}

const s = {
  page:     { minHeight: '100dvh', background: 'var(--cream)', color: 'var(--ink)' },
  brandBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--ink)', color: '#fff' },
  brand:    { color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' },
  brandPhone: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  wrap:     { maxWidth: 900, margin: '0 auto', padding: '32px 20px 60px' },
  h1:       { fontSize: 30, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.5px' },
  intro:    { fontSize: 15, color: 'var(--ink-2)', margin: '0 0 26px', lineHeight: 1.6 },
  empty:    { color: 'var(--ink-3)', fontSize: 14, padding: '30px 0' },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 },
  cardLink: { display: 'block', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: 'inherit' },
  cardImg:  { width: '100%', height: 160, objectFit: 'cover', display: 'block' },
  cardBody: { padding: '14px 16px' },
  cardTitle:{ fontSize: 16, fontWeight: 800, lineHeight: 1.3, marginBottom: 6 },
  cardExcerpt: { fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  cardDate: { fontSize: 12, color: 'var(--ink-3)' },
  cta:      { textAlign: 'center', marginTop: 40 },
  ctaPrimary: { display: 'inline-block', background: 'var(--terra)', color: '#fff', padding: '13px 30px', borderRadius: 10, fontWeight: 800, fontSize: 15, textDecoration: 'none' },
}
