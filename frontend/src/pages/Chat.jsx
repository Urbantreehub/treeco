import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'

// Chat with a shared Team channel + private direct messages between staff.
// Team messages have recipient_id = null; DMs set recipient_id (RLS restricts
// DM visibility to the two participants). One realtime subscription routes
// every incoming message to the right conversation or an unread marker.

const READS_KEY = 'treeco_chat_reads'
const loadReads = () => { try { return JSON.parse(localStorage.getItem(READS_KEY)) || {} } catch { return {} } }
const saveReads = (r) => { try { localStorage.setItem(READS_KEY, JSON.stringify(r)) } catch {} }

function fmtTime(d) { return new Date(d).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) }
function dayKey(d) { return new Date(d).toDateString() }
function fmtDay(d) {
  const date = new Date(d)
  if (date.toDateString() === new Date().toDateString()) return 'Today'
  if (date.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
}
const initials = (name) => (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

export default function Chat() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const meId = profile?.id

  const [users, setUsers] = useState([])          // other staff (DM targets)
  const [names, setNames] = useState({})          // id -> name (incl. me)
  const [activeKey, setActiveKey] = useState(isMobile ? null : 'team')
  const [messages, setMessages] = useState([])    // messages for the active conversation
  const [unread, setUnread] = useState({})        // convKey -> true
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const endRef = useRef(null)
  const activeRef = useRef(activeKey)
  const seen = useRef(new Set())
  useEffect(() => { activeRef.current = activeKey }, [activeKey])

  const otherOf = useCallback((key) => (key && key.startsWith('dm:') ? key.slice(3) : null), [])
  const keyForMsg = useCallback((m) => {
    if (!m.recipient_id) return 'team'
    const other = m.user_id === meId ? m.recipient_id : m.user_id
    return `dm:${other}`
  }, [meId])

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // ── Initial load: users + unread scan + realtime subscription ─────────────
  useEffect(() => {
    if (!meId) return
    let active = true
    ;(async () => {
      const { data: allUsers } = await supabase.rpc('list_staff')
      if (!active) return
      const list = (allUsers || [])
      setUsers(list.filter(u => u.id !== meId).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setNames(Object.fromEntries(list.map(u => [u.id, u.name])))

      // Compute unread from last-read timestamps in localStorage.
      const reads = loadReads()
      const nextUnread = {}
      // Incoming DMs → latest per sender
      const { data: incoming } = await supabase
        .from('messages').select('user_id, created_at')
        .eq('channel', 'dm').eq('recipient_id', meId)
        .order('created_at', { ascending: false }).limit(200)
      const latestBySender = {}
      ;(incoming || []).forEach(m => { if (!latestBySender[m.user_id]) latestBySender[m.user_id] = m.created_at })
      Object.entries(latestBySender).forEach(([uid, ts]) => {
        const k = `dm:${uid}`
        if (!reads[k] || new Date(ts) > new Date(reads[k])) nextUnread[k] = true
      })
      // Team → latest message not from me
      const { data: teamLatest } = await supabase
        .from('messages').select('user_id, created_at')
        .is('recipient_id', null).eq('channel', 'team')
        .order('created_at', { ascending: false }).limit(1)
      const tl = teamLatest?.[0]
      if (tl && tl.user_id !== meId && (!reads.team || new Date(tl.created_at) > new Date(reads.team))) nextUnread.team = true
      if (active) setUnread(nextUnread)
    })()

    const channel = supabase
      .channel('chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: m }) => {
        const k = keyForMsg(m)
        if (k === activeRef.current) {
          if (seen.current.has(m.id)) return
          seen.current.add(m.id)
          setMessages(prev => [...prev, m])
        } else if (m.user_id !== meId) {
          setUnread(prev => ({ ...prev, [k]: true }))
        }
      })
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [meId, keyForMsg])

  // ── Load messages when the active conversation changes ────────────────────
  useEffect(() => {
    if (!activeKey || !meId) { setMessages([]); return }
    let active = true
    setLoading(true)
    seen.current = new Set()
    ;(async () => {
      let q = supabase.from('messages').select('id, body, user_id, recipient_id, created_at')
      if (activeKey === 'team') {
        q = q.is('recipient_id', null).eq('channel', 'team')
      } else {
        const other = otherOf(activeKey)
        q = q.eq('channel', 'dm').or(`and(user_id.eq.${meId},recipient_id.eq.${other}),and(user_id.eq.${other},recipient_id.eq.${meId})`)
      }
      const { data } = await q.order('created_at', { ascending: true }).limit(400)
      if (!active) return
      ;(data || []).forEach(m => seen.current.add(m.id))
      setMessages(data || [])
      setLoading(false)
      setTimeout(() => scrollToBottom(false), 60)
    })()

    // Mark read
    setUnread(prev => { const n = { ...prev }; delete n[activeKey]; return n })
    const reads = loadReads(); reads[activeKey] = new Date().toISOString(); saveReads(reads)

    return () => { active = false }
  }, [activeKey, meId, otherOf, scrollToBottom])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || !meId || !activeKey) return
    setSending(true); setText('')
    const row = { body, user_id: meId, channel: activeKey === 'team' ? 'team' : 'dm', recipient_id: activeKey === 'team' ? null : otherOf(activeKey) }
    const { data, error } = await supabase.from('messages').insert(row).select('id, body, user_id, recipient_id, created_at').single()
    setSending(false)
    if (error) { setText(body); return }
    if (data && !seen.current.has(data.id)) { seen.current.add(data.id); setMessages(prev => [...prev, data]) }
    const reads = loadReads(); reads[activeKey] = new Date().toISOString(); saveReads(reads)
  }

  const nameFor = (uid) => (uid === meId ? (profile?.name ?? 'You') : (names[uid] ?? 'Teammate'))
  const activeTitle = activeKey === 'team' ? 'Team Chat' : nameFor(otherOf(activeKey))
  const activeSub = activeKey === 'team' ? 'Everyone on the team' : 'Private message'

  const showList = isMobile ? activeKey === null : true
  const showThread = activeKey !== null

  // ── Conversation sidebar ──────────────────────────────────────────────────
  const Sidebar = (
    <div style={{ ...s.sidebar, ...(isMobile ? s.sidebarMobile : {}) }}>
      <div style={s.sideHeader}>Conversations</div>
      <button style={{ ...s.convItem, ...(activeKey === 'team' ? s.convActive : {}) }} onClick={() => setActiveKey('team')}>
        <div style={{ ...s.avatar, background: 'var(--moss)' }}>#</div>
        <div style={s.convBody}>
          <div style={s.convName}>Team</div>
          <div style={s.convHint}>Everyone</div>
        </div>
        {unread.team && <span style={s.dot} />}
      </button>
      <div style={s.sideLabel}>Direct messages</div>
      {users.length === 0 && <div style={s.sideEmpty}>No other staff yet</div>}
      {users.map(u => {
        const k = `dm:${u.id}`
        return (
          <button key={u.id} style={{ ...s.convItem, ...(activeKey === k ? s.convActive : {}) }} onClick={() => setActiveKey(k)}>
            <div style={s.avatar}>{initials(u.name)}</div>
            <div style={s.convBody}><div style={s.convName}>{u.name}</div></div>
            {unread[k] && <span style={s.dot} />}
          </button>
        )
      })}
    </div>
  )

  // ── Thread ────────────────────────────────────────────────────────────────
  const Thread = (
    <div style={s.thread}>
      <div style={s.threadHeader}>
        {isMobile && <button style={s.backBtn} onClick={() => setActiveKey(null)}>←</button>}
        <div>
          <div style={s.title}>{activeTitle}</div>
          <div style={s.sub}>{activeSub}</div>
        </div>
      </div>

      <div style={s.stream}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={s.empty}>{activeKey === 'team' ? 'No messages yet — say hello 👋' : `Start a conversation with ${activeTitle}`}</div>
        ) : (
          messages.map((msg, i) => {
            const mine = msg.user_id === meId
            const showDay = i === 0 || dayKey(msg.created_at) !== dayKey(messages[i - 1].created_at)
            const prevSame = i > 0 && messages[i - 1].user_id === msg.user_id && !showDay
            return (
              <div key={msg.id}>
                {showDay && <div style={s.dayDivider}><span style={s.dayPill}>{fmtDay(msg.created_at)}</span></div>}
                <div style={{ ...s.row, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ ...s.bubble, ...(mine ? s.bubbleMine : s.bubbleOther) }}>
                    {!mine && !prevSame && activeKey === 'team' && <div style={s.sender}>{nameFor(msg.user_id)}</div>}
                    <div style={s.body}>{msg.body}</div>
                    <div style={{ ...s.time, color: mine ? 'rgba(255,255,255,0.7)' : '#aaa' }}>{fmtTime(msg.created_at)}</div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form style={s.composer} onSubmit={send}>
        <input style={s.input} placeholder={activeKey === 'team' ? 'Message the team…' : `Message ${activeTitle}…`}
          value={text} onChange={e => setText(e.target.value)} maxLength={2000} />
        <button type="submit" style={{ ...s.sendBtn, opacity: text.trim() && !sending ? 1 : 0.5 }} disabled={!text.trim() || sending}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )

  return (
    <div style={s.page}>
      {showList && Sidebar}
      {showThread ? Thread : (!isMobile && <div style={s.placeholder}>Select a conversation</div>)}
    </div>
  )
}

const s = {
  page: { display: 'flex', height: '100%', minHeight: 0, background: 'var(--cream)' },

  sidebar: { width: '260px', minWidth: '260px', borderRight: '1px solid var(--border)', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  sidebarMobile: { width: '100%', minWidth: 0, borderRight: 'none' },
  sideHeader: { padding: '16px 18px 8px', fontSize: '16px', fontWeight: '700', color: 'var(--bark)' },
  sideLabel: { padding: '14px 18px 6px', fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  sideEmpty: { padding: '4px 18px', fontSize: '13px', color: '#bbb' },
  convItem: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', borderLeft: '3px solid transparent' },
  convActive: { background: 'var(--moss-pale)', borderLeft: '3px solid var(--moss)' },
  avatar: { width: '38px', height: '38px', borderRadius: '50%', background: 'var(--sky)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 },
  convBody: { flex: 1, minWidth: 0 },
  convName: { fontSize: '14px', fontWeight: '600', color: 'var(--bark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convHint: { fontSize: '12px', color: '#aaa' },
  dot: { width: '9px', height: '9px', borderRadius: '50%', background: '#D4851A', flexShrink: 0 },

  thread: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  threadHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 },
  backBtn: { background: 'none', border: 'none', fontSize: '22px', color: 'var(--bark)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  title: { fontSize: '17px', fontWeight: '700', color: 'var(--bark)' },
  sub: { fontSize: '12px', color: '#999', marginTop: '1px' },
  placeholder: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '14px' },

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
