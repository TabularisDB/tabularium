import { describe, it, expect, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { authMiddleware } from '../../src/middleware/auth'
import { clearDb, makeUser, buildApp } from '../helpers'

describe('authMiddleware', () => {
  beforeEach(clearDb)

  it('returns 401 with no token', async () => {
    const app = new Elysia()
      .use(authMiddleware)
      .get('/protected', ({ user }) => ({ user }))

    const res = await app.handle(new Request('http://localhost/protected'))
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const app = new Elysia()
      .use(authMiddleware)
      .get('/protected', ({ user }) => ({ user }))

    const res = await app.handle(
      new Request('http://localhost/protected', {
        headers: { Authorization: 'Bearer garbage.token.here' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('injects user for valid token', async () => {
    const { signJwt } = await import('../../src/lib/jwt')
    const token = await signJwt({
      sub: 'user-1',
      identityId: 'identity-1',
      username: 'alice',
      providerInstanceId: 'github',
    })

    const app = new Elysia()
      .use(authMiddleware)
      .get('/protected', ({ user }) => ({ username: user.username }))

    const res = await app.handle(
      new Request('http://localhost/protected', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ username: 'alice' })
  })
})

describe('GET /auth/:instance', () => {
  beforeEach(clearDb)

  it('redirects to instance auth URL and sets state cookie', async () => {
    const app = await buildApp()

    const res = await app.handle(new Request('http://localhost/auth/github'))
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('github.com')
    expect(location).toContain('state=')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('oauth_state=')
  })

  it('returns 404 for unknown instance', async () => {
    const app = await buildApp()

    const res = await app.handle(new Request('http://localhost/auth/twitter'))
    expect(res.status).toBe(404)
  })
})

describe('GET /auth/me', () => {
  beforeEach(clearDb)

  it('returns current user for valid JWT', async () => {
    const user = await makeUser()
    const { signJwt } = await import('../../src/lib/jwt')
    const token = await signJwt({
      sub: user.id,
      identityId: user.identityId,
      username: user.username,
      provider: user.provider,
    })

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json() as { username: string }
    expect(data.username).toBe(user.username)
  })
})

describe('POST /auth/logout', () => {
  beforeEach(clearDb)

  it('returns ok and clears the auth cookie', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/auth/logout', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('auth=')
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/)
  })

  it('is idempotent when no cookie is present', async () => {
    const app = await buildApp()
    const a = await app.handle(new Request('http://localhost/auth/logout', { method: 'POST' }))
    const b = await app.handle(new Request('http://localhost/auth/logout', { method: 'POST' }))
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
  })
})
