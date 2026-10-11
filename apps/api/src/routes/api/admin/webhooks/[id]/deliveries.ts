import { Elysia, t } from 'elysia'
import { and, desc, eq, lt } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { webhookDeliveries } from '$db/schema'
import { deliveryView } from '$lib/webhooks/admin'

export default new Elysia().use(adminMiddleware).get(
  '/',
  async ({ params, query, set }) => {
    const hook = await db.query.webhooks.findFirst({ where: { id: params.id }, columns: { id: true } })
    if (!hook) {
      set.status = 404
      return { error: 'Webhook not found' }
    }
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100)
    const where = query.before
      ? and(eq(webhookDeliveries.webhookId, params.id), lt(webhookDeliveries.createdAt, Number(query.before)))
      : eq(webhookDeliveries.webhookId, params.id)
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(where)
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
    return {
      deliveries: rows.map(deliveryView),
      next: rows.length === limit ? rows[rows.length - 1].createdAt : null,
    }
  },
  {
    params: t.Object({ id: t.String() }),
    query: t.Object({ limit: t.Optional(t.Numeric()), before: t.Optional(t.Numeric()) }),
    detail: {
      tags: ['Admin'],
      summary: 'List deliveries of a webhook',
      description: 'Newest first. Paginate with `before` = the previous page’s `next`. Secret values are masked.',
      operationId: 'adminListWebhookDeliveries',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  },
)
