import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { count, eq } from 'drizzle-orm'
import { db } from '$db'
import { users, rootCredentials } from '$db/schema'
import { hashPassword } from '$lib/password'
import { signJwt } from '$lib/jwt'
import { isProd } from '$lib/env'
import { logger } from '$lib/logger'
import { rateLimit } from '$middleware/rate-limit'

const log = logger.child({ module: 'auth-email-register' })

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default new Elysia()
  .use(rateLimit({ bucket: 'auth-email-register', limit: 3, windowSeconds: 3600 }))
  .post('/', async ({ body, set, cookie }) => {
    const { email, password, displayName } = body
    const normalizedEmail = email.toLowerCase()
    if (!EMAIL_RE.test(normalizedEmail)) {
      set.status = 400
      return { error: 'Invalid email' }
    }
    if (password.length < 8) {
      set.status = 400
      return { error: 'Password must be at least 8 characters' }
    }

    const [{ adminCount }] = await db
      .select({ adminCount: count() })
      .from(users)
      .where(eq(users.role, 'admin'))
    if (adminCount > 0) {
      set.status = 403
      return { error: 'Self-registration is disabled — instance is already initialized' }
    }

    const existing = await db.query.rootCredentials.findFirst({ where: { email: normalizedEmail } })
    if (existing) {
      set.status = 409
      return { error: 'Email already in use' }
    }

    const passwordHash = await hashPassword(password)
    const id = ulid()
    const finalDisplayName = displayName.trim() || normalizedEmail.split('@')[0]

    await db.insert(users).values({ id, displayName: finalDisplayName, role: 'admin' })
    await db.insert(rootCredentials).values({ userId: id, email: normalizedEmail, passwordHash })
    log.info({ userId: id, email: normalizedEmail }, 'bootstrap admin registered')

    const jwt = await signJwt({
      sub: id,
      identityId: null,
      username: finalDisplayName,
      providerInstanceId: null,
    })

    cookie.auth.set({
      value: jwt,
      httpOnly: true,
      secure: isProd(),
      maxAge: 3600,
      sameSite: 'lax',
      path: '/',
    })

    return {
      ok: true,
      user: {
        id,
        username: finalDisplayName,
        displayName: finalDisplayName,
        role: 'admin' as const,
        identities: [] as const,
      },
    }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Register the bootstrap admin account',
      description:
        'Allowed only while no admin exists. The first registered account becomes admin. ' +
        'Credentials are stored in `root_credentials` and deleted automatically the first time the admin links an OAuth identity.',
      operationId: 'registerBootstrapAdmin',
    },
    body: t.Object({
      email: t.String(),
      password: t.String({ minLength: 8 }),
      displayName: t.String({ minLength: 1, maxLength: 60 }),
    }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        user: t.Object({
          id: t.String(),
          username: t.String(),
          displayName: t.String(),
          role: t.Union([t.Literal('user'), t.Literal('admin')]),
          identities: t.Array(t.Any()),
        }),
      }),
      400: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
