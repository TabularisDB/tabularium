import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { webhookDeliveries, webhooks } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { toView, updateWebhook, WebhookInputError } from '$lib/webhooks/admin'
import { patchBody } from '$lib/webhooks/schemas'

const security: Array<Record<string, string[]>> = [{ bearerAuth: [] }, { cookieAuth: [] }]

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async ({ params, set }) => {
      const row = await db.query.webhooks.findFirst({ where: { id: params.id } })
      if (!row) {
        set.status = 404
        return { error: 'Webhook not found' }
      }
      return { webhook: toView(row) }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { tags: ['Admin'], summary: 'Read a notification webhook', operationId: 'adminGetWebhook', security },
    },
  )
  .patch(
    '/',
    async ({ params, body, set, admin, request }) => {
      const existing = await db.query.webhooks.findFirst({ where: { id: params.id } })
      if (!existing) {
        set.status = 404
        return { error: 'Webhook not found' }
      }
      try {
        const row = await updateWebhook(existing, body)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'webhook.update',
          target: `webhook:${row.id}`,
          // Field names only — never secret values.
          meta: { fields: Object.keys(body), secrets: body.secrets ? Object.keys(body.secrets) : undefined },
        })
        return { webhook: toView(row) }
      } catch (err) {
        if (err instanceof WebhookInputError) {
          set.status = 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: patchBody,
      detail: {
        tags: ['Admin'],
        summary: 'Update a notification webhook',
        description:
          '`secrets` merges: a string sets a secret, `null` removes it. `signingSecret: null` disables signing.',
        operationId: 'adminUpdateWebhook',
        security,
      },
    },
  )
  .delete(
    '/',
    async ({ params, set, admin, request }) => {
      const existing = await db.query.webhooks.findFirst({ where: { id: params.id } })
      if (!existing) {
        set.status = 404
        return { error: 'Webhook not found' }
      }
      // Explicit child delete: SQLite connections don't enforce ON DELETE CASCADE.
      await db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, params.id))
      await db.delete(webhooks).where(eq(webhooks.id, params.id))
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'webhook.delete',
        target: `webhook:${params.id}`,
        meta: { name: existing.name },
      })
      return { ok: true }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ['Admin'],
        summary: 'Delete a notification webhook',
        operationId: 'adminDeleteWebhook',
        security,
      },
    },
  )
