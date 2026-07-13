import { Router } from 'express'
import { requireAuth, requireFullAccess } from '../middleware/auth.js'
import { supabaseAdmin } from '../db.js'
import { calcQuoteTotals } from '../lib/pricing.js'
import { randomBytes } from 'crypto'

const router = Router()

router.get('/:id', requireAuth, requireFullAccess, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('quotes')
    .select('*, jobs(id, title, address, clients(name, email, phone))')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Quote not found' })
  res.json(data)
})

router.post('/', requireAuth, requireFullAccess, async (req, res) => {
  const { job_id, client_id, line_items } = req.body
  if (!job_id || !client_id) return res.status(400).json({ error: 'job_id and client_id required' })

  const items = line_items ?? []
  const { subtotal, gst, total } = calcQuoteTotals(items)

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .insert({ job_id, client_id, line_items: items, subtotal, gst, total, status: 'draft' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', requireAuth, requireFullAccess, async (req, res) => {
  const { line_items } = req.body
  const items = line_items ?? []
  const { subtotal, gst, total } = calcQuoteTotals(items)

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .update({ line_items: items, subtotal, gst, total })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/quotes/:id/send — generate client token and mark as sent
router.post('/:id/send', requireAuth, requireFullAccess, async (req, res) => {
  const token = randomBytes(24).toString('hex')

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .update({ status: 'sent', client_view_token: token, sent_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Also move job to quote_sent status
  await supabaseAdmin
    .from('jobs')
    .update({ status: 'quote_sent', status_changed_at: new Date().toISOString() })
    .eq('id', data.job_id)

  const clientUrl = `${process.env.APP_URL}/q/${token}`
  res.json({ ...data, client_url: clientUrl })
})

// GET /q/:token — public no-login client view
router.get('/public/:token', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('quotes')
    .select('id, line_items, subtotal, gst, total, status, jobs(title, address)')
    .eq('client_view_token', req.params.token)
    .single()

  if (error) return res.status(404).json({ error: 'Quote not found' })

  // Record that the client viewed it
  if (data.status === 'sent') {
    await supabaseAdmin
      .from('quotes')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', data.id)
  }

  res.json(data)
})

// POST /q/:token/respond — client accepts or declines
router.post('/public/:token/respond', async (req, res) => {
  const { decision, decline_reason } = req.body
  if (!['accepted', 'declined'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be accepted or declined' })
  }

  const { data: quote, error } = await supabaseAdmin
    .from('quotes')
    .update({
      status: decision,
      decline_reason: decline_reason ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq('client_view_token', req.params.token)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Auto-move job status on acceptance
  if (decision === 'accepted') {
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'accepted_to_schedule', status_changed_at: new Date().toISOString() })
      .eq('id', quote.job_id)
  }

  res.json({ success: true, decision })
})

export default router
