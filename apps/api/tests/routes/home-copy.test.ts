import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { auditLog } from '../../src/db/schema'
import { eq } from 'drizzle-orm'
import { defaultHomeCopy } from '../../src/lib/home-copy'

async function adminToken() {
  const u = await makeUser({ role: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('GET /api/home-copy (public)', () => {
  beforeEach(clearDb)

  it('returns defaults on fresh install', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/home-copy'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(defaultHomeCopy())
  })

  it('reflects admin writes', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const body = defaultHomeCopy()
    body.eyebrow.enabled = false
    body.eyebrow.text.en = 'Custom'
    const put = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    )
    expect(put.status).toBe(200)
    const get = await app.handle(new Request('http://localhost/api/home-copy'))
    const data = (await get.json()) as { eyebrow: { enabled: boolean; text: Record<string, string> } }
    expect(data.eyebrow.enabled).toBe(false)
    expect(data.eyebrow.text.en).toBe('Custom')
  })
})

describe('GET /api/admin/home-copy', () => {
  beforeEach(clearDb)

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/home-copy'))
    expect(res.status).toBe(401)
  })

  it('403 for non-admin', async () => {
    const u = await makeUser()
    const token = await signJwt({
      sub: u.id,
      identityId: u.identityId,
      username: u.username,
      providerInstanceId: 'github',
    })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('200 returns defaults for admin', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(defaultHomeCopy())
  })
})

describe('PUT /api/admin/home-copy', () => {
  beforeEach(clearDb)

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultHomeCopy()),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('403 for non-admin', async () => {
    const u = await makeUser()
    const token = await signJwt({
      sub: u.id,
      identityId: u.identityId,
      username: u.username,
      providerInstanceId: 'github',
    })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(defaultHomeCopy()),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('persists writes + records audit', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const body = defaultHomeCopy()
    body.features.enabled = false
    body.features.dropin.title.en = 'Drop-in'
    const res = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { features: { enabled: boolean; dropin: { title: Record<string, string> } } }
    expect(data.features.enabled).toBe(false)
    expect(data.features.dropin.title.en).toBe('Drop-in')
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'home_copy.update'))
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('400 for oversized text', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const body = defaultHomeCopy()
    body.eyebrow.text.en = 'x'.repeat(500)
    const res = await app.handle(
      new Request('http://localhost/api/admin/home-copy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    )
    expect(res.status).toBe(400)
  })
})
