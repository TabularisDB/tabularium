import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { Elysia } from 'elysia'
import { authMiddleware } from '../../src/middleware/auth'
import { clearDb, makeUser, buildApp } from '../helpers'
import { db } from '../../src/db'
import { createInstance } from '../../src/lib/provider-instance'
import { env } from '../../src/lib/env'

describe('authMiddleware', () => {
  beforeEach(clearDb)

  it('returns 401 with no token', async () => {
    const app = new Elysia().use(authMiddleware).get('/protected', ({ user }) => ({ user }))

    const res = await app.handle(new Request('http://localhost/protected'))
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const app = new Elysia().use(authMiddleware).get('/protected', ({ user }) => ({ user }))

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

    const app = new Elysia().use(authMiddleware).get('/protected', ({ user }) => ({ username: user.username }))

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
    expect(new URL(location).searchParams.get('scope')?.split(' ')).toEqual(['read:user', 'read:org'])
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('oauth_state=')
  })

  it('only asks GitHub for webhook access when explicitly requested', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/auth/github?scope=webhook'))
    const scopes = new URL(res.headers.get('location')!).searchParams.get('scope')?.split(' ')
    expect(scopes).toEqual(['read:user', 'read:org', 'write:repo_hook'])
  })

  it('requests repository write and workflow access only for GitHub scaffolding', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/auth/github?scope=workflow'))
    const scopes = new URL(res.headers.get('location')!).searchParams.get('scope')?.split(' ')
    expect(scopes).toEqual(['read:user', 'read:org', 'public_repo', 'workflow'])
  })

  it('ignores arbitrary OAuth scopes', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/auth/github?scope=repo,admin:repo_hook'))
    const scopes = new URL(res.headers.get('location')!).searchParams.get('scope')?.split(' ')
    expect(scopes).toEqual(['read:user', 'read:org'])
  })

  it.each([
    { kind: 'gitlab' as const, read: ['read_user', 'read_api'], webhook: ['read_user', 'api'] },
    {
      kind: 'gitea' as const,
      read: ['read:user', 'read:repository', 'read:organization'],
      webhook: ['read:user', 'write:repository', 'read:organization'],
    },
  ])('defaults $kind to read-only and makes webhook write access optional', async ({ kind, read, webhook }) => {
    await createInstance({
      id: kind,
      kind,
      displayName: kind,
      baseUrl: `https://${kind}.example.com`,
      clientId: 'test-client',
      clientSecret: 'test-secret',
    })
    const app = await buildApp()
    for (const [query, expected] of [
      ['', read],
      ['?scope=webhook', webhook],
    ] as const) {
      const res = await app.handle(new Request(`http://localhost/auth/${kind}${query}`))
      expect(res.status).toBe(302)
      expect(new URL(res.headers.get('location')!).searchParams.get('scope')?.split(' ')).toEqual([...expected])
    }
  })

  it('returns 404 for unknown instance', async () => {
    const app = await buildApp()

    const res = await app.handle(new Request('http://localhost/auth/twitter'))
    expect(res.status).toBe(404)
  })
})

describe('GET /auth/:instance/callback when optional access is declined', () => {
  beforeEach(clearDb)

  it('returns to submit without replacing the existing token', async () => {
    const user = await makeUser()
    const original = await db.query.identities.findFirst({ where: { id: user.identityId } })
    const app = await buildApp()
    const returnTo = `/submit?repo=https%3A%2F%2Fgithub.com%2Facme%2Fplugin&identityId=${user.identityId}`
    const start = await app.handle(
      new Request(`http://localhost/auth/github?link=1&scope=webhook&return_to=${encodeURIComponent(returnTo)}`, {
        headers: { Cookie: `auth=${user.jwt}` },
      }),
    )
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const cookie = start.headers.get('set-cookie')!.split(';')[0]
    const upstream = spyOn(global, 'fetch').mockImplementation((() => {
      throw new Error('Declining must not exchange tokens')
    }) as unknown as typeof fetch)
    try {
      const res = await app.handle(
        new Request(`http://localhost/auth/github/callback?error=access_denied&state=${state}`, {
          headers: { Cookie: `${cookie}; auth=${user.jwt}` },
        }),
      )
      expect(res.status).toBe(302)
      const destination = new URL(res.headers.get('location')!)
      expect(destination.origin).toBe(env.WEB_BASE_URL ?? env.BASE_URL)
      expect(destination.pathname).toBe('/submit')
      expect(destination.searchParams.get('repo')).toBe('https://github.com/acme/plugin')
      expect(destination.searchParams.get('identityId')).toBe(user.identityId)
      expect(res.headers.get('set-cookie')).toContain('oauth_state=')
      expect(upstream).not.toHaveBeenCalled()
      expect(await db.query.identities.findFirst({ where: { id: user.identityId } })).toEqual(original)
    } finally {
      upstream.mockRestore()
    }
  })

  it('still rejects a mismatched state on denial', async () => {
    const user = await makeUser()
    const app = await buildApp()
    const start = await app.handle(
      new Request('http://localhost/auth/github?link=1&scope=webhook', {
        headers: { Cookie: `auth=${user.jwt}` },
      }),
    )
    const cookie = start.headers.get('set-cookie')!.split(';')[0]
    const res = await app.handle(
      new Request('http://localhost/auth/github/callback?error=access_denied&state=wrong', {
        headers: { Cookie: `${cookie}; auth=${user.jwt}` },
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'State mismatch' })
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
      providerInstanceId: user.providerInstanceId,
    })

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { username: string }
    expect(data.username).toBe(user.username)
  })
})

describe('POST /auth/logout', () => {
  beforeEach(clearDb)

  it('returns ok and clears the auth cookie', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/auth/logout', { method: 'POST' }))
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
