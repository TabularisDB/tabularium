import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { DeliveryConfigError, decodeSecrets, maskRequest, renderRequest } from '$lib/webhooks/delivery'
import { isWebhookEvent, sampleContext } from '$lib/webhooks/events'
import { draftBody } from '$lib/webhooks/schemas'

// Render an (unsaved) definition against sample data without sending it.
// Secrets: values typed in the editor (`secrets`) win over the stored ones of
// `webhookId`; names with neither render as <NAME>. Real values are masked.
export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ body, set }) => {
    const event = body.event ?? 'plugin.approved'
    if (!isWebhookEvent(event)) {
      set.status = 400
      return { error: `unknown event "${event}"` }
    }
    let secrets: Record<string, string> = {}
    if (body.webhookId) {
      const row = await db.query.webhooks.findFirst({ where: { id: body.webhookId } })
      if (row) secrets = decodeSecrets(row)
    }
    for (const [name, value] of Object.entries(body.secrets ?? {}) as Array<[string, string]>) {
      if (value) secrets[name] = value
    }
    // Unknown secrets render as visible markers so the preview stays readable.
    for (const name of body.secretNames ?? []) secrets[name] ??= `<${name}>`
    try {
      const rendered = renderRequest(
        {
          method: body.definition.method ?? 'POST',
          url: body.definition.url,
          headers: JSON.stringify(body.definition.headers ?? []),
          body: body.definition.body ?? null,
          contentType: body.definition.contentType ?? 'application/json',
        },
        sampleContext(event) as unknown as Record<string, unknown>,
        secrets,
        { deliveryId: 'preview', event, signingSecret: null },
      )
      const stored = Object.entries(secrets)
        .filter(([k, v]) => v !== `<${k}>`)
        .map(([, v]) => v)
      return { ok: true, request: maskRequest(rendered, stored), error: null }
    } catch (err) {
      if (err instanceof DeliveryConfigError) return { ok: false, request: null, error: err.message }
      throw err
    }
  },
  {
    body: t.Object({
      event: t.Optional(t.String()),
      webhookId: t.Optional(t.String()),
      secretNames: t.Optional(t.Array(t.String({ maxLength: 64 }), { maxItems: 20 })),
      secrets: t.Optional(t.Record(t.String({ maxLength: 64 }), t.String({ maxLength: 4096 }))),
      definition: draftBody,
    }),
    detail: {
      tags: ['Admin'],
      summary: 'Preview a webhook template',
      description:
        'Renders the definition with sample data for `event`. Nothing is sent. `missing` lists unresolved placeholders.',
      operationId: 'adminPreviewWebhook',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  },
)
