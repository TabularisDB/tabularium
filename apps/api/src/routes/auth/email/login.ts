import { Elysia, t } from 'elysia'
import { db } from '$db'
import { verifyPassword } from '$lib/password'
import { signJwt } from '$lib/jwt'
import { isProd } from '$lib/env'
import { logger } from '$lib/logger'
import { rateLimit } from '$middleware/rate-limit'

const log = logger.child({ module: 'auth-email-login' })

export default new Elysia()
  .use(rateLimit({ bucket: 'auth-email-login', limit: 5, windowSeconds: 900 }))
  .post('/', async ({ body, set, cookie }) => {
    const email = body.email.toLowerCase()
    const creds = await db.query.rootCredentials.findFirst({ where: { email } })
    const hash = creds?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$invalid$invalid'
    const ok = await verifyPassword(body.password, hash)
    if (!creds || !ok) {
      log.warn({ email }, 'failed login attempt')
      set.status = 401
      return { error: 'Invalid credentials or recovery is no longer available' }
    }

    const userRow = await db.query.users.findFirst({ where: { id: creds.userId } })
    if (!userRow || userRow.role !== 'admin') {
      set.status = 401
      return { error: 'Invalid credentials or recovery is no longer available' }
    }

    const jwt = await signJwt({
      sub: userRow.id,
      identityId: null,
      username: userRow.displayName,
      providerInstanceId: null,
    })

    cookie.auth.set({
      value: jwt,
      httpOnly: true,
      secure: isProd(),
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
      path: '/',
    })

    return { ok: true, userId: userRow.id }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Bootstrap admin email + password sign-in',
      description: 'Recovery path for the initial admin. Closes permanently once the admin links any OAuth identity.',
      operationId: 'emailLogin',
    },
    body: t.Object({
      email: t.String({ minLength: 3, maxLength: 254, format: 'email' }),
      password: t.String({ minLength: 1, maxLength: 256 }),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), userId: t.String() }),
      401: t.Object({ error: t.String() }),
    },
  })
