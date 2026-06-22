import { Router } from 'express'
import { requireAuth, requireFullAccess } from '../middleware/auth.js'
import { supabaseAdmin } from '../db.js'

const router = Router()

// GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', requireAuth, async (req, res) => {
  const { start, end } = req.query
  if (!start || !end) return res.status(400).json({ error: 'start and end required' })

  let query = supabaseAdmin
    .from('schedule')
    .select(`
      id, job_id, date, start_time, end_time, assigned_to, status,
      jobs (id, title, address, job_type, estimated_value, status, clients(name))
    `)
    .gte('date', start)
    .lte('date', end)

  if (req.profile.access_level === 'restricted') {
    query = query.contains('assigned_to', [req.profile.id])
  }

  const { data, error } = await query.order('date').order('start_time')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/schedule — schedule a job onto the calendar
router.post('/', requireAuth, requireFullAccess, async (req, res) => {
  const { job_id, date, start_time, end_time, assigned_to } = req.body
  if (!job_id || !date) return res.status(400).json({ error: 'job_id and date required' })

  const { data, error } = await supabaseAdmin
    .from('schedule')
    .insert({ job_id, date, start_time, end_time, assigned_to: assigned_to ?? [] })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Move job to 'scheduled' status
  await supabaseAdmin
    .from('jobs')
    .update({ status: 'scheduled', status_changed_at: new Date().toISOString() })
    .eq('id', job_id)

  res.status(201).json(data)
})

// PUT /api/schedule/:id — reschedule or reassign
router.put('/:id', requireAuth, requireFullAccess, async (req, res) => {
  const allowed = ['date', 'start_time', 'end_time', 'assigned_to', 'status']
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await supabaseAdmin
    .from('schedule')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
