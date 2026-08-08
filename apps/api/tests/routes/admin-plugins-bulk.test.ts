import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'

async function adminToken() {
  const u = await makeUser({ role: 'admin', username: 'admin' })
  return {
    user: u,
    token: await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' }),
  }
}

async function bulk(token: string, body: Record<string, unknown>) {
  const app = await buildApp()
  return app.handle(
    new Request('http://localhost/api/admin/plugins/bulk/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/admin/plugins/bulk (transfer)', () => {
  beforeEach(clearDb)

  it('reassigns ownership of all selected plugins', async () => {
    const { user, token } = await adminToken()
    const newOwner = await makeUser({ username: 'newowner' })
    await makePlugin(user.id, { id: 'alpha' })
    await makePlugin(user.id, { id: 'beta' })

    const res = await bulk(token, { ids: ['alpha', 'beta'], action: 'transfer', ownerId: newOwner.id })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; affected: number; missing: string[] }
    expect(body.ok).toBe(true)
    expect(body.affected).toBe(2)
    expect(body.missing).toEqual([])

    const rows = await db.query.plugins.findMany({ where: { id: { in: ['alpha', 'beta'] } } })
    expect(rows.map((p) => p.ownerId)).toEqual([newOwner.id, newOwner.id])
    for (const row of rows) {
      expect(row.author).toBe(`newowner <${row.repoUrl}>`)
    }
  })

  it('rejects a transfer without ownerId', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'alpha' })

    const res = await bulk(token, { ids: ['alpha'], action: 'transfer' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('ownerId')

    const row = await db.query.plugins.findFirst({ where: { id: 'alpha' } })
    expect(row?.ownerId).toBe(user.id)
  })

  it('rejects a transfer to an unknown user', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'alpha' })

    const res = await bulk(token, { ids: ['alpha'], action: 'transfer', ownerId: 'no-such-user' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('New owner user not found')

    const row = await db.query.plugins.findFirst({ where: { id: 'alpha' } })
    expect(row?.ownerId).toBe(user.id)
  })

  it('reports plugins that do not exist as missing', async () => {
    const { user, token } = await adminToken()
    const newOwner = await makeUser({ username: 'newowner' })
    await makePlugin(user.id, { id: 'alpha' })

    const res = await bulk(token, { ids: ['alpha', 'ghost'], action: 'transfer', ownerId: newOwner.id })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { affected: number; missing: string[] }
    expect(body.missing).toEqual(['ghost'])
  })
})
