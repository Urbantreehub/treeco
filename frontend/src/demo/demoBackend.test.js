import { describe, it, expect, beforeEach } from 'vitest'
import { demoClient, resetDemoData } from './demoBackend'

const db = demoClient

beforeEach(() => { resetDemoData() })

describe('demo backend query engine', () => {
  it('selects all rows from a seeded table', async () => {
    const { data } = await db.from('clients').select('*')
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('filters with eq and returns a single row', async () => {
    const { data } = await db.from('clients').select('*').eq('id', 'c1').single()
    expect(data?.name).toBe('Margaret Thompson')
  })

  it('orders results', async () => {
    const { data } = await db.from('clients').select('*').order('name', { ascending: true })
    const names = data.map(c => c.name)
    expect(names).toEqual([...names].sort())
  })

  it('resolves embedded to-one and to-many relations', async () => {
    const { data } = await db.from('jobs')
      .select('*, clients (id, name), quotes (id, status)')
      .eq('id', 'j3').single()
    expect(data.clients?.name).toBe('Heritage Homes Trust')
    expect(Array.isArray(data.quotes)).toBe(true)
    expect(data.quotes[0]?.status).toBe('sent')
  })

  it('resolves aliased embeds (users:requested_by)', async () => {
    const { data } = await db.from('tool_requests')
      .select('*, users:requested_by ( name )')
      .order('created_at', { ascending: false })
    expect(data[0].users?.name).toBeTruthy()
  })

  it('resolves nested embeds (schedule -> jobs -> clients)', async () => {
    const { data } = await db.from('schedule')
      .select('*, jobs(title, clients(name))').order('date')
    const withJob = data.find(r => r.jobs)
    expect(withJob.jobs.clients?.name).toBeTruthy()
  })

  it('supports .or with nested and() groups', async () => {
    const { data } = await db.from('messages')
      .select('*')
      .or('and(user_id.eq.u-demo,channel.eq.team),and(user_id.eq.u-mara,channel.eq.team)')
    expect(data.length).toBeGreaterThan(0)
    expect(data.every(m => ['u-demo', 'u-mara'].includes(m.user_id))).toBe(true)
  })

  it('supports .not(col, is, null)', async () => {
    const { data } = await db.from('quotes').select('*').not('sent_at', 'is', null)
    expect(data.length).toBeGreaterThan(0)
    expect(data.every(q => q.sent_at !== null)).toBe(true)
  })

  it('supports head/count queries', async () => {
    const { data, count } = await db.from('tool_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'requested')
    expect(data).toBeNull()
    expect(count).toBeGreaterThan(0)
  })

  it('inserts and reads back with generated id', async () => {
    const { data } = await db.from('clients')
      .insert({ name: 'New Person', phone: '021 000 9999' })
      .select().single()
    expect(data.id).toBeTruthy()
    const again = await db.from('clients').select('*').eq('id', data.id).single()
    expect(again.data.name).toBe('New Person')
  })

  it('updates matched rows', async () => {
    await db.from('jobs').update({ status: 'on_hold' }).eq('id', 'j1')
    const { data } = await db.from('jobs').select('status').eq('id', 'j1').single()
    expect(data.status).toBe('on_hold')
  })

  it('deletes matched rows', async () => {
    await db.from('clients').delete().eq('id', 'c9')
    const { data } = await db.from('clients').select('*').eq('id', 'c9')
    expect(data.length).toBe(0)
  })

  it('upserts by conflict key', async () => {
    await db.from('app_settings').upsert({ key: 'dbs_sync_enabled', value: true }, { onConflict: 'key' })
    const { data } = await db.from('app_settings').select('value').eq('key', 'dbs_sync_enabled').maybeSingle()
    expect(data.value).toBe(true)
  })

  it('runs list_staff rpc', async () => {
    const { data } = await db.rpc('list_staff')
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]).toHaveProperty('name')
  })

  it('registers a quote open via rpc', async () => {
    await db.rpc('register_quote_open', { p_token: 'demo-token-rimu' })
    const { data } = await db.from('quotes').select('*').eq('client_view_token', 'demo-token-rimu').single()
    expect(data.opened_count).toBeGreaterThan(0)
  })

  it('resets back to seed', async () => {
    await db.from('clients').delete().eq('id', 'c1')
    resetDemoData()
    const { data } = await db.from('clients').select('*').eq('id', 'c1')
    expect(data.length).toBe(1)
  })
})
