import { Elysia, t } from 'elysia'
import { count, desc, eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { emailSuppression } from '$db/schema'
import { recordAudit } from '$lib/audit'
import { getUpstreamDriver } from '$lib/email/suppression-driver'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'admin-suppression' })

const sourceEnum = t.Union([
  t.Literal('bounce'),
  t.Literal('complaint'),
  t.Literal('manual'),
  t.Literal('unsubscribe'),
])

const rowSchema = t.Object({
  email: t.String(),
  source: sourceEnum,
  reason: t.Union([t.String(), t.Null()]),
  addedAt: t.Number(),
})

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async ({ query }) => {
      const page = Math.max(1, Number(query.page ?? '1'))
      const limit = Math.min(200, Math.max(1, Number(query.limit ?? '50')))
      const offset = (page - 1) * limit
      const filter = query.source ? eq(emailSuppression.source, query.source) : undefined
      const rows = await db
        .select()
        .from(emailSuppression)
        .where(filter)
        .orderBy(desc(emailSuppression.addedAt))
        .limit(limit)
        .offset(offset)
      const [{ total }] = await db
        .select({ total: count() })
        .from(emailSuppression)
        .where(filter)
      return { rows, total, page, limit }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'List suppressed emails',
        operationId: 'listSuppression',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        source: t.Optional(sourceEnum),
      }),
      response: {
        200: t.Object({ rows: t.Array(rowSchema), total: t.Number(), page: t.Number(), limit: t.Number() }),
      },
    },
  )
  .post(
    '/',
    async ({ body, admin, request, set }) => {
      const email = body.email.toLowerCase()
      const driver = getUpstreamDriver()
      let upstreamSynced = false
      let upstreamError: string | null = null
      if (driver) {
        try {
          await driver.add(email, body.reason ?? null)
          upstreamSynced = true
        } catch (err) {
          upstreamError = err instanceof Error ? err.message : 'unknown'
          log.warn({ err, email }, 'upstream suppression add failed — proceeding with local-only')
        }
      }
      try {
        await db
          .insert(emailSuppression)
          .values({ email, source: 'manual', reason: body.reason ?? null })
          .onConflictDoNothing()
      } catch (err) {
        set.status = 500
        return { error: err instanceof Error ? err.message : 'insert failed' }
      }
      await recordAudit({
        actorId: admin.id,
        actorName: admin.displayName,
        action: 'email.suppression_add',
        target: `email:${email}`,
        meta: { reason: body.reason ?? null, upstreamSynced, upstreamError },
        ip: request.headers.get('x-forwarded-for') ?? null,
      })
      return { ok: true, upstreamSynced }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Manually suppress an email',
        operationId: 'addSuppression',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 320 }),
        reason: t.Optional(t.String({ maxLength: 500 })),
      }),
      response: {
        200: t.Object({ ok: t.Boolean(), upstreamSynced: t.Boolean() }),
        500: t.Object({ error: t.String() }),
      },
    },
  )
