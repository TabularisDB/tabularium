import { describe, it, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { getSetting } from '../../src/lib/settings'

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

describe('asset_size_cap_bytes setting', () => {
  beforeEach(clearDb)

  it('GET /api/admin/instance returns 500 MB default when unset', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/instance/', { headers: await adminCookie() }))
    const body = (await res.json()) as { assetSizeCapBytes: number }
    expect(body.assetSizeCapBytes).toBe(500 * 1024 * 1024)
  })

  it('PUT persists override', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/', {
        method: 'PUT',
        headers: { ...(await adminCookie()), 'content-type': 'application/json' },
        body: JSON.stringify({ assetSizeCapBytes: 10_000_000 }),
      }),
    )
    expect(res.status).toBe(200)
    expect(getSetting('registry.asset_size_cap_bytes')).toBe('10000000')
  })

  it('rejects non-positive cap', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/', {
        method: 'PUT',
        headers: { ...(await adminCookie()), 'content-type': 'application/json' },
        body: JSON.stringify({ assetSizeCapBytes: 0 }),
      }),
    )
    expect(res.status).toBe(400)
  })
})
