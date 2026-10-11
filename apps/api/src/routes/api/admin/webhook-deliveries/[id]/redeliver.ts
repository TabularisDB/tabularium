import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { webhookDeliveries } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { deliveryView } from '$lib/webhooks/admin'
import { attemptDelivery } from '$lib/webhooks/delivery'

// Re-sends the original event payload as a new delivery (the old row stays
// as history), rendered with the webhook's current template.
export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, set, admin, request }) => {
    const original = await db.query.webhookDeliveries.findFirst({ where: { id: params.id } })
    if (!original) {
      set.status = 404
      return { error: 'Delivery not found' }
    }
    const id = ulid()
    const now = Date.now()
    await db.insert(webhookDeliveries).values({
      id,
      webhookId: original.webhookId,
      event: original.event,
      payload: original.payload,
      status: 'pending',
      nextAttemptAt: now,
      createdAt: now,
    })
    await attemptDelivery(id, { retry: false })
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'webhook.redeliver',
      target: `webhook:${original.webhookId}`,
      meta: { deliveryId: original.id, newDeliveryId: id, event: original.event },
    })
    const row = await db.query.webhookDeliveries.findFirst({ where: { id } })
    return { delivery: row ? deliveryView(row) : null }
  },
  {
    params: t.Object({ id: t.String() }),
    detail: {
      tags: ['Admin'],
      summary: 'Redeliver a webhook delivery',
      operationId: 'adminRedeliverWebhook',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  },
)
