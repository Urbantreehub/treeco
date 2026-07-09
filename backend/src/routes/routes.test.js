import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'

vi.mock('../db.js', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock.js')
  const m = createSupabaseMock()
  return { supabaseAdmin: m.supabaseAdmin, supabaseAs: m.supabaseAs, __mock: m }
})

import { createApp } from '../app.js'
import * as db from '../db.js'

const mock = db.__mock
const app = createApp()

const AUTH = { Authorization: 'Bearer token' }

// Make requireAuth pass as the given access level.
function signInAs(access_level) {
  mock.setUser({ id: 'u1', email: 'a@b.c' })
  mock.setResponse('users', () => ({
    data: { id: 'u1', name: 'Josh', email: 'a@b.c', access_level, active: true },
    error: null,
  }))
}

beforeEach(() => mock.reset())

describe('authentication gating', () => {
  it('401 on a protected route with no token', async () => {
    const res = await request(app).get('/api/jobs')
    expect(res.status).toBe(401)
  })

  it('403 when a restricted user hits a full-access-only route', async () => {
    signInAs('restricted')
    const res = await request(app).post('/api/jobs').set(AUTH).send({ title: 'x' })
    expect(res.status).toBe(403)
  })

  it('403 when a restricted user tries to create a quote', async () => {
    signInAs('restricted')
    const res = await request(app).post('/api/quotes').set(AUTH)
      .send({ job_id: 'j1', client_id: 'c1', line_items: [] })
    expect(res.status).toBe(403)
  })
})

describe('input validation', () => {
  it('400 when creating a quote without job_id/client_id', async () => {
    signInAs('full')
    const res = await request(app).post('/api/quotes').set(AUTH).send({ line_items: [] })
    expect(res.status).toBe(400)
  })

  it('400 when changing status to an invalid value', async () => {
    signInAs('full')
    const res = await request(app).put('/api/jobs/j1/status').set(AUTH).send({ status: 'not_a_status' })
    expect(res.status).toBe(400)
  })

  it('400 when changing status with no status field', async () => {
    signInAs('full')
    const res = await request(app).put('/api/jobs/j1/status').set(AUTH).send({})
    expect(res.status).toBe(400)
  })
})

describe('restricted user status changes', () => {
  it('403 when changing status on a job they are not assigned to', async () => {
    signInAs('restricted')
    mock.setResponse('schedule', () => ({ data: [], error: null })) // no assignment rows
    const res = await request(app).put('/api/jobs/j1/status').set(AUTH).send({ status: 'scheduled' })
    expect(res.status).toBe(403)
  })
})

describe('quote creation pricing', () => {
  it('computes subtotal/gst/total and persists them', async () => {
    signInAs('full')
    mock.setResponse('quotes', (ctx) => ({ data: { id: 'q1', ...ctx.payload }, error: null }))
    const res = await request(app).post('/api/quotes').set(AUTH).send({
      job_id: 'j1', client_id: 'c1',
      line_items: [{ qty: 2, rate: 100 }, { qty: 1, rate: 50 }],
    })
    expect(res.status).toBe(201)
    const insert = mock.calls.find(c => c.table === 'quotes' && c.op === 'insert')
    expect(insert.payload.subtotal).toBe(250)
    expect(insert.payload.gst).toBe(37.5)
    expect(insert.payload.total).toBe(287.5)
  })
})

describe('public quote lifecycle (no login)', () => {
  it('400 on an invalid decision', async () => {
    const res = await request(app).post('/q/public/tok/respond').send({ decision: 'maybe' })
    expect(res.status).toBe(400)
  })

  it('accepting a quote moves the job to accepted_to_schedule', async () => {
    mock.setResponse('quotes', () => ({ data: { id: 'q1', job_id: 'j1', status: 'accepted' }, error: null }))
    mock.setResponse('jobs', () => ({ data: null, error: null }))
    const res = await request(app).post('/q/public/tok/respond').send({ decision: 'accepted' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, decision: 'accepted' })
    const jobUpdate = mock.calls.find(c => c.table === 'jobs' && c.op === 'update')
    expect(jobUpdate).toBeTruthy()
    expect(jobUpdate.payload.status).toBe('accepted_to_schedule')
  })

  it('declining a quote does not move the job forward', async () => {
    mock.setResponse('quotes', () => ({ data: { id: 'q1', job_id: 'j1', status: 'declined' }, error: null }))
    const res = await request(app).post('/q/public/tok/respond').send({ decision: 'declined' })
    expect(res.status).toBe(200)
    const jobUpdate = mock.calls.find(c => c.table === 'jobs' && c.op === 'update')
    expect(jobUpdate).toBeUndefined()
  })

  it('viewing a sent quote records it as viewed', async () => {
    mock.setResponse('quotes', () => ({
      data: { id: 'q1', status: 'sent', line_items: [], subtotal: 0, gst: 0, total: 0, jobs: {} },
      error: null,
    }))
    const res = await request(app).get('/q/public/tok')
    expect(res.status).toBe(200)
    const viewedUpdate = mock.calls.find(c => c.table === 'quotes' && c.op === 'update')
    expect(viewedUpdate).toBeTruthy()
    expect(viewedUpdate.payload.status).toBe('viewed')
  })
})

describe('sending a quote', () => {
  it('generates a client link and moves the job to quote_sent', async () => {
    signInAs('full')
    mock.setResponse('quotes', () => ({ data: { id: 'q1', job_id: 'j1' }, error: null }))
    mock.setResponse('jobs', () => ({ data: null, error: null }))
    const res = await request(app).post('/api/quotes/q1/send').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body.client_url).toContain('/q/')
    const sent = mock.calls.find(c => c.table === 'quotes' && c.op === 'update')
    expect(sent.payload.status).toBe('sent')
    expect(sent.payload.client_view_token).toBeTruthy()
    const jobUpdate = mock.calls.find(c => c.table === 'jobs' && c.op === 'update')
    expect(jobUpdate.payload.status).toBe('quote_sent')
  })
})
