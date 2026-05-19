import { describe, it, expect, beforeEach } from 'bun:test'
import { buildApp, clearDb, makeUser } from '../helpers'
import { initSettings } from '../../src/lib/settings'
import { setAppUrlSchemes } from '../../src/lib/app-schemes'
import { signJwt } from '../../src/lib/jwt'

describe('GET /api/instance/info', () => {
  beforeEach(async () => {
    await clearDb()
    await initSettings()
  })

  it('returns an empty schemes array on a fresh install', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/instance/info'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { appUrlSchemes: unknown[] }
    expect(body.appUrlSchemes).toEqual([])
  })

  it('reflects configured schemes', async () => {
    await setAppUrlSchemes([{ name: 'Tabularis Desktop', scheme: 'tabularis' }])
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/instance/info'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { appUrlSchemes: Array<{ scheme: string }> }
    expect(body.appUrlSchemes.map((s) => s.scheme)).toEqual(['tabularis'])
  })

  it('is public — no auth required', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/instance/info'))
    expect(res.status).toBe(200)
  })
})

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

describe('admin /api/admin/instance/app-schemes', () => {
  beforeEach(async () => {
    await clearDb()
    await initSettings()
  })

  it('GET returns the current list', async () => {
    await setAppUrlSchemes([{ name: 'A', scheme: 'a' }])
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/app-schemes', {
        headers: await adminCookie(),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { schemes: Array<{ scheme: string }> }
    expect(body.schemes.map((s) => s.scheme)).toEqual(['a'])
  })

  it('PUT replaces the list and writes an audit row', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/app-schemes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await adminCookie()) },
        body: JSON.stringify({
          schemes: [
            { name: 'Tabularis', scheme: 'tabularis' },
            { name: 'Theme Studio', scheme: 'theme-studio', kinds: ['theme'] },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; schemes: Array<{ scheme: string }> }
    expect(body.ok).toBe(true)
    expect(body.schemes.map((s) => s.scheme)).toEqual(['tabularis', 'theme-studio'])
  })

  it('PUT rejects invalid schemes via the typebox pattern', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/instance/app-schemes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await adminCookie()) },
        body: JSON.stringify({ schemes: [{ name: 'Bad', scheme: '1invalid' }] }),
      }),
    )
    expect(res.status).toBe(422)
  })

  it('GET is admin-only — 401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/instance/app-schemes'))
    expect(res.status).toBe(401)
  })
})
