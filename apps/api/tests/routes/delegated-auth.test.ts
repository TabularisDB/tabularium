import { beforeEach, expect, test } from 'bun:test'
import { clearDb, makeAdmin, buildApp } from '../helpers'
import { createAdminToken } from '../../src/lib/admin-tokens'
import { createSession, revokeSession } from '../../src/lib/sessions'
import { signJwt } from '../../src/lib/jwt'
beforeEach(clearDb)
test('admin JWT rejects a revoked session', async () => {
  const u = await makeAdmin()
  const jti = await createSession({ userId: u.id, userAgent: null, ip: null })
  const token = await signJwt({
    sub: u.id,
    identityId: u.identityId,
    username: u.username,
    providerInstanceId: 'github',
    jti,
  })
  await revokeSession(jti)
  const res = await (await buildApp()).handle(
    new Request('http://localhost/api/admin/docs', { headers: { authorization: `Bearer ${token}` } }),
  )
  expect(res.status).toBe(401)
})
test('scoped admin tokens enforce area and read/write and cannot mint tokens', async () => {
  const u = await makeAdmin()
  const { token } = await createAdminToken({ userId: u.id, name: 'docs reader', scopes: ['admin:docs:read'] })
  const app = await buildApp()
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  expect((await app.handle(new Request('http://localhost/api/admin/docs', { headers }))).status).toBe(200)
  expect((await app.handle(new Request('http://localhost/api/admin/users', { headers }))).status).toBe(403)
  expect(
    (
      await app.handle(
        new Request('http://localhost/api/admin/docs', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ content: 'bad' }),
        }),
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await app.handle(
        new Request('http://localhost/api/admin/tokens', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'escape' }),
        }),
      )
    ).status,
  ).toBe(403)
})
