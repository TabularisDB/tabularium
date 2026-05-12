import { describe, it, expect, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { authMiddleware } from '../../src/middleware/auth'
import { clearDb, makeUser } from '../helpers'

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
      username: 'alice',
      provider: 'github',
      providerInstanceUrl: null,
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

describe('GET /auth/:provider', () => {
  it('redirects to GitHub auth URL and sets state cookie', async () => {
    const { default: authStart } = await import('../../src/routes/auth/[provider]/index')
    const app = new Elysia().use(authStart)

    const res = await app.handle(new Request('http://localhost/auth/github'))
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('github.com')
    expect(location).toContain('state=')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('oauth_state=')
  })

  it('redirects to Gitea auth URL for gitea provider with instance param', async () => {
    const { default: authStart } = await import('../../src/routes/auth/[provider]/index')
    const app = new Elysia().use(authStart)

    const res = await app.handle(
      new Request('http://localhost/auth/gitea?instance=https://codeberg.org'),
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('codeberg.org')
  })

  it('returns 400 for unknown provider', async () => {
    const { default: authStart } = await import('../../src/routes/auth/[provider]/index')
    const app = new Elysia().use(authStart)

    const res = await app.handle(new Request('http://localhost/auth/twitter'))
    expect(res.status).toBe(400)
  })
})

describe('GET /auth/me', () => {
  beforeEach(clearDb)

  it('returns current user for valid JWT', async () => {
    const { default: meRoute } = await import('../../src/routes/auth/me')
    const user = await makeUser()
    const { signJwt } = await import('../../src/lib/jwt')
    const token = await signJwt({
      sub: user.id,
      username: user.username,
      provider: user.provider,
      providerInstanceUrl: user.providerInstanceUrl,
    })

    const app = new Elysia().use(meRoute)
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
