import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { host } from '../../host-handles'
import { db, schema } from '../../db'
import { rotateTokenNonce } from '../../unsubscribe-token'

const emailProfileSchema = t.Object({
  email: t.Union([t.String(), t.Null()]),
  locale: t.String(),
})

const patchSchema = t.Object({
  email: t.Optional(t.Union([t.String({ format: 'email', maxLength: 320 }), t.Null()])),
  locale: t.Optional(t.String({ minLength: 2, maxLength: 10 })),
})

type AuthCtxBase = {
  user: { sub: string; username?: string; jti?: string; bootstrap?: boolean }
}

export default function buildEmailProfileRoute() {
  const base = new Elysia() as Elysia<
    '',
    { decorator: AuthCtxBase; store: {}; derive: AuthCtxBase; resolve: {} }
  >
  return base
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .use(host().middleware.auth as any)
    .get(
      '/',
      async ({ user, set }) => {
        const row = await db().query.users.findFirst({ where: { id: user.sub } })
        if (!row) {
          set.status = 401
          return { error: 'User not found' } as never
        }
        return { email: row.email ?? null, locale: row.locale ?? 'en' }
      },
      {
        detail: {
          tags: ['Account'],
          summary: 'Get your email & locale',
          operationId: 'getEmailProfile',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        response: { 200: emailProfileSchema, 401: t.Object({ error: t.String() }) },
      },
    )
    .patch(
      '/',
      async ({ user, body, set, request }) => {
        const existing = await db().query.users.findFirst({ where: { id: user.sub } })
        if (!existing) {
          set.status = 401
          return { error: 'User not found' } as never
        }

        const patch: { email?: string | null; locale?: string } = {}
        let emailChanged = false
        const prevEmail = existing.email ?? null

        if (body.email !== undefined) {
          const next = body.email && body.email.length > 0 ? body.email.toLowerCase() : null
          if (next !== prevEmail) {
            if (next) {
              const dupe = await db().query.users.findFirst({ where: { email: next } })
              if (dupe && dupe.id !== user.sub) {
                set.status = 409
                return { error: 'Email already in use' }
              }
            }
            patch.email = next
            emailChanged = true
          }
        }

        if (body.locale !== undefined && body.locale !== existing.locale) {
          patch.locale = body.locale
        }

        if (Object.keys(patch).length === 0) {
          return { email: prevEmail, locale: existing.locale ?? 'en' }
        }

        await db().update(schema.users).set(patch).where(eq(schema.users.id, user.sub))

        if (emailChanged) {
          await rotateTokenNonce(user.sub)
          await host().audit.record({
            actorId: user.sub,
            actorName: user.username ?? null,
            action: 'user.email_change',
            target: `user:${user.sub}`,
            meta: { from: prevEmail, to: patch.email ?? null },
            ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
          })
        }

        const fresh = await db().query.users.findFirst({ where: { id: user.sub } })
        return { email: fresh?.email ?? null, locale: fresh?.locale ?? 'en' }
      },
      {
        detail: {
          tags: ['Account'],
          summary: 'Update your email and/or locale',
          operationId: 'patchEmailProfile',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        body: patchSchema,
        response: {
          200: emailProfileSchema,
          401: t.Object({ error: t.String() }),
          409: t.Object({ error: t.String() }),
        },
      },
    )
}
