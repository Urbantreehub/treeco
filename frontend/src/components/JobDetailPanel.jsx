import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import QuoteReference from './QuoteReference'
import QuoteVersionHistory from './QuoteVersionHistory'
import SpencersInvoice from './SpencersInvoice'
import SpencersPortalData from './SpencersPortalData'
import ErrorBoundary from './ErrorBoundary'
import AddressInput from './AddressInput'
import StatusStepper from './StatusStepper'
import QuoteLines from './QuoteLines'
import ActivityFeed from './ActivityFeed'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  JOB_STATUSES, STATUS_ORDER, SIDE_STATUSES, isSpencersJob, jobCategory, categoryMeta, showsQuoteReference,
} from '../config/statuses'
import { displayCase, telHref, koCode, kpiCountdown } from '../utils/jobDisplay'
import { mapsHref } from '../utils/geo'
import { primaryQuote, nzd, jobNumber, daysInStatus, relWhen } from '../utils/quotes'

// ── The job record ───────────────────────────────────────────────────────────
// One quote-first record per job: price, status stepper, the quote description
// with its photos, and the activity feed beside it. Everything that is not the
// next step lives under "…". Desktop (≥1024px) is a wide slide-over with the
// quote on the left and activity on the right; tablet/phone is a full-screen
// sheet with activity stacked below.
//
// Props (unchanged from the previous panel — Pipeline and Calendar pass these):
//   job           the job row with clients{} and quotes[]
//   onClose       close the record
//   onUpdated     something changed that the list must refetch (status, copy…)
//   onFieldSaved  a field was edited in place; refetch without closing

// Crew (non-office/full) users only manage the on-the-ground job lifecycle:
// they may move a job between these operational statuses (mark done, flag
// stump grinding). They can change status only FROM one of these, and only TO
// another of these — the sales/quoting statuses and invoicing stay office-only.
const CREW_STATUSES = ['complete_to_invoice', 'stump_grinding']

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const JOB_FORMS = [
  { id: 'risk_assessment', label: 'SSSP', url: '/forms/risk-assessment.html', required: true },
]

// Kāinga Ora SLA timeframes by priority code
const KO_SLA = {
  URG: { label: 'URG — Urgent', respond: 'Respond & complete within 4 hours', color: '#C0392B', bg: '#FFF0EE' },
  URS: { label: 'URS — Urgent Response', respond: 'Respond within 12 hours, complete within 48 hours', color: '#D4851A', bg: '#FDF3E3' },
  EPS: { label: 'EPS — Emergency', respond: 'Respond & complete within 4 hours', color: '#C0392B', bg: '#FFF0EE' },
  GNL: { label: 'GNL — General', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  RSC: { label: 'RSC — Responsive', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  VSC: { label: 'VSC — Void', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  RM:  { label: 'RM — Responsive Maintenance', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  PM:  { label: 'PM — Planned Maintenance', respond: 'Respond within 48 hours, complete within 10 days', color: '#7A7A7A', bg: '#F5F5F5' },
}

const CATEGORY_LABEL = { residential: 'Private', spencers: 'Spencers · Kāinga Ora', downer: 'Downer' }

function extractPriority(job) {
  const titleMatch = (job.title || '').match(/^\[([A-Z]{2,4})\]/)
  if (titleMatch) return titleMatch[1]
  const descMatch = (job.description || '').match(/Priority:\s*([A-Z]{2,4})/)
  if (descMatch) return descMatch[1]
  return null
}

// Where a held/declined job goes back to. Prefer the status it left (from the
// feed's status row), else infer from the quote, else the safe default.
function inferForward(job, quote) {
  const qs = quote?.status
  if (['accepted', 'complete', 'invoiced'].includes(qs)) return 'accepted_to_schedule'
  if (['sent', 'viewed', 'declined'].includes(qs)) return 'quote_sent'
  return null
}

export default function JobDetailPanel({ job, onClose, onUpdated, onFieldSaved }) {
  const { isStaff, profile, session } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // ── Data the list row doesn't carry: full quotes, photos, versions ──────
  const [fullQuotes, setFullQuotes] = useState(null)
  const [photos, setPhotos] = useState([])
  const [versionCount, setVersionCount] = useState(1)
  const [leftStatus, setLeftStatus] = useState(null) // forward status a held/declined job came from

  const quote = useMemo(() => {
    const full = fullQuotes ?? []
    if (full.length) return primaryQuote({ quotes: full })
    // Merge what the list row knows (id/status/total) so the header can show a
    // price before the detail query lands.
    return primaryQuote(job)
  }, [fullQuotes, job])

  useEffect(() => {
    let live = true
    setFullQuotes(null); setPhotos([]); setVersionCount(1); setLeftStatus(null)
    ;(async () => {
      const [{ data: qs }, { data: ph }] = await Promise.all([
        supabase.from('quotes').select('*').eq('job_id', job.id).order('created_at', { ascending: false }),
        supabase.from('job_photos').select('id, job_id, url, caption, kind, phase, line_ref, created_at').eq('job_id', job.id).order('created_at'),
      ])
      if (!live) return
      // Demo mode serves whole tables regardless of filters — narrow here.
      setFullQuotes((Array.isArray(qs) ? qs : []).filter(q => q && q.job_id === job.id))
      setPhotos((Array.isArray(ph) ? ph : []).filter(p => p && p.url && (p.job_id == null || p.job_id === job.id)))
    })()
    return () => { live = false }
  }, [job.id])

  useEffect(() => {
    if (!quote?.id) { setVersionCount(1); return }
    let live = true
    supabase.from('quote_versions').select('id, quote_id, version_no').eq('quote_id', quote.id)
      .then(({ data }) => {
        if (!live) return
        const mine = (Array.isArray(data) ? data : []).filter(v => v.quote_id === quote.id)
        setVersionCount(mine.length + 1)
      })
    return () => { live = false }
  }, [quote?.id, quote?.status])

  useEffect(() => {
    if (!SIDE_STATUSES.includes(job.status)) { setLeftStatus(null); return }
    let live = true
    supabase.from('job_activity').select('job_id, kind, meta, created_at').eq('job_id', job.id).eq('kind', 'status')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => {
        if (!live) return
        const row = (Array.isArray(data) ? data : []).find(r => r.job_id === job.id && r.kind === 'status' && r.meta?.to === job.status && STATUS_ORDER.includes(r.meta?.from))
        setLeftStatus(row?.meta?.from ?? null)
      })
    return () => { live = false }
  }, [job.id, job.status])

  // ── UI state ────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false)
  const [open, setOpen] = useState({}) // sections opened from the … menu
  const [busy, setBusy] = useState(null) // 'status' | 'copy' | 'accept' | 'followup'
  const [notice, setNotice] = useState(null) // { err, msg }
  const [xeroStatus, setXeroStatus] = useState(null) // null | 'pushing' | 'ok' | 'err' | 'not_connected'
  const [photosPush, setPhotosPush] = useState(null) // null | 'pushing' | 'done' | 'err'
  const [docsPush, setDocsPush] = useState(null)
  const [smsText, setSmsText] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsNote, setSmsNote] = useState(null)
  const [editing, setEditing] = useState(false)
  const [formStatus, setFormStatus] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_job_forms_${job.id}`) ?? '{}') } catch { return {} }
  })
  const [activeForm, setActiveForm] = useState(null)
  const menuRef = useRef(null)

  const toggle = key => setOpen(o => ({ ...o, [key]: !o[key] }))
  const show = key => setOpen(o => ({ ...o, [key]: true }))

  useEffect(() => {
    function handleMsg(e) {
      if (e.data?.type === 'form_complete' && e.data.job_id === job.id) {
        setFormStatus(prev => {
          const next = { ...prev, [e.data.form_id]: { completed: true, at: new Date().toISOString() } }
          localStorage.setItem(`treeco_job_forms_${job.id}`, JSON.stringify(next))
          return next
        })
        setActiveForm(null)
      }
    }
    window.addEventListener('message', handleMsg)
    return () => window.removeEventListener('message', handleMsg)
  }, [job.id])

  // Escape closes the menu first, then the record. Outside click closes the menu.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (menuOpen) { setMenuOpen(false); return }
      if (activeForm) { setActiveForm(null); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, activeForm, onClose])

  useEffect(() => {
    if (!menuOpen) return undefined
    function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [menuOpen])

  // ── Derived facts ───────────────────────────────────────────────────────
  const portal = isSpencersJob(job)
  const category = jobCategory(job)
  const cat = categoryMeta(job)
  const code = koCode(job) ?? extractPriority(job)
  const sla = code ? KO_SLA[code] : null
  const kpi = portal ? kpiCountdown(job) : null
  const clientName = displayCase((job.clients?.name || '').replace(/^SP — /, '')) || null
  const firstName = (clientName || 'client').split(' ')[0]
  const phone = job.clients?.phone || null
  const statusMeta = JOB_STATUSES[job.status]
  const days = daysInStatus(job)
  const forwardHint = leftStatus ?? inferForward(job, quote) ?? 'accepted_to_schedule'
  const number = jobNumber(job, quote)
  const versionLabel = Array.from({ length: versionCount }, (_, i) => `v${i + 1}`).join(' · ')
  const portalUrl = job.portal_url || job.portal_link || null

  // Status-change permissions. Office/full access can move to any status;
  // crew can only move between the operational statuses (CREW_STATUSES).
  const crewAllowed = CREW_STATUSES.includes(job.status) ? CREW_STATUSES.filter(s => s !== job.status) : []
  const canChangeStatusTo = target => isStaff || crewAllowed.includes(target)

  // Completion gate: Spencers/Downer jobs need During + After photos (persisted
  // in job_photos by the crew Work Order) before they can be marked complete.
  async function sdPhotosReady() {
    if (!portal) return true
    const { data } = await supabase.from('job_photos').select('phase').eq('job_id', job.id).in('phase', ['during', 'after'])
    const phases = new Set((data ?? []).map(p => p.phase))
    return phases.has('during') && phases.has('after')
  }

  // Every status change writes exactly { status, status_changed_at }.
  async function applyStatus(newStatus, { navigateTo = null } = {}) {
    if (!canChangeStatusTo(newStatus)) return false
    if (newStatus === 'complete_to_invoice' && !(await sdPhotosReady())) {
      alert('During and After photos must be uploaded in the Work Order before this job can be marked complete.')
      return false
    }
    setBusy('status')
    const { error } = await supabase.from('jobs')
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq('id', job.id)
    setBusy(null)
    if (error) { alert(`Failed to update status: ${error.message}`); return false }
    onUpdated?.()
    if (navigateTo) navigate(navigateTo)
    onClose()
    return true
  }

  function go(path) { onClose(); navigate(path) }
  const quotePath = quote?.id ? `/quotes/${quote.id}` : `/quotes/new?job=${job.id}`

  async function sendFollowUp(channel) {
    if (!quote?.id) return
    setBusy('followup'); setNotice(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/quote-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ quote_id: quote.id, channel }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok) {
        setNotice({ err: false, msg: `Follow-up sent by ${channel}.` })
        setFullQuotes(prev => (prev ?? []).map(q => q.id === quote.id
          ? { ...q, followup_count: (q.followup_count ?? 0) + 1, last_followup_at: new Date().toISOString() } : q))
        onFieldSaved?.()
      } else {
        setNotice({ err: true, msg: body.error || 'Follow-up failed.' })
      }
    } catch {
      setNotice({ err: true, msg: 'Follow-up failed.' })
    } finally {
      setBusy(null)
    }
  }

  async function acceptOnBehalf() {
    if (!quote?.id) return
    const who = profile?.name || 'staff'
    if (!window.confirm(`Accept this quote on ${clientName ?? 'the client'}'s behalf?\n\nThe quote is marked accepted (signed “Accepted on behalf by ${who}”) and the job moves to Accepted — to be scheduled.`)) return
    setBusy('accept')
    const { error } = await supabase.from('quotes')
      .update({ status: 'accepted', signed_name: `Accepted on behalf by ${who}`, responded_at: new Date().toISOString() })
      .eq('id', quote.id)
    setBusy(null)
    if (error) { alert(`Could not accept the quote: ${error.message}`); return }
    await applyStatus('accepted_to_schedule')
  }

  async function markDeclined() {
    const reason = window.prompt('Reason for declining? (kept on the record)', '')
    if (reason === null) return
    if (quote?.id && ['sent', 'viewed', 'draft'].includes(quote.status)) {
      await supabase.from('quotes').update({ status: 'declined', responded_at: new Date().toISOString(), decline_reason: reason || null }).eq('id', quote.id)
    }
    if (reason.trim()) {
      await supabase.rpc('add_job_note', { p_job_id: job.id, p_body: `Declined: ${reason.trim()}`, p_kind: 'note' })
    }
    await applyStatus('declined')
  }

  async function copyToNewQuote() {
    if (!window.confirm(`Copy this job${quote ? ' and its quote' : ''} to a new job for ${clientName ?? 'the same client'}?`)) return
    setBusy('copy'); setNotice(null)
    try {
      const now = new Date().toISOString()
      const base = {
        client_id: job.client_id ?? job.clients?.id ?? null,
        category,
        title: job.title ?? job.address ?? null,
        address: job.address ?? null,
        job_type: job.job_type ?? null,
        description: job.description ?? null,
        lat: job.lat ?? null, lng: job.lng ?? null,
        geocoded_at: job.lat != null ? now : null,
        status: 'new_lead', status_changed_at: now,
      }
      let res = await supabase.from('jobs').insert(base).select().single()
      if (res.error && /(column|schema cache|could not find)/i.test(res.error.message)) {
        const { category: _c, geocoded_at: _g, ...fallback } = base
        res = await supabase.from('jobs').insert(fallback).select().single()
      }
      if (res.error) throw res.error
      const newJob = res.data
      if (!newJob?.id) throw new Error('Copy is not available in demo mode.')

      let newQuoteId = null
      if (quote) {
        const items = (Array.isArray(quote.line_items) ? quote.line_items : []).map(it => ({ ...it, id: uuid() }))
        const meta = {
          job_id: newJob.id, status: 'draft', client_view_token: uuid().replace(/-/g, ''),
          valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          ...(session?.user?.id ? { created_by: session.user.id } : {}),
        }
        const payload = {
          line_items: items, subtotal: quote.subtotal ?? null, gst: quote.gst ?? null, total: quote.total ?? null,
          notes: quote.notes ?? null, private_notes: quote.private_notes ?? null, job_pack: quote.job_pack ?? null,
        }
        let q = await supabase.from('quotes').insert({ ...meta, ...payload }).select().single()
        if (q.error && /(job_pack|private_notes|notes|valid_until|created_by)/.test(q.error.message)) {
          const { job_pack: _jp, private_notes: _pn, notes: _n, ...p2 } = payload
          const { valid_until: _v, created_by: _cb, ...m2 } = meta
          q = await supabase.from('quotes').insert({ ...m2, ...p2 }).select().single()
        }
        if (q.error) throw q.error
        newQuoteId = q.data?.id ?? null
      }

      await Promise.all([
        supabase.rpc('add_job_note', { p_job_id: newJob.id, p_body: `Copied from job ${number}`, p_kind: 'note' }),
        supabase.rpc('add_job_note', { p_job_id: job.id, p_body: `Copied to job ${jobNumber(newJob)}`, p_kind: 'note' }),
      ])
      onFieldSaved?.()
      go(newQuoteId ? `/quotes/${newQuoteId}` : `/quotes/new?job=${newJob.id}`)
    } catch (e) {
      setNotice({ err: true, msg: e?.message || 'Copy failed.' })
    } finally {
      setBusy(null)
    }
  }

  async function pushToXero(quoteId) {
    if (!quoteId) return
    setXeroStatus('pushing')
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/xero-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token}` },
        body: JSON.stringify({ quote_id: quoteId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setXeroStatus(body?.error?.includes('not connected') ? 'not_connected' : 'err')
      } else {
        setXeroStatus('ok')
        // The push also advances the job to 'invoiced' server-side, so refresh
        // the list and close. Brief pause so the tick is seen first.
        setTimeout(() => onUpdated?.(), 1200)
      }
    } catch {
      setXeroStatus('err')
    }
  }

  // Stage the completed job for its client portal (Spencers = 'dbs', Downer =
  // 'downer'): 'push_photos' (per-line Before/During/After) and
  // 'upload_documents' (the quote PDF into Documents). The worker drains the
  // queue; the admin then marks each item complete and submits in the portal.
  async function enqueuePortal(action, setState) {
    setState('pushing')
    try {
      const q = (fullQuotes ?? job.quotes ?? []).find(x => ['accepted', 'complete', 'invoiced'].includes(x.status)) ?? quote
      const { data: ph } = await supabase.from('job_photos')
        .select('url, phase, line_ref').eq('job_id', job.id).in('phase', ['before', 'during', 'after', 'extra'])
      const grouped = { before: [], during: [], after: [], extra: [] }
      for (const p of (ph ?? [])) { if (grouped[p.phase]) grouped[p.phase].push({ url: p.url, line_ref: p.line_ref }) }
      const { error } = await supabase.from('portal_actions').insert({
        job_id: job.id,
        ko_reference: job.ko_reference || null,
        source: category === 'downer' ? 'downer' : 'dbs',
        action,
        payload: { quote_id: q?.id ?? null, total: q?.total ?? null, category, address: job.address, photos: grouped },
      })
      if (error) throw error
      setState('done')
    } catch {
      setState('err')
    }
  }

  async function sendText() {
    if (!phone || !smsText.trim()) return
    setSmsSending(true); setSmsNote(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ to: phone, message: smsText.trim(), job_id: job.id, kind: 'manual' }),
      })
      const b = await res.json()
      if (!res.ok) { setSmsNote({ err: true, msg: b.notConfigured ? 'SMS not live yet — Twilio account upgrade pending' : (b.error || 'Send failed') }); return }
      setSmsNote({ err: false, msg: `Sent to ${b.to}` }); setSmsText(''); setOpen(o => ({ ...o, sms: false }))
    } catch {
      setSmsNote({ err: true, msg: 'Send failed' })
    } finally {
      setSmsSending(false)
    }
  }

  function buildFormUrl(f) {
    const d = new Date()
    const p = new URLSearchParams({
      job_id: job.id, job_address: job.address ?? '',
      job_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      job_type: job.job_type ?? '', form_id: f.id,
    })
    return `${f.url}?${p}`
  }

  // ── Client / job details edit form ──────────────────────────────────────
  const [form, setForm] = useState({
    address: job.address ?? '', job_type: job.job_type ?? '', description: job.description ?? '',
    lat: job.lat ?? null, lng: job.lng ?? null,
    phone: job.clients?.phone ?? '', email: job.clients?.email ?? '',
  })

  async function handleSave() {
    const { error } = await supabase.from('jobs').update({
      // Address doubles as the job title — keep them in sync on edit.
      title: form.address, address: form.address, job_type: form.job_type, description: form.description,
      // Verified coords land the pin immediately; a retyped address clears them
      // so the Planner's geocode pass re-resolves it rather than keeping a stale pin.
      lat: form.lat, lng: form.lng, geocoded_at: form.lat != null ? new Date().toISOString() : null,
    }).eq('id', job.id)
    if (error) { alert(`Save failed: ${error.message}`); return }
    const cid = job.clients?.id ?? job.client_id
    if (cid && (form.phone !== (job.clients?.phone ?? '') || form.email !== (job.clients?.email ?? ''))) {
      const { error: cErr } = await supabase.from('clients').update({ phone: form.phone || null, email: form.email || null }).eq('id', cid)
      if (cErr) { alert(`Client save failed: ${cErr.message}`); return }
    }
    setEditing(false)
    if (onFieldSaved) onFieldSaved()
    else onUpdated?.()
  }

  // ── Primary action row, computed from status ────────────────────────────
  const actions = (() => {
    const list = []
    const add = (label, onClick, { primary = false, disabled = false, title } = {}) => list.push({ label, onClick, primary, disabled, title })
    const editLabel = quote?.id ? 'Edit quote' : 'Write quote'
    const s = job.status

    if (!isStaff) {
      // Crew/truck logins keep only the two moves they have today.
      if (s === 'complete_to_invoice' && canChangeStatusTo('stump_grinding')) add('Stump grinding', () => applyStatus('stump_grinding'))
      if (s === 'stump_grinding' && canChangeStatusTo('complete_to_invoice')) add('Mark done', () => applyStatus('complete_to_invoice'), { primary: true })
      if (['scheduled', 'stump_grinding', 'complete_to_invoice'].includes(s)) add('Open work order', () => go(`/workorder/${job.id}`), { primary: list.length === 0 })
      return list
    }

    switch (s) {
      case 'new_lead':
        add('Book visit', () => go(`/quote-runs?job=${job.id}`), { primary: true })
        add(editLabel, () => go(quotePath))
        break
      case 'quote_scheduled':
        add(editLabel, () => go(quotePath), { primary: true })
        break
      case 'quote_sent':
        add(busy === 'followup' ? 'Sending…' : 'Send follow-up', () => sendFollowUp('email'), { primary: true, disabled: !quote?.id || busy === 'followup', title: quote?.id ? 'Email follow-up' : 'No sent quote to follow up' })
        if (phone) add('SMS follow-up', () => sendFollowUp('sms'), { disabled: !quote?.id || busy === 'followup' })
        add('Accept on behalf', acceptOnBehalf, { disabled: !quote?.id || busy === 'accept' })
        add('Edit quote', () => go(quotePath))
        break
      case 'accepted_to_schedule':
        add('Schedule', () => go(`/calendar?job=${job.id}`), { primary: true })
        add('Edit quote', () => go(quotePath))
        break
      case 'scheduled':
        add('Open work order', () => go(`/workorder/${job.id}`), { primary: true })
        add('Mark done', () => applyStatus('complete_to_invoice'))
        break
      case 'stump_grinding':
        add('Mark done', () => applyStatus('complete_to_invoice'), { primary: true })
        break
      case 'complete_to_invoice': {
        if (portal) {
          add(photosPush === 'pushing' ? 'Staging photos…' : photosPush === 'done' ? 'Photos queued' : photosPush === 'err' ? 'Photos failed — retry' : 'Upload photos to portal',
            () => enqueuePortal('push_photos', setPhotosPush), { primary: true, disabled: photosPush === 'pushing' })
          add(docsPush === 'pushing' ? 'Uploading PDF…' : docsPush === 'done' ? 'Quote PDF queued' : docsPush === 'err' ? 'PDF failed — retry' : 'Upload quote PDF to portal',
            () => enqueuePortal('upload_documents', setDocsPush), { disabled: docsPush === 'pushing' })
        } else {
          const invQuote = (fullQuotes ?? job.quotes ?? []).find(x => ['accepted', 'complete', 'invoiced'].includes(x.status))
          const label = xeroStatus === 'pushing' ? 'Pushing to Xero…' : xeroStatus === 'ok' ? 'Invoice created in Xero' : xeroStatus === 'err' ? 'Xero push failed — retry' : xeroStatus === 'not_connected' ? 'Xero not connected (Settings)' : 'Invoice in Xero'
          add(label, () => pushToXero(invQuote?.id), { primary: true, disabled: !invQuote || xeroStatus === 'pushing' || xeroStatus === 'ok', title: invQuote ? '' : 'Needs an accepted quote' })
        }
        add('Mark invoiced', () => applyStatus('invoiced'))
        add('Stump grinding', () => applyStatus('stump_grinding'))
        break
      }
      case 'on_hold':
        add('Resume', () => applyStatus(forwardHint), { primary: true, title: `Back to ${JOB_STATUSES[forwardHint]?.label ?? forwardHint}` })
        break
      case 'declined':
        add('Reopen', () => applyStatus('quote_sent'), { primary: true })
        break
      default:
        break
    }
    return list
  })()

  // ── … menu ──────────────────────────────────────────────────────────────
  const menu = (() => {
    const items = []
    const it = (label, onClick, opts = {}) => items.push({ label, onClick, ...opts })
    if (isStaff) {
      if (versionCount >= 2 && quote?.id) it('Versions', () => toggle('versions'), { right: versionLabel })
      it('Copy to new quote', copyToNewQuote, { disabled: busy === 'copy' })
      if (quote?.client_view_token) it('Preview as client', () => window.open(`/q/${quote.client_view_token}?preview=1`, '_blank', 'noopener'))
      if (portal) {
        it('Upload photos to portal', () => enqueuePortal('push_photos', setPhotosPush), { sep: true, color: '#6D4AA8' })
        it('Upload quote PDF to portal', () => enqueuePortal('upload_documents', setDocsPush), { color: '#6D4AA8' })
        if (portalUrl) it(category === 'downer' ? 'Open in Downer portal' : 'Open in DBS portal', () => window.open(portalUrl, '_blank', 'noopener'), { color: '#6D4AA8' })
      }
      it(portal ? 'Tenant & job manager details' : 'Client details', () => toggle('client'), { sep: true })
      it(portal ? 'Portal brief & site notes' : 'Enquiry & site notes', () => toggle('reference'))
    }
    it('Work order', () => go(`/workorder/${job.id}`), { sep: !isStaff ? false : true })
    it('Job pack', () => go(`/jobpack/${job.id}`))
    if (phone) it(`Text ${firstName}`, () => { show('sms'); setSmsNote(null) })
    if (isStaff) {
      if (job.status === 'on_hold') it('Resume', () => applyStatus(forwardHint), { sep: true })
      else if (job.status !== 'invoiced' && job.status !== 'declined') it('Put on hold', () => applyStatus('on_hold'), { sep: true })
      if (job.status === 'declined') it('Reopen', () => applyStatus('quote_sent'))
      else if (!['invoiced', 'complete_to_invoice'].includes(job.status)) it('Mark declined', markDeclined, { danger: true })
    }
    return items
  })()

  const referenceInline = isStaff && showsQuoteReference(job.status)
  const showForms = ['scheduled', 'stump_grinding', 'complete_to_invoice'].includes(job.status)
  const btnH = isMobile ? 44 : 40

  // ── Render ──────────────────────────────────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {portal
            ? <span style={{ ...st.cat, background: cat.color }}>{CATEGORY_LABEL[category] ?? cat.label}</span>
            : <span style={st.eyebrow}>{CATEGORY_LABEL[category] ?? cat.label}</span>}
          <span style={st.eyebrow}>
            Job {number}
            {job.ko_reference ? ` · KO ${job.ko_reference}` : ''}
            {quote ? ` · Quote v${versionCount}` : ''}
          </span>
          {statusMeta && (
            <span style={{ ...st.pill, background: statusMeta.color + '1F', color: statusMeta.color }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              {statusMeta.label}{days != null && days > 0 ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}
            </span>
          )}
        </div>
        <div style={st.h1}>
          {displayCase(job.address || job.title) || '—'}
          {job.address && (
            <a href={mapsHref(job.address, job.lat, job.lng)} target="_blank" rel="noreferrer" style={st.mapLink} title="Open in maps" aria-label="Open in maps">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </a>
          )}
        </div>
        <div style={st.clientLine}>
          {portal && clientName && <span>Tenant: </span>}
          {clientName ?? <span style={{ color: 'var(--ink-3)' }}>No client</span>}
          {phone && <> · <a href={telHref(phone)} style={st.tel}>{phone}</a></>}
          {job.clients?.email && !isMobile && <> · <span style={{ color: 'var(--ink-3)' }}>{job.clients.email}</span></>}
          {job.job_type && !portal && <> · <span style={{ color: 'var(--ink-3)' }}>{job.job_type}</span></>}
        </div>
      </div>
      <div style={{ textAlign: isMobile ? 'left' : 'right', flexShrink: 0 }}>
        {quote && (quote.total != null) ? (
          <>
            <div style={{ ...st.eyebrow, marginBottom: 2 }}>Total incl GST</div>
            <div style={st.total}>{nzd(quote.total)}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              {quote.subtotal != null ? `${nzd(quote.subtotal)} ex GST` : ''}
              {quote.valid_until ? ` · valid to ${new Date(quote.valid_until).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : ''}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>No quote yet</div>
        )}
        {portal && (code || kpi) && (
          <div style={{ display: 'flex', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
            {code && <span style={{ ...st.pill, background: '#EBF3FA', color: '#4A7FA5' }}>{code}{sla ? ` · ${sla.label.split('—')[1]?.trim().toLowerCase()}` : ''}</span>}
            {kpi && <span style={{ ...st.pill, background: kpi.expired ? '#FFF0EE' : '#FDF3E3', color: kpi.expired ? '#C0392B' : '#D4851A', fontVariantNumeric: 'tabular-nums' }}>{kpi.expired ? 'overdue ' : 'due in '}{kpi.text}</span>}
          </div>
        )}
      </div>
    </div>
  )

  const slaBanner = sla && (
    <div style={{ background: sla.bg, border: `1px solid ${sla.color}33`, borderRadius: 'var(--radius-ctrl)', padding: '10px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: sla.color, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Kāinga Ora SLA — {sla.label}</div>
      <div style={{ fontSize: 13, color: sla.color, fontWeight: 500 }}>{sla.respond}</div>
      {(code === 'URG' || code === 'EPS') && <div style={{ fontSize: 11, color: sla.color, marginTop: 4, opacity: 0.8 }}>Notify KO immediately if timeframe cannot be met.</div>}
      {code === 'URS' && <div style={{ fontSize: 11, color: sla.color, marginTop: 4, opacity: 0.8 }}>Log contact attempts or appointment in the work order.</div>}
      {code === 'GNL' && <div style={{ fontSize: 11, color: sla.color, marginTop: 4, opacity: 0.8 }}>If 10 days cannot be achieved, notify admin by day 5 to request EOT.</div>}
    </div>
  )

  const actionRow = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {actions.map(a => (
        <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled || busy === 'status'} title={a.title}
          style={{
            ...st.btn, height: btnH, ...(a.primary ? st.btnPrimary : {}),
            ...(isMobile && a.primary ? { flex: '1 1 100%' } : {}),
            opacity: a.disabled || busy === 'status' ? 0.55 : 1,
          }}>
          {a.label}
        </button>
      ))}
      {job.status === 'invoiced' && (
        <span style={{ ...st.pill, background: JOB_STATUSES.invoiced.color + '1F', color: JOB_STATUSES.invoiced.color, height: btnH, padding: '0 14px', fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Done
        </span>
      )}
      {busy === 'status' && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Updating…</span>}
      <span style={{ flex: 1 }} />
      {menu.length > 0 && (
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More actions"
            style={{ ...st.btn, height: btnH, width: btnH, padding: 0, fontSize: 20, letterSpacing: '.1em' }}>
            ⋯
          </button>
          {menuOpen && (
            <div role="menu" style={{ ...st.menu, ...(isMobile ? st.menuSheet : {}) }}>
              {menu.map((m, i) => (
                <button key={m.label + i} role="menuitem" type="button" disabled={m.disabled}
                  onClick={() => { setMenuOpen(false); m.onClick() }}
                  style={{
                    ...st.mi, ...(m.sep ? st.miSep : {}),
                    color: m.danger ? '#B23A2E' : (m.color || 'var(--ink)'),
                    opacity: m.disabled ? 0.5 : 1, minHeight: isMobile ? 44 : 36,
                  }}>
                  <span>{m.label}</span>
                  {m.right && <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>{m.right}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  const followLine = job.status === 'quote_sent' && quote?.sent_at && (
    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
      {(quote.opened_count ?? 0) > 0 ? `Opened ${quote.opened_count}× · last ${relWhen(quote.last_opened_at)}` : 'Not opened yet'}
      <span style={{ color: 'var(--ink-3)' }}> · sent {relWhen(quote.sent_at)}</span>
      {(quote.followup_count ?? 0) > 0 && <span style={{ color: '#4A7FA5' }}> · followed up {quote.followup_count}× · last {relWhen(quote.last_followup_at)}</span>}
    </div>
  )

  const clientSection = open.client && (
    <Section title={portal ? 'Tenant & job manager' : 'Client details'} onClose={() => { toggle('client'); setEditing(false) }}>
      {editing && isStaff ? (
        <div>
          <Label>Address (used as the job title)</Label>
          <AddressInput inputStyle={st.input} value={form.address}
            onChange={v => setForm(p => ({ ...p, address: v, lat: null, lng: null }))}
            onResolve={({ address, lat, lng }) => setForm(p => ({ ...p, address, lat, lng }))} />
          <Label>Job type</Label>
          <input style={st.input} value={form.job_type} onChange={e => setForm(p => ({ ...p, job_type: e.target.value }))} placeholder="pruning, removal, stump…" />
          {(job.clients?.id || job.client_id) && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
              <div><Label>Client phone</Label><input style={st.input} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} inputMode="tel" /></div>
              <div><Label>Client email</Label><input style={st.input} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} inputMode="email" /></div>
            </div>
          )}
          <Label>Description / notes</Label>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4} style={{ ...st.input, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={handleSave} style={{ ...st.btn, ...st.btnPrimary, height: btnH }}>Save</button>
            <button type="button" onClick={() => setEditing(false)} style={{ ...st.btn, height: btnH }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px 16px' }}>
          <Row label="Client" value={clientName} />
          <Row label="Phone" value={phone ? <a href={telHref(phone)} style={st.tel}>{phone}</a> : null} />
          <Row label="Email" value={job.clients?.email ? <a href={`mailto:${job.clients.email}`} style={{ color: 'var(--ink)' }}>{job.clients.email}</a> : null} />
          <Row label="Address" value={job.address ? <a href={mapsHref(job.address, job.lat, job.lng)} target="_blank" rel="noreferrer" style={{ color: '#4A7FA5' }}>{job.address}</a> : null} />
          <Row label="Job type" value={job.job_type} />
          {job.ko_reference && <Row label="KO reference" value={job.ko_reference} />}
          {job.description && <div style={{ gridColumn: '1 / -1' }}><Row label="Notes" value={<span style={{ whiteSpace: 'pre-wrap' }}>{job.description}</span>} /></div>}
          {isStaff && (
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="button" onClick={() => setEditing(true)} style={{ ...st.btn, height: btnH }}>Edit details</button>
            </div>
          )}
        </div>
      )}
    </Section>
  )

  const referenceSection = (open.reference || referenceInline) && (
    <div>
      {open.reference && !referenceInline && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button type="button" onClick={() => toggle('reference')} style={st.linkBtn}>Hide</button>
        </div>
      )}
      <QuoteReference jobId={job.id} title={portal ? 'Portal brief & site notes' : 'Enquiry & site notes'} />
    </div>
  )

  const versionsSection = open.versions && quote?.id && (
    <Section title="Versions" onClose={() => toggle('versions')}>
      <QuoteVersionHistory quoteId={quote.id} refreshKey={quote.status} />
    </Section>
  )

  const smsSection = open.sms && phone && (
    <Section title={`Text ${firstName}`} onClose={() => { toggle('sms'); setSmsText('') }}>
      <textarea autoFocus value={smsText} onChange={e => setSmsText(e.target.value)} placeholder={`Message to ${firstName}…`} rows={3} maxLength={480}
        style={{ ...st.input, resize: 'vertical' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{smsText.length}/480 · {phone}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { toggle('sms'); setSmsText('') }} style={{ ...st.btn, height: btnH }}>Cancel</button>
          <button type="button" onClick={sendText} disabled={!smsText.trim() || smsSending} style={{ ...st.btn, ...st.btnPrimary, height: btnH, opacity: !smsText.trim() || smsSending ? 0.5 : 1 }}>{smsSending ? 'Sending…' : 'Send text'}</button>
        </div>
      </div>
      {smsNote && <div style={{ fontSize: 12, marginTop: 6, color: smsNote.err ? 'var(--danger)' : 'var(--terra)' }}>{smsNote.msg}</div>}
    </Section>
  )

  const formsSection = showForms && (
    <div>
      <div style={st.eyebrow}>Job forms</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {JOB_FORMS.map(f => {
          const done = formStatus[f.id]?.completed
          return (
            <button key={f.id} type="button" onClick={() => setActiveForm(f)} style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: btnH, padding: '8px 12px', borderRadius: 'var(--radius-ctrl)', width: '100%', textAlign: 'left',
              border: done ? '1.5px solid #2e7d3244' : f.required ? '1.5px solid #C0392B33' : '1.5px dashed var(--line)',
              background: done ? '#F0FFF4' : f.required ? '#FFF8F8' : '#FAFAFA', cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{f.label}</span>
              {done
                ? <span style={{ color: '#2e7d32', fontSize: 15, fontWeight: 700 }}>✓ done</span>
                : f.required
                  ? <span style={{ color: '#C0392B', fontSize: 12, fontWeight: 700 }}>required</span>
                  : <span style={{ color: 'var(--ink-3)', fontSize: 12, fontWeight: 600 }}>+ add</span>}
            </button>
          )
        })}
      </div>
    </div>
  )

  const noticeLine = (notice || smsNote) && !open.sms && (
    <div style={{ fontSize: 12, color: (notice?.err ?? smsNote?.err) ? 'var(--danger)' : 'var(--terra)' }}>{notice?.msg ?? smsNote?.msg}</div>
  )

  const leftColumn = (
    <div style={{ ...st.left, ...(isMobile ? st.leftMobile : {}) }}>
      {header}
      {slaBanner}
      <StatusStepper status={job.status} forwardHint={forwardHint} compact={isMobile} />
      {actionRow}
      {followLine}
      {noticeLine}
      {clientSection}
      {versionsSection}
      {smsSection}
      {referenceSection}
      <QuoteLines quote={quote} photos={photos} portal={portal} compact={isMobile}
        onEdit={isStaff ? () => go(quotePath) : null} />
      {portal && (
        <ErrorBoundary variant="section" label="Portal data">
          <SpencersPortalData job={job} />
          <SpencersInvoice job={job} />
        </ErrorBoundary>
      )}
      {formsSection}
    </div>
  )

  const rightColumn = (
    <div style={{ ...st.right, ...(isMobile ? st.rightMobile : {}) }}>
      <ActivityFeed job={job} quote={quote} embedded={isMobile} headInset={isMobile ? 0 : 44}
        onStatusApplied={() => { onUpdated?.(); onClose() }} />
    </div>
  )

  return (
    <>
      {activeForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0, background: '#fff' }}>
            <button type="button" onClick={() => setActiveForm(null)} style={{ ...st.btn, height: btnH }}>← Back to job</button>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{activeForm.label}</span>
            {formStatus[activeForm.id]?.completed && <span style={{ marginLeft: 'auto', color: '#2e7d32', fontWeight: 700, fontSize: 13 }}>✓ Complete</span>}
          </div>
          <iframe src={buildFormUrl(activeForm)} style={{ flex: 1, border: 'none', width: '100%' }} title={activeForm.label} />
        </div>
      )}

      <div style={st.backdrop} onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-label={`Job ${number}`} style={{ ...st.panel, ...(isMobile ? st.panelMobile : {}) }}>
        {portal && <div style={{ height: 6, background: cat.color, flexShrink: 0 }} />}
        {isMobile ? (
          <div style={st.topBar}>
            <span style={st.eyebrow}>Job {number}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} aria-label="Close" style={{ ...st.close, position: 'static' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...st.close, top: portal ? 16 : 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
        <div style={{ ...st.columns, ...(isMobile ? st.columnsMobile : {}) }}>
          {leftColumn}
          {rightColumn}
        </div>
      </div>
    </>
  )
}

function Section({ title, onClose, children }) {
  return (
    <div style={st.section}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={st.eyebrow}>{title}</span>
        <span style={{ flex: 1 }} />
        {onClose && <button type="button" onClick={onClose} style={st.linkBtn}>Hide</button>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink)' }}>{value}</div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4, marginTop: 10 }}>{children}</div>
}

const st = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.25)', zIndex: 100, backdropFilter: 'blur(2px)' },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(1120px, 96vw)',
    background: '#fff', zIndex: 101, boxShadow: '-4px 0 24px rgba(44,36,22,0.15)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    borderRadius: '22px 0 0 22px',
  },
  panelMobile: { inset: 0, width: '100%', borderRadius: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  topBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 8px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0, position: 'sticky', top: 0, background: '#fff', zIndex: 3 },
  close: {
    position: 'absolute', right: 12, zIndex: 3, width: 40, height: 40, borderRadius: '50%',
    border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  columns: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', flex: 1, minHeight: 0 },
  columnsMobile: { display: 'flex', flexDirection: 'column', flex: 'none', minHeight: '100%' },
  left: {
    padding: '24px 30px 30px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', minWidth: 0,
    borderRight: '1px solid var(--line)', WebkitOverflowScrolling: 'touch',
  },
  leftMobile: { padding: '20px 16px 20px', gap: 16, overflowY: 'visible', borderRight: 'none' },
  right: { minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cream)' },
  rightMobile: {
    borderTop: '1px solid var(--line)',
    paddingBottom: 'calc(16px + var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))',
  },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' },
  cat: { display: 'inline-flex', alignItems: 'center', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.3, whiteSpace: 'nowrap' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  h1: { fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  mapLink: { color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', minWidth: 28, minHeight: 28, justifyContent: 'center' },
  clientLine: { fontSize: 14, color: 'var(--ink-2)', marginTop: 4 },
  tel: { color: 'var(--terra)', fontWeight: 700, textDecoration: 'none', display: 'inline-block', padding: '4px 0' },
  total: { fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' },
  btn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 18px',
    borderRadius: 'var(--radius-ctrl)', fontWeight: 700, fontSize: 14, border: '1px solid var(--line)', background: '#fff',
    color: 'var(--ink)', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  btnPrimary: { background: 'var(--terra)', borderColor: 'var(--terra)', color: '#fff' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 32, padding: '0 6px' },
  menu: {
    position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 5, background: '#fff', border: '1px solid var(--line)',
    borderRadius: 'var(--radius-ctrl)', boxShadow: '0 12px 32px -12px rgba(40,25,10,.35)', padding: 6, width: 250,
  },
  menuSheet: { position: 'fixed', left: 8, right: 8, top: 'auto', bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', width: 'auto', maxHeight: '70vh', overflowY: 'auto' },
  mi: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 9,
    fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  miSep: { borderTop: '1px solid var(--line)', borderRadius: '0 0 9px 9px', marginTop: 4, paddingTop: 10 },
  section: { border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px 16px', background: '#fff' },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-ctrl)', border: '1px solid var(--line)', fontSize: 14,
    fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--cream)', boxSizing: 'border-box', minHeight: 40,
  },
}
