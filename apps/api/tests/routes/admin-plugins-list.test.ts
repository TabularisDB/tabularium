import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { signJwt } from '../../src/lib/jwt'

async function adminToken() {
  const u = await makeUser({ role: 'admin', username: 'admin' })
  return {
    user: u,
    token: await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' }),
  }
}

async function listPlugins(token: string, qs = '') {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost/api/admin/plugins/${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
}

describe('GET /api/admin/plugins', () => {
  beforeEach(clearDb)

  // Regression: an explicit `where: undefined` made drizzle throw
  // "Unexpected 'undefined' in filter value" → 500 on the unfiltered list.
  it('lists all plugins without a status filter', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'alpha' })
    await makePlugin(user.id, { id: 'beta', status: 'pending' })

    const res = await listPlugins(token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(body.total).toBe(2)
    expect(body.plugins.map((p) => p.id).sort()).toEqual(['alpha', 'beta'])
  })

  it('filters by status', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'alpha' })
    await makePlugin(user.id, { id: 'beta', status: 'pending' })

    const res = await listPlugins(token, '?status=pending')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(body.total).toBe(1)
    expect(body.plugins[0].id).toBe('beta')
  })
})
