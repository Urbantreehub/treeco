import { describe, it, expect, beforeEach, vi } from 'vitest'

// Replace the real Supabase client (which needs live env/creds) with our mock.
vi.mock('../db.js', async () => {
  const { createSupabaseMock } = await import('../../test/supabaseMock.js')
  const m = createSupabaseMock()
  return { supabaseAdmin: m.supabaseAdmin, supabaseAs: m.supabaseAs, __mock: m }
})

import { requireAuth, requireFullAccess } from './auth.js'
import * as db from '../db.js'

const mock = db.__mock

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
}

const ACTIVE_FULL = { id: 'u1', name: 'Josh', email: 'a@b.c', access_level: 'full', active: true }

beforeEach(() => mock.reset())

describe('requireAuth', () => {
  it('401 when the Authorization header is missing', async () => {
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: {} }, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('401 when the header is not a Bearer token', async () => {
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: { authorization: 'Basic xyz' } }, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('401 when the token is invalid/expired', async () => {
    mock.setUser(null) // getUser returns an error
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: { authorization: 'Bearer bad' } }, res, next)
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toMatch(/invalid or expired/i)
    expect(next).not.toHaveBeenCalled()
  })

  it('401 when the user has no profile row', async () => {
    mock.setUser({ id: 'u1' })
    mock.setResponse('users', () => ({ data: null, error: { message: 'not found' } }))
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: { authorization: 'Bearer ok' } }, res, next)
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toMatch(/profile not found/i)
    expect(next).not.toHaveBeenCalled()
  })

  it('403 when the account is deactivated', async () => {
    mock.setUser({ id: 'u1' })
    mock.setResponse('users', () => ({ data: { ...ACTIVE_FULL, active: false }, error: null }))
    const res = mockRes()
    const next = vi.fn()
    await requireAuth({ headers: { authorization: 'Bearer ok' } }, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/deactivated/i)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() and attaches req.user/req.profile for a valid active user', async () => {
    mock.setUser({ id: 'u1', email: 'a@b.c' })
    mock.setResponse('users', () => ({ data: ACTIVE_FULL, error: null }))
    const req = { headers: { authorization: 'Bearer good' } }
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.profile).toEqual(ACTIVE_FULL)
    expect(req.user.id).toBe('u1')
    expect(req.token).toBe('good')
  })
})

describe('requireFullAccess', () => {
  it('calls next() for a full-access profile', () => {
    const res = mockRes()
    const next = vi.fn()
    requireFullAccess({ profile: { access_level: 'full' } }, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('403 for a restricted profile', () => {
    const res = mockRes()
    const next = vi.fn()
    requireFullAccess({ profile: { access_level: 'restricted' } }, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('403 when there is no profile at all', () => {
    const res = mockRes()
    const next = vi.fn()
    requireFullAccess({}, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})
