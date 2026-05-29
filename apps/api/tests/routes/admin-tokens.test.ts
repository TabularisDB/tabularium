import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'

async function adminJwt() {
  const u = await makeUser({ role: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('/api/admin/tokens', () => {
  beforeEach(clearDb)

  it('POST creates a token, GET lists it, the plaintext token authenticates', async () => {
    const jwt = await adminJwt()
    const app = await buildApp()

    const createRes = await app.handle(
      new Request('http://localhost/api/admin/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'CI seeder' }),
      }),
    )
    expect(createRes.status).toBe(200)
    const created = (await createRes.json()) as {
      token: string
      row: { id: string; name: string; prefix: string; scopes: string[] | null }
    }
    expect(created.token.startsWith('tbm_')).toBe(true)
    expect(created.row.name).toBe('CI seeder')
    expect(created.row.prefix.startsWith('tbm_')).toBe(true)
    expect(created.row.prefix.length).toBe(12)

    const listRes = await app.handle(
      new Request('http://localhost/api/admin/tokens', { headers: { Authorization: `Bearer ${jwt}` } }),
    )
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { tokens: { id: string; prefix: string }[] }
    expect(list.tokens).toHaveLength(1)
    expect(list.tokens[0].id).toBe(created.row.id)
    // No plaintext token is ever returned again.
    expect(JSON.stringify(list)).not.toContain(created.token)

    // The new token works against any admin endpoint.
    const useRes = await app.handle(
      new Request('http://localhost/api/admin/docs', { headers: { Authorization: `Bearer ${created.token}` } }),
    )
    expect(useRes.status).toBe(200)
  })

  it('rejects an invalid token with 401', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/docs', { headers: { Authorization: 'Bearer tbm_definitely_not_real' } }),
    )
    expect(res.status).toBe(401)
  })

  it('DELETE revokes the token; reuse afterwards returns 401', async () => {
    const jwt = await adminJwt()
    const app = await buildApp()
    const createRes = await app.handle(
      new Request('http://localhost/api/admin/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'short-lived' }),
      }),
    )
    const created = (await createRes.json()) as { token: string; row: { id: string } }

    const delRes = await app.handle(
      new Request(`http://localhost/api/admin/tokens/${encodeURIComponent(created.row.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}` },
      }),
    )
    expect(delRes.status).toBe(200)

    const reuseRes = await app.handle(
      new Request('http://localhost/api/admin/docs', { headers: { Authorization: `Bearer ${created.token}` } }),
    )
    expect(reuseRes.status).toBe(401)
  })

  it('rejects empty name', async () => {
    const jwt = await adminJwt()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '   ' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('isolates tokens per user — cannot revoke another admin’s token', async () => {
    const a1 = await adminJwt()
    const a2 = await adminJwt()
    const app = await buildApp()
    const c = await app.handle(
      new Request('http://localhost/api/admin/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${a1}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'private' }),
      }),
    )
    const created = (await c.json()) as { row: { id: string } }
    const del = await app.handle(
      new Request(`http://localhost/api/admin/tokens/${encodeURIComponent(created.row.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${a2}` },
      }),
    )
    expect(del.status).toBe(403)
  })
})
