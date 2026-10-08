import { beforeEach, expect, test } from 'bun:test'
import { clearDb, makeUser, makeAdmin, buildApp } from '../helpers'
import {
  registerClient,
  authorize,
  exchangeCode,
  refreshAccess,
  verifyAccess,
  revokeGrant,
  challenge,
  resourceUrl,
} from '../../src/lib/oauth/server'
const redirect = 'http://127.0.0.1:45000/callback'
const verifier = 'x'.repeat(64)
beforeEach(clearDb)
async function grant(scopes = 'catalog:read', admin = false) {
  const user = await (admin ? makeAdmin() : makeUser())
  const client = await registerClient({ client_name: 'Test client', redirect_uris: [redirect] })
  const params = {
    client_id: client.client_id,
    redirect_uri: redirect,
    resource: resourceUrl(),
    scope: scopes,
    response_type: 'code',
    code_challenge: challenge(verifier),
    code_challenge_method: 'S256',
  }
  const code = await authorize(params, {
    sub: user.id,
    identityId: user.identityId,
    providerInstanceId: 'github',
    username: user.username,
  })
  const input = {
    client_id: client.client_id,
    code,
    redirect_uri: redirect,
    resource: resourceUrl(),
    code_verifier: verifier,
  }
  return { user, client, input }
}
test('PKCE code is resource/client/redirect bound and usable exactly once', async () => {
  const { input } = await grant()
  await expect(exchangeCode({ ...input, code_verifier: 'z'.repeat(64) })).rejects.toThrow()
  await expect(exchangeCode({ ...input, resource: 'https://evil.test/mcp' })).rejects.toThrow()
  await expect(exchangeCode({ ...input, redirect_uri: 'https://evil.test/cb' })).rejects.toThrow()
  const token = await exchangeCode(input)
  expect((await verifyAccess(token.access_token))?.scopes).toEqual(['catalog:read'])
  await expect(exchangeCode(input)).rejects.toThrow()
  expect(await verifyAccess(token.access_token)).toBeNull()
})
test('concurrent code exchanges cannot both succeed', async () => {
  const { input } = await grant()
  const result = await Promise.allSettled([exchangeCode(input), exchangeCode(input)])
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
})
test('refresh rotates and replay revokes the whole connection', async () => {
  const { input } = await grant()
  const token = await exchangeCode(input)
  const params = { client_id: input.client_id, resource: resourceUrl(), refresh_token: token.refresh_token }
  const next = await refreshAccess(params)
  expect(next.refresh_token).not.toBe(token.refresh_token)
  expect(await verifyAccess(next.access_token)).not.toBeNull()
  await expect(refreshAccess(params)).rejects.toThrow()
  expect(await verifyAccess(next.access_token)).toBeNull()
})
test('revocation is owned by user and invalidates access immediately', async () => {
  const { input, user } = await grant()
  const token = await exchangeCode(input)
  const access = (await verifyAccess(token.access_token))!
  await expect(revokeGrant('someone-else', access.grantId)).rejects.toThrow()
  await revokeGrant(user.id, access.grantId)
  expect(await verifyAccess(token.access_token)).toBeNull()
})
test('ordinary users cannot grant admin scopes; unknown scopes rejected', async () => {
  await expect(grant('admin:users:write')).rejects.toThrow()
  await expect(grant('superpowers')).rejects.toThrow()
})
test('registration rejects unsafe redirects and confidential client settings', async () => {
  for (const uri of [
    'https://example.com/cb#x',
    'javascript:alert(1)',
    'http://example.com/cb',
    'https://user:pass@example.com/cb',
  ]) {
    await expect(registerClient({ client_name: 'bad', redirect_uris: [uri] })).rejects.toThrow()
  }
  await expect(
    registerClient({
      client_name: 'bad',
      redirect_uris: [redirect],
      token_endpoint_auth_method: 'client_secret_basic',
    }),
  ).rejects.toThrow()
})
test('metadata and unauthenticated MCP advertise OAuth; session JWT is not MCP access', async () => {
  const app = await buildApp()
  const meta = await app.handle(new Request('http://localhost/.well-known/oauth-authorization-server'))
  expect(meta.status).toBe(200)
  expect((await meta.json()).code_challenge_methods_supported).toEqual(['S256'])
  const u = await makeUser()
  const res = await app.handle(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${u.jwt}`, 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect(res.status).toBe(401)
  expect(res.headers.get('www-authenticate')).toContain('oauth-protected-resource')
})

test('HTTP consent requires same-user CSRF, displays escaped client and returns bound code', async () => {
  const user = await makeUser()
  const app = await buildApp()
  const client = await registerClient({ client_name: '<script>bad()</script>', redirect_uris: [redirect] })
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    resource: resourceUrl(),
    scope: 'catalog:read',
    response_type: 'code',
    code_challenge: challenge(verifier),
    code_challenge_method: 'S256',
    state: 'roundtrip',
  })
  const res = await app.handle(
    new Request(`http://localhost/oauth/authorize?${params}`, { headers: { cookie: `auth=${user.jwt}` } }),
  )
  expect(res.status).toBe(200)
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  expect(res.headers.get('referrer-policy')).toBe('same-origin')
  expect(res.headers.get('content-security-policy')).toContain(new URL(redirect).origin)
  const html = await res.text()
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>bad()')
  const request = html.match(/name="request" value="([^"]+)"/)![1]
  const csrf = html.match(/name="csrf" value="([^"]+)"/)![1]
  const cookies = `auth=${user.jwt}; tabularium_oauth=${csrf}`
  const post = (body: URLSearchParams, cookie = cookies, origin = 'http://localhost:3000') =>
    app.handle(
      new Request('http://localhost/oauth/authorize', {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
        body,
      }),
    )
  expect((await post(new URLSearchParams({ request, csrf: 'bad', decision: 'allow' }))).status).toBe(403)
  expect(
    (await post(new URLSearchParams({ request, csrf, decision: 'allow' }), cookies, 'https://evil.test')).status,
  ).toBe(403)
  const other = await makeUser()
  expect(
    (
      await post(
        new URLSearchParams({ request, csrf, decision: 'allow' }),
        `auth=${other.jwt}; tabularium_oauth=${csrf}`,
      )
    ).status,
  ).toBe(403)
  const allow = await post(new URLSearchParams({ request, csrf, decision: 'allow' }))
  expect(allow.status).toBe(303)
  const target = new URL(allow.headers.get('location')!)
  expect(target.searchParams.get('state')).toBe('roundtrip')
  const exchange = await app.handle(
    new Request('http://localhost/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        redirect_uri: redirect,
        resource: resourceUrl(),
        code: target.searchParams.get('code')!,
        code_verifier: verifier,
      }),
    }),
  )
  expect(exchange.status).toBe(200)
  expect((await exchange.json()).access_token).toStartWith('tba_')
  expect((await post(new URLSearchParams({ request, csrf, decision: 'allow' }))).status).toBe(400)
})
test('unauthenticated authorization offers login and never auto-approves', async () => {
  const app = await buildApp()
  const client = await registerClient({ client_name: 'test', redirect_uris: [redirect] })
  const p = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    resource: resourceUrl(),
    response_type: 'code',
    code_challenge: challenge(verifier),
    code_challenge_method: 'S256',
  })
  const res = await app.handle(new Request(`http://localhost/oauth/authorize?${p}`))
  expect(res.status).toBe(200)
  const html = await res.text()
  expect(html).toContain('Sign in to connect')
  expect(html).toContain('return_to=%2Foauth%2Fauthorize%3Frequest%3D')
  expect(res.headers.get('location')).toBeNull()
})
test('concurrent refresh use cannot leave a live connection', async () => {
  const { input } = await grant()
  const token = await exchangeCode(input)
  const p = { client_id: input.client_id, resource: resourceUrl(), refresh_token: token.refresh_token }
  const results = await Promise.allSettled([refreshAccess(p), refreshAccess(p)])
  expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1)
  expect(await verifyAccess(token.access_token)).toBeNull()
  for (const r of results) if (r.status === 'fulfilled') expect(await verifyAccess(r.value.access_token)).toBeNull()
})

test('expired access/grants are refused and credential plaintext is not stored', async () => {
  const { db } = await import('../../src/db')
  const { oauthRecords } = await import('../../src/db/schema')
  const { eq } = await import('drizzle-orm')
  const { hash } = await import('../../src/lib/oauth/server')
  const { input } = await grant()
  const token = await exchangeCode(input)
  const access = (await verifyAccess(token.access_token))!
  const rows = await db.select().from(oauthRecords)
  const stored = JSON.stringify(rows)
  expect(stored).not.toContain(token.access_token)
  expect(stored).not.toContain(token.refresh_token)
  expect(stored).not.toContain(input.code)
  await db
    .update(oauthRecords)
    .set({ expiresAt: Date.now() - 1 })
    .where(eq(oauthRecords.id, hash(token.access_token)))
  expect(await verifyAccess(token.access_token)).toBeNull()
  await db
    .update(oauthRecords)
    .set({ expiresAt: Date.now() - 1 })
    .where(eq(oauthRecords.id, access.grantId))
  await expect(
    refreshAccess({ client_id: input.client_id, resource: resourceUrl(), refresh_token: token.refresh_token }),
  ).rejects.toThrow()
})
