import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function when(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Client-facing discussion thread. Reads/writes go through SECURITY DEFINER
// RPCs (the client is the anon role) — see migration 022.
export default function QuoteClientComments({ token, quoteId, isPreview }) {
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    const { data } = await supabase.rpc('get_quote_comments', { p_token: token })
    setComments(Array.isArray(data) ? data : [])
  }, [token])

  useEffect(() => { load() }, [load])

  async function post() {
    const text = body.trim()
    if (!text || isPreview) return
    setBusy(true)
    const { data, error } = await supabase.rpc('post_quote_comment', { p_token: token, p_body: text })
    setBusy(false)
    if (error || !data?.ok) return
    setBody('')
    setSent(true)
    setTimeout(() => setSent(false), 3000)
    load()
    // Best-effort office notification (same channel as accept/decline).
    if (quoteId) {
      fetch(`${SUPABASE_URL}/functions/v1/notify-office`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ quote_id: quoteId, action: 'comment', reason: text }),
      }).catch(() => {})
    }
  }

  return (
    <div style={st.wrap}>
      <div style={st.title}>Questions &amp; Answers</div>
      <div style={st.sub}>Ask us anything about this quote — we'll reply here, and it stays with your quote.</div>

      {comments.length > 0 && (
        <div style={st.thread}>
          {comments.map(c => {
            const isClient = c.author_type === 'client'
            return (
              <div key={c.id} style={{ ...st.bubbleRow, justifyContent: isClient ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...st.bubble, ...(isClient ? st.mine : st.theirs) }}>
                  <div style={st.head}>
                    <span style={{ fontWeight: 700 }}>{isClient ? 'You' : (c.author_name || 'Urban Tree Services')}</span>
                    <span style={st.time}>{when(c.created_at)}</span>
                  </div>
                  <div style={st.body}>{c.body}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {sent && <div style={st.sentMsg}>✓ Sent — thanks, we'll be in touch.</div>}

      <textarea style={st.textarea} rows={3} placeholder="Type your question or comment…"
        value={body} onChange={e => setBody(e.target.value)} disabled={isPreview} />
      <button style={{ ...st.btn, opacity: busy || !body.trim() || isPreview ? 0.5 : 1 }}
        disabled={busy || !body.trim() || isPreview} onClick={post}>
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </div>
  )
}

const st = {
  wrap: { background: '#fff', border: '1px solid #E7E2D8', borderRadius: 12, padding: '20px 22px', marginTop: 20 },
  title: { fontSize: 16, fontWeight: 700, color: '#3A3121' },
  sub: { fontSize: 13, color: '#8A857D', margin: '4px 0 14px' },
  thread: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
  bubbleRow: { display: 'flex' },
  bubble: { maxWidth: '85%', borderRadius: 12, padding: '9px 12px', border: '1px solid' },
  mine: { background: '#EDF3EA', borderColor: '#D3E2CB' },
  theirs: { background: '#F4F1EA', borderColor: '#E3DCCB' },
  head: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8A857D', marginBottom: 3 },
  time: { marginLeft: 'auto' },
  body: { fontSize: 14, color: '#3A3121', whiteSpace: 'pre-wrap', lineHeight: 1.45 },
  sentMsg: { background: '#E8F0E6', color: '#4A6741', fontSize: 13, fontWeight: 600, padding: '9px 12px', borderRadius: 8, marginBottom: 12 },
  textarea: { width: '100%', border: '1px solid #D8D2C6', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#3A3121', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' },
  btn: { marginTop: 10, background: '#4A6741', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}
