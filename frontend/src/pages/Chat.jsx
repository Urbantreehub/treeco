import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

// Team chat — one shared 'team' channel, live via Supabase realtime.
// Everyone (crew included) can read and post.

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
}
function dayKey(d) {
  return new Date(d).toDateString()
}
function fmtDay(d) {
  const date = new Date(d)
  const today = new Date().toDateString()
  const yest = new Date(Date.now() - 864e5).toDateString()
  if (date.toDateString() === today) return 'Today'
  if (date.toDateString() === yest) return 'Yesterday'
  return date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Chat() {
  const { profile } = useAuth()
  const meId = profile?.id
  const [messages, setMessages] = useState([])
  const [names, setNames] = useState({})
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const seen = useRef(new Set())

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const append = useCallback((msg) => {
    if (seen.current.has(msg.id)) return
    seen.current.add(msg.id)
    setMessages(prev => [...prev, msg])
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      // Names map for resolving realtime-inserted messages.
      const { data: users } = await supabase.from('users').select('id, name')
      if (active && users) setNames(Object.fromEntries(users.map(u => [u.id, u.name])))

      const { data } = await supabase
        .from('messages')
        .select('id, body, user_id, created_at')
        .eq('channel', 'team')
        .order('created_at', { ascending: true })
        .limit(300)
      if (active && data) {
        data.forEach(m => seen.current.add(m.id))
        setMessages(data)
      }
      if (active) { setLoading(false); setTimeout(() => scrollToBottom(false), 60) }
    })()

    const channel = supabase
      .channel('team-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'channel=eq.team' },
        payload => append(payload.new))
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [append, scrollToBottom])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || !meId) return
    setSending(true)
    setText('')
    const { data, error } = await supabase
      .from('messages')
      .insert({ body, user_id: meId, channel: 'team' })
      .select('id, body, user_id, created_at')
      .single()
    setSending(false)
    if (error) { setText(body); return }
    if (data) append(data)          // instant echo; realtime handler dedupes
  }

  const nameFor = (uid) => (uid === meId ? (profile?.name ?? 'You') : (names[uid] ?? 'Teammate'))

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Team Chat</div>
          <div style={s.sub}>Everyone on the team can see this</div>
        </div>
      </div>

      <div style={s.stream}>
        {loading ? (
          <div style={s.empty}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <div style={s.empty}>No messages yet — say hello 👋</div>
        ) : (
          messages.map((m, i) => {
            const mine = m.user_id === meId
            const showDay = i === 0 || dayKey(m.created_at) !== dayKey(messages[i - 1].created_at)
            const prevSame = i > 0 && messages[i - 1].user_id === m.user_id && !showDay
            return (
              <div key={m.id}>
                {showDay && <div style={s.dayDivider}><span style={s.dayPill}>{fmtDay(m.created_at)}</span></div>}
                <div style={{ ...s.row, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ ...s.bubble, ...(mine ? s.bubbleMine : s.bubbleOther) }}>
                    {!mine && !prevSame && <div style={s.sender}>{nameFor(m.user_id)}</div>}
                    <div style={s.body}>{m.body}</div>
                    <div style={{ ...s.time, color: mine ? 'rgba(255,255,255,0.7)' : '#aaa' }}>{fmtTime(m.created_at)}</div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form style={s.composer} onSubmit={send}>
        <input
          style={s.input}
          placeholder="Message the team…"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={2000}
        />
        <button type="submit" style={{ ...s.sendBtn, opacity: text.trim() && !sending ? 1 : 0.5 }} disabled={!text.trim() || sending}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

const s = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--cream)' },
  header: { padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 },
  title: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)' },
  sub: { fontSize: '12px', color: '#999', marginTop: '2px' },

  stream: { flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '3px' },
  empty: { textAlign: 'center', color: '#aaa', fontSize: '14px', marginTop: '40px' },

  dayDivider: { display: 'flex', justifyContent: 'center', margin: '16px 0 10px' },
  dayPill: { fontSize: '11px', fontWeight: '600', color: '#999', background: '#EDEAE4', borderRadius: '10px', padding: '3px 12px' },

  row: { display: 'flex', width: '100%', marginTop: '2px' },
  bubble: { maxWidth: '78%', borderRadius: '14px', padding: '8px 12px', boxShadow: '0 1px 2px rgba(44,36,22,0.08)' },
  bubbleMine: { background: 'var(--moss)', color: '#fff', borderBottomRightRadius: '4px' },
  bubbleOther: { background: '#fff', color: 'var(--bark)', border: '1px solid var(--border)', borderBottomLeftRadius: '4px' },
  sender: { fontSize: '11px', fontWeight: '700', color: 'var(--moss-light)', marginBottom: '3px' },
  body: { fontSize: '14px', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  time: { fontSize: '10px', textAlign: 'right', marginTop: '3px' },

  composer: { display: 'flex', gap: '8px', padding: '12px 14px', borderTop: '1px solid var(--border)', background: '#fff', flexShrink: 0 },
  input: { flex: 1, padding: '11px 14px', borderRadius: '22px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none' },
  sendBtn: { padding: '0 20px', borderRadius: '22px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
}
