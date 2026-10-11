import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { webhookDeliveries } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { deliveryView } from '$lib/webhooks/admin'
import { attemptDelivery } from '$lib/webhooks/delivery'
import { isWebhookEvent, sampleContext, subscribes, WEBHOOK_EVENTS } from '$lib/webhooks/events'

// Sends one delivery with sample data synchronously and returns its outcome.
// Works on disabled webhooks too, so a hook can be verified before enabling.
export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, body, set, admin, request }) => {
    const hook = await db.query.webhooks.findFirst({ where: { id: params.id } })
    if (!hook) {
      set.status = 404
      return { error: 'Webhook not found' }
    }
    const event = body?.event ?? WEBHOOK_EVENTS.find((e) => subscribes(hook.events, e)) ?? 'plugin.approved'
    if (!isWebhookEvent(event)) {
      set.status = 400
      return { error: `unknown event "${event}"` }
    }
    const id = ulid()
    const now = Date.now()
    await db.insert(webhookDeliveries).values({
      id,
      webhookId: hook.id,
      event,
      payload: JSON.stringify(sampleContext(event)),
      status: 'pending',
      nextAttemptAt: now,
      createdAt: now,
    })
    // One-shot: a test should report its outcome, not retry in the background.
    await attemptDelivery(id, { allowDisabled: true, retry: false })
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'webhook.test',
      target: `webhook:${hook.id}`,
      meta: { event },
    })
    const row = await db.query.webhookDeliveries.findFirst({ where: { id } })
    return { delivery: row ? deliveryView(row) : null }
  },
  {
    params: t.Object({ id: t.String() }),
    body: t.Optional(t.Object({ event: t.Optional(t.String()) })),
    detail: {
      tags: ['Admin'],
      summary: 'Send a test delivery',
      description: 'Renders the webhook with sample data for `event` and sends it once, without retries.',
      operationId: 'adminTestWebhook',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  },
)
