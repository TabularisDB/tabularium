import { describe, it, expect, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'
import { authMiddleware } from '../../src/middleware/auth'
import { clearDb } from '../helpers'

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
