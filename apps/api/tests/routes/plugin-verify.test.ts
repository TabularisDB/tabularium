import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { plugins, auditLog } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

async function adminToken() {
  const u = await makeUser({ role: 'admin', username: 'admin' })
  return {
    user: u,
    token: await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' }),
  }
}

async function patchPlugin(slug: string, token: string, body: Record<string, unknown>) {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost/api/admin/plugins/${slug}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  )
}

describe('PATCH /api/admin/plugins/:id verify field', () => {
  beforeEach(clearDb)

  it('marks plugin as verified and records who/when', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'verify-me' })
    const before = Date.now() - 1

    const res = await patchPlugin('verify-me', token, { verified: true })
    expect(res.status).toBe(200)

    const row = await db.query.plugins.findFirst({ where: { id: 'verify-me' } })
    expect(row?.verifiedAt).toBeGreaterThan(before)
    expect(row?.verifiedBy).toBe(user.id)
  })

  it('clears verified state on unverify', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'verify-me', verifiedAt: Date.now(), verifiedBy: user.id })

    const res = await patchPlugin('verify-me', token, { verified: false })
    expect(res.status).toBe(200)

    const row = await db.query.plugins.findFirst({ where: { id: 'verify-me' } })
    expect(row?.verifiedAt).toBeNull()
    expect(row?.verifiedBy).toBeNull()
  })

  it('emits a plugin.verify audit entry on transition to true', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'verify-me' })

    await patchPlugin('verify-me', token, { verified: true })

    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.verify'))
    expect(entries).toHaveLength(1)
    expect(entries[0].target).toBe('plugin:verify-me')
    expect(entries[0].actorId).toBe(user.id)
  })

  it('emits a plugin.unverify audit entry on transition to false', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'verify-me', verifiedAt: Date.now(), verifiedBy: user.id })

    await patchPlugin('verify-me', token, { verified: false })

    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.unverify'))
    expect(entries).toHaveLength(1)
    expect(entries[0].target).toBe('plugin:verify-me')
  })

  it('does NOT emit plugin.verify when value is unchanged (idempotent)', async () => {
    const { user, token } = await adminToken()
    await makePlugin(user.id, { id: 'verify-me', verifiedAt: Date.now(), verifiedBy: user.id })

    await patchPlugin('verify-me', token, { verified: true })

    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'plugin.verify'))
    expect(entries).toHaveLength(0)
  })

  it('returns 403 for non-admin', async () => {
    const u = await makeUser({ role: 'user', username: 'normie' })
    const token = await signJwt({
      sub: u.id,
      identityId: u.identityId,
      username: u.username,
      providerInstanceId: 'github',
    })
    await makePlugin(u.id, { id: 'verify-me' })

    const res = await patchPlugin('verify-me', token, { verified: true })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/plugins verified filter & sort', () => {
  beforeEach(clearDb)

  it('verified=1 returns only verified plugins', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'a-plain', name: 'Plain' })
    await makePlugin(u.id, { id: 'b-vetted', name: 'Vetted', verifiedAt: Date.now(), verifiedBy: u.id })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins?verified=1'))
    const data = (await res.json()) as { total: number; plugins: Array<{ id: string }> }
    expect(data.total).toBe(1)
    expect(data.plugins[0].id).toBe('b-vetted')
  })

  it('default sort places verified plugins before unverified', async () => {
    const u = await makeUser()
    const t = Date.now()
    await db.insert(plugins).values({
      id: 'a-plain',
      ownerId: u.id,
      providerInstanceId: 'github',
      name: 'Plain',
      description: 'd',
      author: 'a',
      repoUrl: 'r',
      homepage: 'h',
      webhookSecret: 'ws',
      manifestVersion: '1.0.0',
      updatedAt: t,
    })
    await db.insert(plugins).values({
      id: 'b-vetted',
      ownerId: u.id,
      providerInstanceId: 'github',
      name: 'Vetted',
      description: 'd',
      author: 'a',
      repoUrl: 'r',
      homepage: 'h',
      webhookSecret: 'ws',
      verifiedAt: t,
      verifiedBy: u.id,
      manifestVersion: '1.0.0',
      updatedAt: t,
    })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins'))
    const data = (await res.json()) as { plugins: Array<{ id: string; verified: boolean }> }
    expect(data.plugins[0].id).toBe('b-vetted')
    expect(data.plugins[0].verified).toBe(true)
  })
})

describe('GET /api/plugins/:slug verified visibility', () => {
  beforeEach(clearDb)

  it('exposes verified + verifiedAt but not verifiedBy', async () => {
    const u = await makeUser()
    const t = Date.now()
    await makePlugin(u.id, { id: 'vetted', verifiedAt: t, verifiedBy: u.id })

    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/plugins/vetted'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.verified).toBe(true)
    expect(data.verifiedAt).toBe(t)
    expect(data).not.toHaveProperty('verifiedBy')
  })
})
