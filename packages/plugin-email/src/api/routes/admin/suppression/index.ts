import { Elysia, t } from 'elysia'
import { count, desc, eq } from 'drizzle-orm'
import { host } from '../../../host-handles'
import { db, schema } from '../../../db'
import { getUpstreamDriver } from '../../../suppression-driver'
import { syncOnce } from '../../../suppression-sync'
import { log as makeLog } from '../../../logger'

const log = makeLog('admin-suppression')

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

type AdminCtxBase = {
  admin: { id: string; displayName: string | null }
  user: { sub: string; username?: string; role?: string }
  apiToken: { id: string; scopes: string[] | null } | null
}

type SuppressionSourceFilter = 'bounce' | 'complaint' | 'manual' | 'unsubscribe'

export default function buildSuppressionListRoute() {
  const base = new Elysia() as Elysia<
    '',
    { decorator: AdminCtxBase; store: {}; derive: AdminCtxBase; resolve: {} }
  >
  return (
    base
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(host().middleware.admin as any)
      .get(
        '/',
        async ({ query }) => {
          const page = Math.max(1, Number(query.page ?? '1'))
          const limit = Math.min(200, Math.max(1, Number(query.limit ?? '50')))
          const offset = (page - 1) * limit
          const filter = query.source
            ? eq(schema.emailSuppression.source, query.source as SuppressionSourceFilter)
            : undefined
          const rows = await db()
            .select()
            .from(schema.emailSuppression)
            .where(filter)
            .orderBy(desc(schema.emailSuppression.addedAt))
            .limit(limit)
            .offset(offset)
          const [{ total }] = await db()
            .select({ total: count() })
            .from(schema.emailSuppression)
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
        '/sync',
        async ({ admin, request, set }) => {
          const provider = host().settings.get('email.provider')
          if (provider !== 'turbo') {
            set.status = 412
            return { error: 'Suppression sync requires the TurboSMTP provider' }
          }
          try {
            const out = await syncOnce()
            await host().audit.record({
              actorId: admin.id,
              actorName: admin.displayName,
              action: 'email.suppression_sync',
              target: 'email:suppression',
              meta: { added: out.added, checked: out.checked },
              ip: request.headers.get('x-forwarded-for') ?? null,
            })
            return { ok: true, added: out.added, checked: out.checked }
          } catch (err) {
            log.warn('manual suppression sync failed', { err })
            set.status = 502
            return { error: err instanceof Error ? err.message : 'sync failed' }
          }
        },
        {
          detail: {
            tags: ['Admin'],
            summary: 'Manually trigger upstream suppression sync',
            operationId: 'syncSuppression',
            security: [{ bearerAuth: [] }, { cookieAuth: [] }],
          },
          response: {
            200: t.Object({ ok: t.Boolean(), added: t.Number(), checked: t.Number() }),
            412: t.Object({ error: t.String() }),
            502: t.Object({ error: t.String() }),
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
              log.warn('upstream suppression add failed — proceeding with local-only', { err, email })
            }
          }
          try {
            await db()
              .insert(schema.emailSuppression)
              .values({ email, source: 'manual', reason: body.reason ?? null })
              .onConflictDoNothing()
          } catch (err) {
            set.status = 500
            return { error: err instanceof Error ? err.message : 'insert failed' }
          }
          await host().audit.record({
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
  )
}
