import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

function when(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Staff-side discussion thread for a quote. Shows client questions, staff
// replies and internal-only notes; staff can post a client-visible reply or a
// private internal note.
export default function QuoteComments({ quoteId }) {
  const { session, profile } = useAuth()
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!quoteId || quoteId === 'new') return
    const { data } = await supabase.from('quote_comments')
      .select('*').eq('quote_id', quoteId).order('created_at', { ascending: true })
    setComments(data ?? [])
  }, [quoteId])

  useEffect(() => { load() }, [load])

  async function post() {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const { error } = await supabase.from('quote_comments').insert({
      quote_id: quoteId,
      author_type: 'staff',
      author_id: session?.user?.id ?? null,
      author_name: profile?.name ?? 'Staff',
      body: text,
      internal,
    })
    setBusy(false)
    if (error) return
    setBody('')
    load()
  }

  if (!quoteId || quoteId === 'new') return null

  return (
    <div style={st.card}>
      <div style={st.title}>Discussion <span style={st.count}>{comments.length}</span></div>
      <div style={st.hint}>Client questions and your replies live here. Internal notes are never shown to the client.</div>

      <div style={st.thread}>
        {comments.length === 0 ? (
          <div style={st.empty}>No messages yet.</div>
        ) : comments.map(c => {
          const isClient = c.author_type === 'client'
          return (
            <div key={c.id} style={{ ...st.bubbleRow, justifyContent: isClient ? 'flex-start' : 'flex-end' }}>
              <div style={{ ...st.bubble, ...(isClient ? st.bubbleClient : c.internal ? st.bubbleInternal : st.bubbleStaff) }}>
                <div style={st.bubbleHead}>
                  <span style={{ fontWeight: 700 }}>{c.author_name || (isClient ? 'Client' : 'Staff')}</span>
                  {c.internal && <span style={st.internalTag}>Internal</span>}
                  <span style={st.time}>{when(c.created_at)}</span>
                </div>
                <div style={st.body}>{c.body}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={st.compose}>
        <textarea style={st.textarea} rows={2} placeholder={internal ? 'Internal note (staff only)…' : 'Reply to the client…'}
          value={body} onChange={e => setBody(e.target.value)} />
        <div style={st.composeBar}>
          <label style={st.checkLbl}>
            <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
            Internal note (private)
          </label>
          <button style={st.sendBtn} disabled={busy || !body.trim()} onClick={post}>
            {busy ? 'Posting…' : internal ? 'Add note' : 'Send reply'}
          </button>
        </div>
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
  compose: { borderTop: '1px solid var(--border)', paddingTop: 10 },
  textarea: { width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box', resize: 'vertical' },
  composeBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 },
  checkLbl: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8A857D', cursor: 'pointer' },
  sendBtn: { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
}
