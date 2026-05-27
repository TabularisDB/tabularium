import { Elysia, t } from 'elysia'
import { isProd } from '$lib/env'
import { verifyJwt } from '$lib/jwt'
import { revokeSession } from '$lib/sessions'

export default new Elysia().post(
  '/',
  async ({ cookie, headers }) => {
    const authHeader = headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    const cookieValue = cookie.auth?.value
    const cookieToken = typeof cookieValue === 'string' ? cookieValue : undefined
    const token = bearerToken ?? cookieToken
    if (token) {
      const claims = await verifyJwt(token)
      if (claims?.jti) await revokeSession(claims.jti)
    }
    cookie.auth.set({
      value: '',
      httpOnly: true,
      secure: isProd(),
      maxAge: 0,
      sameSite: 'lax',
      path: '/',
    })
    return { ok: true }
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'Revoke session + clear cookie',
      description:
        'Idempotent — flips the server-side session record to revoked and clears the auth cookie. Returns `{ ok: true }` regardless of prior auth state.',
      operationId: 'logout',
    },
    response: {
      200: t.Object({ ok: t.Boolean() }),
    },
  },
)
