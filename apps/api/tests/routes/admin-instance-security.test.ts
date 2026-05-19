import { describe, it, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { auditLog } from '../../src/db/schema'
import { ensureSigningKey } from '../../src/lib/registry-key'

async function adminCookie() {
  const admin = await makeUser({ role: 'admin', username: 'admin' })
  const jwt = await signJwt({
    sub: admin.id,
    identityId: admin.identityId,
    username: admin.username,
    providerInstanceId: admin.providerInstanceId,
  })
  return { Cookie: `auth=${jwt}` }
}

describe('admin /api/admin/instance/security', () => {
  beforeEach(clearDb)

  it('GET returns current public JWK and null previous after a fresh ensureSigningKey()', async () => {
    await ensureSigningKey()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/security', {
        headers: await adminCookie(),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      current: { kid: string }
      previous: unknown
    }
    expect(typeof body.current.kid).toBe('string')
    expect(body.current.kid.length).toBeGreaterThan(0)
    expect(body.previous).toBeNull()
  })

  it('POST /rotate returns 200 and writes an audit row with action registry.signing_key.rotate', async () => {
    await ensureSigningKey()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/security/rotate', {
        method: 'POST',
        headers: await adminCookie(),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; oldKid: string; newKid: string }
    expect(body.ok).toBe(true)
    expect(body.oldKid).toBeTruthy()
    expect(body.newKid).toBeTruthy()
    expect(body.oldKid).not.toBe(body.newKid)
    const rows = await db.select().from(auditLog)
    expect(rows.find((r) => r.action === 'registry.signing_key.rotate')).toBeTruthy()
  })
})
