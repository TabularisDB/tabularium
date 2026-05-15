import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { rootCredentials } from '../../src/db/schema'
import { getSetting } from '../../src/lib/settings'
import { hashPassword, verifyPassword } from '../../src/lib/password'

async function adminToken() {
  const u = await makeUser({ role: 'admin', username: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('admin email-recovery', () => {
  beforeEach(clearDb)

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/auth/email-recovery'))
    expect(res.status).toBe(401)
  })

  it('GET returns persist=false, hasCredentials=false on a clean instance', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { persist: boolean; hasCredentials: boolean; email: string | null }
    expect(body).toEqual({ persist: false, hasCredentials: false, email: null })
  })

  it('PUT persist=true sets the setting', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ persist: true }),
      }),
    )
    expect(res.status).toBe(200)
    expect(getSetting('auth.email_recovery_persist')).toBe('1')
    const body = await res.json() as { persist: boolean }
    expect(body.persist).toBe(true)
  })

  it('PUT email+password creates rootCredentials for the admin', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'Recovery@Example.com', password: 'supersecret' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { hasCredentials: boolean; email: string | null }
    expect(body.hasCredentials).toBe(true)
    expect(body.email).toBe('recovery@example.com')
    const row = await db.query.rootCredentials.findFirst()
    expect(row?.email).toBe('recovery@example.com')
    expect(await verifyPassword('supersecret', row!.passwordHash)).toBe(true)
  })

  it('PUT updates an existing rootCredentials row (rotation)', async () => {
    const token = await adminToken()
    const app = await buildApp()
    await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'old@example.com', password: 'oldpassword' }),
      }),
    )
    await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com', password: 'newpassword' }),
      }),
    )
    const row = await db.query.rootCredentials.findFirst()
    expect(row?.email).toBe('new@example.com')
    expect(await verifyPassword('newpassword', row!.passwordHash)).toBe(true)
    expect(await verifyPassword('oldpassword', row!.passwordHash)).toBe(false)
    const all = await db.select().from(rootCredentials)
    expect(all.length).toBe(1)
  })

  it('PUT rejects setting credentials with only one of email/password', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'only-email@example.com' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('PUT rejects passwords shorter than 8 characters', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.c', password: 'short' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('DELETE removes the rootCredentials row', async () => {
    const u = await makeUser({ role: 'admin', username: 'admin' })
    const token = await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
    await db.insert(rootCredentials).values({
      userId: u.id,
      email: 'gone@example.com',
      passwordHash: await hashPassword('password123'),
    })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/auth/email-recovery', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { hasCredentials: boolean }
    expect(body.hasCredentials).toBe(false)
    const row = await db.query.rootCredentials.findFirst()
    expect(row).toBeUndefined()
  })
})
