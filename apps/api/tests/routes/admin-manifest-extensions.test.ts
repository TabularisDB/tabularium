import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { getExtensionsDelta } from '../../src/lib/manifest-schema'

async function adminToken() {
  const u = await makeUser({ role: 'admin', username: 'admin' })
  return signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
}

describe('admin manifest extensions', () => {
  beforeEach(clearDb)

  it('401 without auth on GET', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/admin/manifest/extensions'))
    expect(res.status).toBe(401)
  })

  it('403 for non-admin', async () => {
    const u = await makeUser()
    const token = await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' })
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/manifest/extensions', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(403)
  })

  it('GET returns current delta and merged schema', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/manifest/extensions', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { extensions: Record<string, unknown>; mergedSchema: Record<string, unknown> }
    expect(body.extensions).toEqual({})
    expect(body.mergedSchema.type).toBe('object')
  })

  it('PUT persists a valid delta', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/manifest/extensions', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extensions: {
            'x-tabularis': { type: 'object', properties: { mode: { type: 'string' } } },
          },
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(getExtensionsDelta()['x-tabularis']).toBeTruthy()
  })

  it('PUT with null clears the delta', async () => {
    const token = await adminToken()
    const app = await buildApp()
    await app.handle(
      new Request('http://localhost/api/admin/manifest/extensions', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extensions: { 'x-app': { type: 'string' } },
        }),
      }),
    )
    expect(Object.keys(getExtensionsDelta()).length).toBe(1)
    const res = await app.handle(
      new Request('http://localhost/api/admin/manifest/extensions', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensions: null }),
      }),
    )
    expect(res.status).toBe(200)
    expect(getExtensionsDelta()).toEqual({})
  })

  it('PUT silently skips core-shadowing entries (paste-friendly)', async () => {
    const token = await adminToken()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/admin/manifest/extensions', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extensions: { name: { type: 'string' }, 'x-keep': { type: 'string' } },
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(getExtensionsDelta().name).toBeUndefined()
    expect(getExtensionsDelta()['x-keep']).toBeTruthy()
  })
})
