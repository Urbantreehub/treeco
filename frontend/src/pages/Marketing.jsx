import { useState, useEffect, useRef } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { MARKETING } from '../config/company'
import {
  PLATFORMS, PLATFORM_LABELS, STATUS_META, slugify,
  validatePost, effectivePlatforms, buildBlogSocialPost, summariseResults,
} from '../utils/marketing'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FN = SUPABASE_URL + '/functions/v1'

// ── Shared helpers ───────────────────────────────────────────────────────────
async function uploadImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('marketing-media').upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  return supabase.storage.from('marketing-media').getPublicUrl(path).data.publicUrl
}

async function callPublishNow(postId) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FN}/social-publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ post_id: postId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Publish failed')
  return body
}

function fmtWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// A local <input type="datetime-local"> value → ISO, treating it as local time.
function localToIso(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Platform chips (connected vs not) ────────────────────────────────────────
function PlatformPicker({ selected, connected, onToggle }) {
  return (
    <div style={st.chipRow}>
      {PLATFORMS.map(p => {
        const isConn = connected.has(p.key)
        const on = selected.includes(p.key)
        return (
          <button
            key={p.key}
            type="button"
            disabled={!isConn}
            onClick={() => onToggle(p.key)}
            title={isConn ? '' : 'Connect this channel in Settings → Integrations'}
            style={{
              ...st.chip,
              borderColor: on ? p.color : 'var(--border)',
              background: on ? p.color : '#fff',
              color: on ? '#fff' : isConn ? 'var(--ink)' : '#bbb',
              opacity: isConn ? 1 : 0.6,
              cursor: isConn ? 'pointer' : 'not-allowed',
            }}
          >
            {p.label}{!isConn && ' ·'}
          </button>
        )
      })}
    </div>
  )
}

// ── Composer ─────────────────────────────────────────────────────────────────
function Composer({ connected, editing, onSaved, onCancelEdit, toast }) {
  const { profile } = useAuth()
  const blank = {
    body: '', link_url: MARKETING.defaultCtaUrl, cta_label: MARKETING.defaultCtaLabel,
    image_urls: [], platforms: MARKETING.defaultPlatforms.filter(p => connected.has(p)),
    schedule: false, scheduled_at: '',
  }
  const [form, setForm] = useState(blank)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (editing) {
      setForm({
        body: editing.body ?? '', link_url: editing.link_url ?? '', cta_label: editing.cta_label ?? '',
        image_urls: editing.image_urls ?? [], platforms: editing.platforms ?? [],
        schedule: !!editing.scheduled_at, scheduled_at: isoToLocalInput(editing.scheduled_at),
      })
    }
  }, [editing])

  function set(patch) { setForm(f => ({ ...f, ...patch })) }
  function togglePlatform(key) {
    set({ platforms: form.platforms.includes(key) ? form.platforms.filter(k => k !== key) : [...form.platforms, key] })
  }

  async function onFiles(e) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      const urls = []
      for (const f of files) urls.push(await uploadImage(f))
      set({ image_urls: [...form.image_urls, ...urls] })
    } catch (err) {
      toast('Upload failed: ' + err.message, true)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const scheduledIso = form.schedule ? localToIso(form.scheduled_at) : null
  const { errors, warnings } = validatePost({
    body: form.body, platforms: form.platforms, imageUrls: form.image_urls, scheduledAt: scheduledIso,
  })

  function rowFrom(status) {
    return {
      kind: 'post',
      body: form.body,
      link_url: form.link_url || null,
      cta_label: form.cta_label || null,
      image_urls: form.image_urls,
      platforms: effectivePlatforms(form.platforms, form.image_urls),
      status,
      scheduled_at: scheduledIso,
      created_by: profile?.id ?? null,
    }
  }

  async function save(status) {
    setBusy(true)
    try {
      const row = rowFrom(status)
      let id = editing?.id
      if (id) {
        const { error } = await supabase.from('marketing_posts').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('marketing_posts').insert(row).select('id').single()
        if (error) throw error
        id = data.id
      }
      toast(status === 'scheduled' ? 'Post scheduled ✓' : 'Draft saved')
      setForm(blank)
      onSaved()
      return id
    } catch (err) {
      toast('Could not save: ' + err.message, true)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function publishNow() {
    if (errors.length) return
    setBusy(true)
    try {
      // Persist as publishing, then invoke the edge function.
      const row = rowFrom('publishing')
      let id = editing?.id
      if (id) await supabase.from('marketing_posts').update(row).eq('id', id)
      else {
        const { data, error } = await supabase.from('marketing_posts').insert(row).select('id').single()
        if (error) throw error
        id = data.id
      }
      const res = await callPublishNow(id)
      const { ok, failed } = summariseResults(res.results ?? {})
      toast(res.status === 'published' ? `Posted to ${ok} channel${ok === 1 ? '' : 's'} ✓`
        : res.status === 'partial' ? `Posted to ${ok}, ${failed.length} failed — see queue`
        : 'Publishing failed — see queue', res.status !== 'published')
      setForm(blank)
      onSaved()
    } catch (err) {
      toast('Publish failed: ' + err.message, true)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={st.card}>
      <div style={st.cardTitle}>{editing ? 'Edit post' : 'New post'}</div>

      <textarea
        style={st.textarea}
        rows={4}
        placeholder="What do you want to share? e.g. Big oak removal in Karori today — safe, tidy, and all cleaned up. Free quotes anytime."
        value={form.body}
        onChange={e => set({ body: e.target.value })}
      />

      {/* Photos */}
      <div style={st.thumbRow}>
        {form.image_urls.map((u, i) => (
          <div key={u} style={st.thumbWrap}>
            <img src={u} alt="" style={st.thumb} />
            <button type="button" style={st.thumbX} onClick={() => set({ image_urls: form.image_urls.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button type="button" style={st.addThumb} onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? '…' : '+ Photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>

      {/* CTA */}
      <div style={st.row2}>
        <div style={st.field}>
          <label style={st.label}>Call-to-action link</label>
          <input style={st.input} placeholder="https://…" value={form.link_url} onChange={e => set({ link_url: e.target.value })} />
        </div>
        <div style={st.field}>
          <label style={st.label}>Button / CTA text</label>
          <input style={st.input} placeholder="Get a free quote" value={form.cta_label} onChange={e => set({ cta_label: e.target.value })} />
        </div>
      </div>

      {/* Platforms */}
      <div style={st.field}>
        <label style={st.label}>Post to</label>
        <PlatformPicker selected={form.platforms} connected={connected} onToggle={togglePlatform} />
      </div>

      {/* Schedule */}
      <div style={st.scheduleRow}>
        <label style={st.radio}>
          <input type="radio" checked={!form.schedule} onChange={() => set({ schedule: false })} /> Publish now
        </label>
        <label style={st.radio}>
          <input type="radio" checked={form.schedule} onChange={() => set({ schedule: true })} /> Schedule
        </label>
        {form.schedule && (
          <input type="datetime-local" style={{ ...st.input, maxWidth: 220 }} value={form.scheduled_at}
            onChange={e => set({ scheduled_at: e.target.value })} />
        )}
      </div>

      {warnings.map(w => <div key={w} style={st.warn}>⚠ {w}</div>)}
      {errors.length > 0 && <div style={st.err}>{errors.join(' · ')}</div>}

      <div style={st.actions}>
        {editing && <button style={st.btnGhost} onClick={onCancelEdit} disabled={busy}>Cancel</button>}
        <button style={st.btnGhost} onClick={() => save('draft')} disabled={busy}>Save draft</button>
        {form.schedule
          ? <button style={st.btnPrimary} onClick={() => save('scheduled')} disabled={busy || errors.length > 0}>{busy ? 'Saving…' : 'Schedule post'}</button>
          : <button style={st.btnPrimary} onClick={publishNow} disabled={busy || errors.length > 0}>{busy ? 'Posting…' : 'Publish now'}</button>}
      </div>
    </div>
  )
}

// ── Queue (list of posts) ────────────────────────────────────────────────────
function PostRow({ post, onEdit, onDelete, onPublish, publishing }) {
  const meta = STATUS_META[post.status] ?? STATUS_META.draft
  const { failed } = summariseResults(post.results ?? {})
  return (
    <div style={st.postRow}>
      {post.image_urls?.[0]
        ? <img src={post.image_urls[0]} alt="" style={st.postThumb} />
        : <div style={{ ...st.postThumb, ...st.postThumbEmpty }}>✎</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={st.postBody}>{post.body || <span style={{ color: '#bbb' }}>(no caption)</span>}</div>
        <div style={st.postMetaRow}>
          <span style={{ ...st.statusBadge, background: meta.bg, color: meta.fg }}>{meta.label}</span>
          {(post.platforms ?? []).map(p => (
            <span key={p} style={st.platTag} title={post.results?.[p]?.error ?? ''}>
              {PLATFORM_LABELS[p] ?? p}{post.results?.[p] ? (post.results[p].ok ? ' ✓' : ' ✕') : ''}
            </span>
          ))}
          {post.scheduled_at && post.status === 'scheduled' && <span style={st.postWhen}>· {fmtWhen(post.scheduled_at)}</span>}
          {post.published_at && <span style={st.postWhen}>· {fmtWhen(post.published_at)}</span>}
        </div>
        {failed.length > 0 && post.error && <div style={st.postErr}>{post.error}</div>}
      </div>
      <div style={st.postActions}>
        {['draft', 'scheduled', 'failed', 'partial'].includes(post.status) && (
          <button style={st.smallBtn} disabled={publishing} onClick={() => onPublish(post)}>{publishing ? '…' : 'Post now'}</button>
        )}
        {post.status !== 'publishing' && <button style={st.iconBtn} title="Edit" onClick={() => onEdit(post)}>✎</button>}
        <button style={st.iconBtnDanger} title="Delete" onClick={() => onDelete(post)}>✕</button>
      </div>
    </div>
  )
}

// ── Blog editor ──────────────────────────────────────────────────────────────
function BlogEditor({ editing, onClose, onSaved, toast }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => editing ?? {
    title: '', excerpt: '', body: '', cover_image_url: '', slug: '',
    author: profile?.name ?? 'Urban Tree Services', status: 'draft',
  })
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  function set(patch) { setForm(f => ({ ...f, ...patch })) }

  async function onCover(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { set({ cover_image_url: await uploadImage(file) }) }
    catch (err) { toast('Upload failed: ' + err.message, true) }
    finally { setUploading(false) }
  }

  async function save(publish) {
    if (!form.title.trim()) { toast('Give the article a title', true); return }
    setBusy(true)
    try {
      const slug = form.slug || slugify(form.title)
      const status = publish ? 'published' : (form.status || 'draft')
      const row = {
        title: form.title, excerpt: form.excerpt, body: form.body,
        cover_image_url: form.cover_image_url || null, author: form.author,
        slug, status,
        published_at: publish ? (editing?.published_at ?? new Date().toISOString()) : editing?.published_at ?? null,
        created_by: profile?.id ?? null,
      }
      let blog = editing
      if (editing?.id) {
        const { data, error } = await supabase.from('blog_posts').update(row).eq('id', editing.id).select().single()
        if (error) throw error
        blog = data
      } else {
        const { data, error } = await supabase.from('blog_posts').insert(row).select().single()
        if (error) throw error
        blog = data
      }

      // On publish, spin up a draft social post that promotes the article so it's
      // one click to schedule/share.
      if (publish && !editing?.published_at) {
        const social = buildBlogSocialPost(blog, { blogBaseUrl: MARKETING.blogBaseUrl, ctaLabel: 'Read more' })
        await supabase.from('marketing_posts').insert({
          ...social, platforms: MARKETING.defaultPlatforms, status: 'draft', created_by: profile?.id ?? null,
        })
        toast('Published — a draft social post is ready in Posts')
      } else {
        toast(publish ? 'Published' : 'Saved')
      }
      onSaved()
    } catch (err) {
      toast('Could not save: ' + err.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={st.scrim} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.modalHead}>
          <div style={st.cardTitle}>{editing ? 'Edit article' : 'New blog article'}</div>
          <button style={st.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={st.modalBody}>
          <div style={st.field}>
            <label style={st.label}>Title</label>
            <input style={st.input} value={form.title}
              onChange={e => set({ title: e.target.value, slug: editing ? form.slug : slugify(e.target.value) })} />
            <div style={st.slugHint}>{MARKETING.blogBaseUrl}/{form.slug || slugify(form.title) || '…'}</div>
          </div>
          <div style={st.field}>
            <label style={st.label}>Summary (used on social + previews)</label>
            <textarea style={st.textarea} rows={2} value={form.excerpt} onChange={e => set({ excerpt: e.target.value })} />
          </div>
          <div style={st.field}>
            <label style={st.label}>Cover photo</label>
            {form.cover_image_url
              ? <div style={st.thumbWrap}><img src={form.cover_image_url} alt="" style={{ ...st.thumb, width: 120, height: 72 }} />
                  <button type="button" style={st.thumbX} onClick={() => set({ cover_image_url: '' })}>✕</button></div>
              : <button type="button" style={st.addThumb} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '…' : '+ Cover'}</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onCover} />
          </div>
          <div style={st.field}>
            <label style={st.label}>Article</label>
            <textarea style={st.textarea} rows={10} value={form.body} onChange={e => set({ body: e.target.value })}
              placeholder="Write the article. Blank lines separate paragraphs." />
          </div>
        </div>
        <div style={st.modalFoot}>
          <button style={st.btnGhost} onClick={() => save(false)} disabled={busy}>Save draft</button>
          <button style={st.btnPrimary} onClick={() => save(true)} disabled={busy}>{busy ? '…' : editing?.status === 'published' ? 'Update' : 'Publish'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Marketing() {
  const [tab, setTab] = useState('posts')
  const [connected, setConnected] = useState(new Set())
  const [posts, setPosts] = useState([])
  const [blogs, setBlogs] = useState([])
  const [editing, setEditing] = useState(null)     // marketing_post being edited
  const [blogEditing, setBlogEditing] = useState(null) // null = closed, {} = new, {…} = edit
  const [publishingId, setPublishingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)

  function showToast(msg, err) { setToast({ msg, err }); setTimeout(() => setToast(null), err ? 7000 : 3500) }

  async function loadConnections() {
    const { data } = await supabase.from('social_connections').select('platform')
    setConnected(new Set((data ?? []).map(r => r.platform)))
  }
  async function loadPosts() {
    const { data } = await supabase.from('marketing_posts').select('*').order('created_at', { ascending: false }).limit(100)
    setPosts(data ?? [])
  }
  async function loadBlogs() {
    const { data } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false }).limit(100)
    setBlogs(data ?? [])
  }

  useEffect(() => {
    Promise.all([loadConnections(), loadPosts(), loadBlogs()]).finally(() => setLoading(false))
  }, [])

  async function publishNow(post) {
    setPublishingId(post.id)
    try {
      await supabase.from('marketing_posts').update({ status: 'publishing' }).eq('id', post.id)
      const res = await callPublishNow(post.id)
      const { ok } = summariseResults(res.results ?? {})
      showToast(res.status === 'published' ? `Posted to ${ok} channel${ok === 1 ? '' : 's'} ✓` : `Result: ${res.status}`, res.status === 'failed')
    } catch (err) {
      showToast('Publish failed: ' + err.message, true)
    } finally {
      setPublishingId(null)
      loadPosts()
    }
  }

  async function deletePost(post) {
    if (!window.confirm('Delete this post?')) return
    await supabase.from('marketing_posts').delete().eq('id', post.id)
    loadPosts(); showToast('Deleted')
  }

  async function deleteBlog(blog) {
    if (!window.confirm(`Delete “${blog.title}”?`)) return
    await supabase.from('blog_posts').delete().eq('id', blog.id)
    loadBlogs(); showToast('Deleted')
  }

  const noneConnected = connected.size === 0

  return (
    <div style={st.shell}>
      <div style={st.header}>
        <h1 style={st.h1}>Marketing</h1>
        <div style={st.tabs}>
          {/* Blog tab removed per audit (Section 4 cut) — BlogEditor stays in the codebase. */}
          {[['posts', 'Posts']].map(([id, label]) => (
            <button key={id} style={{ ...st.tab, ...(tab === id ? st.tabActive : {}) }} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={st.body}>
        {noneConnected && (
          <div style={st.notice}>
            No social channels connected yet. Go to <strong>Settings → Integrations</strong> to connect Facebook, Instagram,
            Google Business and LinkedIn. You can still draft & schedule posts here — they'll go out once channels are connected
            and auto-posting is switched on.
          </div>
        )}

        {tab === 'posts' && (
          <>
            <Composer
              connected={connected}
              editing={editing}
              onSaved={() => { setEditing(null); loadPosts() }}
              onCancelEdit={() => setEditing(null)}
              toast={showToast}
            />
            <div style={st.listTitle}>Queue & history</div>
            {loading ? <div style={st.empty}>Loading…</div>
              : posts.length === 0 ? <div style={st.empty}>No posts yet — compose one above.</div>
              : posts.map(p => (
                <PostRow key={p.id} post={p} publishing={publishingId === p.id}
                  onEdit={setEditing} onDelete={deletePost} onPublish={publishNow} />
              ))}
          </>
        )}

        {tab === 'blog' && (
          <>
            <div style={st.blogHead}>
              <div style={st.listTitle}>Blog articles</div>
              <button style={st.btnPrimary} onClick={() => setBlogEditing({})}>+ New article</button>
            </div>
            {loading ? <div style={st.empty}>Loading…</div>
              : blogs.length === 0 ? <div style={st.empty}>No articles yet.</div>
              : blogs.map(b => (
                <div key={b.id} style={st.postRow}>
                  {b.cover_image_url
                    ? <img src={b.cover_image_url} alt="" style={st.postThumb} />
                    : <div style={{ ...st.postThumb, ...st.postThumbEmpty }}>📝</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={st.postBody}>{b.title}</div>
                    <div style={st.postMetaRow}>
                      <span style={{ ...st.statusBadge, background: b.status === 'published' ? '#E8F0E6' : '#EEE', color: b.status === 'published' ? '#3A5C2E' : '#666' }}>
                        {b.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      {b.published_at && <span style={st.postWhen}>· {fmtWhen(b.published_at)}</span>}
                      {b.status === 'published' && (
                        <a href={`/blog/${b.slug}`} target="_blank" rel="noreferrer" style={st.viewLink}>View ↗</a>
                      )}
                    </div>
                  </div>
                  <div style={st.postActions}>
                    <button style={st.iconBtn} title="Edit" onClick={() => setBlogEditing(b)}>✎</button>
                    <button style={st.iconBtnDanger} title="Delete" onClick={() => deleteBlog(b)}>✕</button>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>

      {blogEditing !== null && (
        <BlogEditor
          editing={blogEditing.id ? blogEditing : null}
          onClose={() => setBlogEditing(null)}
          onSaved={() => { setBlogEditing(null); loadBlogs(); loadPosts() }}
          toast={showToast}
        />
      )}

      {toast && <div style={{ ...st.toast, background: toast.err ? '#C0392B' : 'var(--ink)' }}>{toast.msg}</div>}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const st = {
  shell:  { display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F3F0', overflow: 'hidden' },
  header: { padding: '20px 32px 0', background: '#fff', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  h1:     { fontSize: '20px', fontWeight: '800', color: 'var(--ink)', margin: '0 0 14px' },
  tabs:   { display: 'flex', gap: 0 },
  tab:    { padding: '10px 18px', border: 'none', borderBottom: '2px solid transparent', background: 'none', fontSize: '13px', fontWeight: '600', color: '#aaa', cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: '-1px' },
  tabActive: { color: 'var(--ink)', borderBottomColor: 'var(--ink)' },
  body:   { flex: 1, overflowY: 'auto', padding: '20px 32px', maxWidth: 760, width: '100%' },

  notice: { background: '#FDF3E3', border: '1px solid #F0DCB8', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#7a5a12', lineHeight: 1.55, marginBottom: 16 },

  card:      { background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 },
  cardTitle: { fontSize: 14, fontWeight: 800, color: 'var(--ink)' },
  textarea:  { padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
  input:     { padding: '9px 12px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  field:     { display: 'flex', flexDirection: 'column', gap: 5, flex: 1 },
  label:     { fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row2:      { display: 'flex', gap: 12, flexWrap: 'wrap' },

  chipRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip:    { padding: '7px 14px', borderRadius: 20, border: '1.5px solid var(--border)', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font)' },

  thumbRow:  { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  thumbWrap: { position: 'relative', display: 'inline-block' },
  thumb:     { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' },
  thumbX:    { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 },
  addThumb:  { width: 64, height: 64, borderRadius: 8, border: '1.5px dashed var(--border)', background: '#fff', color: 'var(--terra)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },

  scheduleRow: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  radio: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' },

  warn: { fontSize: 12, color: '#B87309', background: '#FDF3E3', borderRadius: 6, padding: '6px 10px' },
  err:  { fontSize: 12, color: '#C0392B', background: '#FDECEA', borderRadius: 6, padding: '6px 10px' },

  actions:   { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btnPrimary:{ padding: '9px 18px', borderRadius: 7, border: 'none', background: 'var(--terra)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnGhost:  { padding: '9px 16px', borderRadius: 7, border: '1.5px solid var(--border)', background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },

  listTitle: { fontSize: 13, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  empty:     { color: '#bbb', fontSize: 13, padding: '18px 0' },

  postRow:    { display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 },
  postThumb:  { width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
  postThumbEmpty: { background: '#F3EFEA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9bfb2', fontSize: 20 },
  postBody:   { fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  postMetaRow:{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  statusBadge:{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  platTag:    { fontSize: 10.5, fontWeight: 600, color: '#777', background: '#F3EFEA', padding: '2px 7px', borderRadius: 20 },
  postWhen:   { fontSize: 11, color: '#aaa' },
  postErr:    { fontSize: 11, color: '#C0392B', marginTop: 4 },
  postActions:{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  smallBtn:   { padding: '6px 11px', borderRadius: 6, border: '1.5px solid var(--terra)', background: 'var(--terra)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  iconBtn:    { width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: '#666', fontSize: 13, cursor: 'pointer' },
  iconBtnDanger: { width: 30, height: 30, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', fontSize: 13, cursor: 'pointer' },
  viewLink:   { fontSize: 11, color: 'var(--terra)', fontWeight: 700 },

  blogHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  slugHint: { fontSize: 11, color: '#bbb', wordBreak: 'break-all' },

  scrim:     { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.4)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal:     { background: '#fff', borderRadius: 12, width: 640, maxWidth: '96vw', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  modalBody: { padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  modalFoot: { display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)', background: '#FAFAF8' },

  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', color: '#fff', padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', maxWidth: '90vw', textAlign: 'center' },
}
