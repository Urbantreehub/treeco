import { Router } from 'express'
import { requireAuth, requireFullAccess } from '../middleware/auth.js'
import { supabaseAdmin, supabaseAs } from '../db.js'

const router = Router()

// GET /api/jobs — pipeline view
// Full access: all jobs. Restricted: only assigned to this user.
router.get('/', requireAuth, async (req, res) => {
  const db = supabaseAs(req.token)
  let query = db
    .from('jobs')
    .select(`
      id, status, title, address, job_type, estimated_value,
      created_at, status_changed_at,
      clients (id, name, phone, email),
      schedule (id, date, start_time, end_time, assigned_to)
    `)
    .order('created_at', { ascending: false })

  if (req.profile.access_level === 'restricted') {
    // RLS on the DB also enforces this — belt and braces
    query = query.contains('schedule.assigned_to', [req.profile.id])
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/jobs — create new job (full access only)
router.post('/', requireAuth, requireFullAccess, async (req, res) => {
  const { client_id, title, address, job_type, description, estimated_value } = req.body

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      client_id,
      title,
      address,
      job_type,
      description,
      estimated_value,
      status: 'new_lead',
      created_by: req.profile.id,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// GET /api/jobs/:id
router.get('/:id', requireAuth, async (req, res) => {
  const db = supabaseAs(req.token)
  const { data, error } = await db
    .from('jobs')
    .select(`
      *,
      clients (id, name, phone, email, address),
      quotes (id, status, total, sent_at, responded_at),
      schedule (id, date, start_time, end_time, assigned_to),
      job_photos (id, url, caption, uploaded_by, created_at)
    `)
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Job not found' })
  res.json(data)
})

// PUT /api/jobs/:id — full update (full access only)
router.put('/:id', requireAuth, requireFullAccess, async (req, res) => {
  const allowed = ['title', 'address', 'job_type', 'description', 'estimated_value', 'client_id', 'status']
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  )

  if (updates.status) updates.status_changed_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// PUT /api/jobs/:id/status — lightweight status change (restricted users allowed on their own jobs)
router.put('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'status required' })

  const VALID_STATUSES = [
    'new_lead', 'quote_scheduled', 'quote_sent', 'accepted_to_schedule',
    'scheduled', 'stump_grinding', 'complete_to_invoice', 'invoiced', 'on_hold',
    'declined',
  ]
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }

  // For restricted users, verify they're assigned to this job
  if (req.profile.access_level === 'restricted') {
    const { data: assigned } = await supabaseAdmin
      .from('schedule')
      .select('id')
      .eq('job_id', req.params.id)
      .contains('assigned_to', [req.profile.id])
      .limit(1)

    if (!assigned?.length) {
      return res.status(403).json({ error: 'You are not assigned to this job' })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
