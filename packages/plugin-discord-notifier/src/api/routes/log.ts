import { Elysia, t } from 'elysia'
import { count, desc } from 'drizzle-orm'
import { host } from '../host-handles'
import { db, schema } from '../db'

const rowSchema = t.Object({
  id: t.String(),
  event: t.String(),
  status: t.String(),
  httpStatus: t.Nullable(t.Number()),
  error: t.Nullable(t.String()),
  sentAt: t.Number(),
})

export default function buildLogRoute() {
  return (
    new Elysia()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(host().middleware.admin as any)
      .get(
        '/',
        async ({ query }) => {
          const page = Math.max(1, Number(query.page ?? '1'))
          const limit = Math.min(200, Math.max(1, Number(query.limit ?? '10')))
          const offset = (page - 1) * limit
          const rows = await db()
            .select()
            .from(schema.webhookLog)
            .orderBy(desc(schema.webhookLog.sentAt))
            .limit(limit)
            .offset(offset)
          const [{ total }] = await db().select({ total: count() }).from(schema.webhookLog)
          return { rows, total, page, limit }
        },
        {
          detail: {
            tags: ['Admin'],
            summary: 'List Discord webhook send log entries (most recent first)',
            operationId: 'listDiscordNotifierLog',
          },
          query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
          }),
          response: {
            200: t.Object({
              rows: t.Array(rowSchema),
              total: t.Number(),
              page: t.Number(),
              limit: t.Number(),
            }),
            401: t.Object({ error: t.String() }),
          },
        },
      )
  )
}
