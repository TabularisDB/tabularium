import { Elysia } from 'elysia'
import { desc } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { webhooks } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { createWebhook, toView, WebhookInputError } from '$lib/webhooks/admin'
import { createBody } from '$lib/webhooks/schemas'

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async () => {
      const rows = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt))
      return { webhooks: rows.map(toView) }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'List notification webhooks',
        operationId: 'adminListWebhooks',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
    },
  )
  .post(
    '/',
    async ({ body, set, admin, request }) => {
      try {
        const row = await createWebhook(body)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'webhook.create',
          target: `webhook:${row.id}`,
          meta: { name: row.name, events: body.events, preset: row.preset },
        })
        set.status = 201
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
      body: createBody,
      detail: {
        tags: ['Admin'],
        summary: 'Create a notification webhook',
        description:
          'URL, header values and body are templates rendered per event (`{{plugin.name}}`, `{{secrets.NAME}}`, …). ' +
          'See `GET /api/admin/webhooks/presets` for events, presets and placeholders.',
        operationId: 'adminCreateWebhook',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
    },
  )
