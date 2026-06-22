import { Router } from 'express'
import { requireAuth, requireFullAccess } from '../middleware/auth.js'
import { supabaseAdmin } from '../db.js'

const router = Router()

router.get('/', requireAuth, requireFullAccess, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, phone, email, address, created_at')
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', requireAuth, requireFullAccess, async (req, res) => {
  const { name, phone, email, address, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({ name, phone, email, address, notes })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.get('/:id', requireAuth, requireFullAccess, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*, jobs (id, title, status, created_at, estimated_value)')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Client not found' })
  res.json(data)
})

router.put('/:id', requireAuth, requireFullAccess, async (req, res) => {
  const allowed = ['name', 'phone', 'email', 'address', 'notes']
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
