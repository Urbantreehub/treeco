import { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

function when(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Staff-side discussion thread for a quote. Shows client questions, staff
// replies and internal-only notes; staff can post a client-visible reply or a
// private internal note, optionally with image attachments.
export default function QuoteComments({ quoteId }) {
  const { session, profile } = useAuth()
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState([]) // array of public URL strings
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState('') // small non-fatal status note
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!quoteId || quoteId === 'new') return
    const { data } = await supabase.from('quote_comments')
      .select('*').eq('quote_id', quoteId).order('created_at', { ascending: true })
    setComments(data ?? [])
  }, [quoteId])

  useEffect(() => { load() }, [load])

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    const urls = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `comments/${quoteId}/${uuid()}.${ext}`
      const { error } = await supabase.storage.from('quote-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (!error) {
        const { data } = supabase.storage.from('quote-images').getPublicUrl(path)
        if (data?.publicUrl) urls.push(data.publicUrl)
      }
    }
    if (urls.length) setAttachments(prev => [...prev, ...urls])
    setUploading(false)
  }

  function removeAttachment(url) {
    setAttachments(prev => prev.filter(u => u !== url))
  }

  async function post() {
    const text = body.trim()
    if (!text && attachments.length === 0) return
    setBusy(true)
    setNote('')

    const base = {
      quote_id: quoteId,
      author_type: 'staff',
      author_id: session?.user?.id ?? null,
      author_name: profile?.name ?? 'Staff',
      body: text,
      internal,
    }

    let { error } = await supabase.from('quote_comments')
      .insert({ ...base, attachments })

    // Graceful fallback: prod may not have the attachments column yet. If the
    // insert fails specifically because of that column, retry text-only so the
    // discussion never breaks.
    if (error && (error.message || '').toLowerCase().includes('attachments')) {
      const retry = await supabase.from('quote_comments').insert(base)
      error = retry.error
      if (!error && attachments.length) {
        setNote('Attachments need a quick DB update — text posted.')
      }
    }

    setBusy(false)
    if (error) return
    setBody('')
    setAttachments([])
    load()
  }

  if (!quoteId || quoteId === 'new') return null

  const canPost = !!body.trim() || attachments.length > 0

  return (
    <div style={st.card}>
      <div style={st.title}>Discussion <span style={st.count}>{comments.length}</span></div>
      <div style={st.hint}>Client questions and your replies live here. Internal notes are never shown to the client.</div>

      <div style={st.thread}>
        {comments.length === 0 ? (
          <div style={st.empty}>No messages yet.</div>
        ) : comments.map(c => {
          const isClient = c.author_type === 'client'
          const atts = Array.isArray(c.attachments) ? c.attachments : []
          return (
            <div key={c.id} style={{ ...st.bubbleRow, justifyContent: isClient ? 'flex-start' : 'flex-end' }}>
              <div style={{ ...st.bubble, ...(isClient ? st.bubbleClient : c.internal ? st.bubbleInternal : st.bubbleStaff) }}>
                <div style={st.bubbleHead}>
                  <span style={{ fontWeight: 700 }}>{c.author_name || (isClient ? 'Client' : 'Staff')}</span>
                  {c.internal && <span style={st.internalTag}>Internal</span>}
                  <span style={st.time}>{when(c.created_at)}</span>
                </div>
                {c.body && <div style={st.body}>{c.body}</div>}
                {atts.length > 0 && (
                  <div style={st.attGrid}>
                    {atts.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" style={st.attLink}>
                        <img src={url} alt="attachment" style={st.attImg} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={st.compose}>
        {attachments.length > 0 && (
          <div style={st.pendingGrid}>
            {attachments.map((url, i) => (
              <div key={i} style={st.pendingItem}>
                <img src={url} alt="pending attachment" style={st.pendingImg} />
                <button type="button" style={st.pendingRemove} onClick={() => removeAttachment(url)} aria-label="Remove attachment">✕</button>
              </div>
            ))}
          </div>
        )}
        {uploading && <div style={st.uploading}>Uploading…</div>}
        <textarea style={st.textarea} rows={2} placeholder={internal ? 'Internal note (staff only)…' : 'Reply to the client…'}
          value={body} onChange={e => setBody(e.target.value)} />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple
          style={{ display: 'none' }} onChange={handleFiles} />
        <div style={st.composeBar}>
          <label style={st.checkLbl}>
            <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
            Internal note (private)
          </label>
          <div style={st.actions}>
            <button type="button" style={st.attachBtn} disabled={uploading}
              onClick={() => fileRef.current?.click()} aria-label="Attach images" title="Attach images">
              📎
            </button>
            <button style={st.sendBtn} disabled={busy || uploading || !canPost} onClick={post}>
              {busy ? 'Posting…' : internal ? 'Add note' : 'Send reply'}
            </button>
          </div>
        </div>
        {note && <div style={st.note}>{note}</div>}
      </div>
    </div>
  )
}

const st = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 },
  title: { fontSize: 13, fontWeight: 700, color: 'var(--bark)', display: 'flex', alignItems: 'center', gap: 8 },
  count: { fontSize: 11, fontWeight: 700, background: 'var(--bg)', color: '#8A857D', borderRadius: 999, padding: '1px 8px' },
  hint: { fontSize: 11, color: '#8A857D', margin: '4px 0 12px' },
  thread: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', marginBottom: 12 },
  empty: { fontSize: 12.5, color: '#8A857D', padding: '8px 0', textAlign: 'center' },
  bubbleRow: { display: 'flex' },
  bubble: { maxWidth: '82%', borderRadius: 10, padding: '8px 11px', border: '1px solid' },
  bubbleClient: { background: '#F4F1EA', borderColor: '#E3DCCB' },
  bubbleStaff: { background: '#EEF4F8', borderColor: '#D3E2EC' },
  bubbleInternal: { background: '#FBF6EC', borderColor: '#E7D9BC' },
  bubbleHead: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8A857D', marginBottom: 3 },
  internalTag: { fontSize: 9.5, fontWeight: 700, color: '#9A6A1A', background: '#F0E7D3', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: 0.3 },
  time: { marginLeft: 'auto' },
  body: { fontSize: 13, color: 'var(--bark)', whiteSpace: 'pre-wrap', lineHeight: 1.4 },
  attGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  attLink: { display: 'block', maxWidth: '100%' },
  attImg: { maxWidth: '100%', maxHeight: 220, borderRadius: 8, display: 'block', border: '1px solid rgba(0,0,0,0.06)' },
  compose: { borderTop: '1px solid var(--border)', paddingTop: 10 },
  pendingGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pendingItem: { position: 'relative', width: 64, height: 64 },
  pendingImg: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' },
  pendingRemove: { position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#5A5148', color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' },
  uploading: { fontSize: 11.5, color: '#8A857D', marginBottom: 6 },
  textarea: { width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box', resize: 'vertical' },
  composeBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 },
  checkLbl: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8A857D', cursor: 'pointer' },
  actions: { display: 'flex', alignItems: 'center', gap: 8 },
  attachBtn: { background: 'var(--bg)', color: 'var(--bark)', border: '1px solid var(--border)', borderRadius: 7, minWidth: 42, height: 40, fontSize: 17, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' },
  sendBtn: { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 7, padding: '0 15px', height: 40, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  note: { fontSize: 11.5, color: '#9A6A1A', background: '#FBF6EC', border: '1px solid #E7D9BC', borderRadius: 6, padding: '5px 9px', marginTop: 8 },
}
