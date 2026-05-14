import { Elysia, t } from 'elysia'
import { isProd } from '$lib/env'

export default new Elysia()
  .post('/', ({ cookie }) => {
    cookie.auth.set({
      value: '',
      httpOnly: true,
      secure: isProd(),
      maxAge: 0,
      sameSite: 'lax',
      path: '/',
    })
    return { ok: true }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Clear the session cookie',
      description: 'Idempotent — returns `{ ok: true }` regardless of prior auth state.',
      operationId: 'logout',
    },
    response: {
      200: t.Object({ ok: t.Boolean() }),
    },
  })
