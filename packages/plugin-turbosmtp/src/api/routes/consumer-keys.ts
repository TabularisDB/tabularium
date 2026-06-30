import { Elysia, t } from 'elysia'
import { adminMw } from '../host-handles'
import { buildTurboClient } from '../client'

const KeyRowSchema = t.Object({
  consumerKey: t.String(),
  label: t.Optional(t.String()),
  creationTime: t.Optional(t.String()),
})

const ErrorSchema = t.Object({ error: t.String() })

export default function buildConsumerKeysRoute() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Elysia()
    .use(adminMw() as any)
    .get(
      '/',
      async ({ set }) => {
        const client = buildTurboClient()
        if (!client) {
          set.status = 412
          return { error: 'TurboSMTP not configured — save API key first' }
        }
        try {
          const page = await client.consumerKeys.list()
          const out: { consumerKey: string; label?: string; creationTime?: string }[] = []
          for (const row of page.results) {
            if (!row.consumerKey) continue
            out.push({
              consumerKey: row.consumerKey,
              label: row.label,
              creationTime: row.creation_time,
            })
          }
          return { count: page.count, keys: out }
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown'
          set.status = 502
          return { error: `TurboSMTP consumer-keys fetch failed: ${reason}` }
        }
      },
      {
        detail: {
          tags: ['Admin'],
          summary: 'TurboSMTP — list consumer keys',
          operationId: 'listTurbosmtpConsumerKeys',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        response: {
          200: t.Object({ count: t.Number(), keys: t.Array(KeyRowSchema) }),
          412: ErrorSchema,
          502: ErrorSchema,
        },
      },
    )
    .post(
      '/',
      async ({ body, set }) => {
        const client = buildTurboClient()
        if (!client) {
          set.status = 412
          return { error: 'TurboSMTP not configured — save API key first' }
        }
        try {
          const created = await client.consumerKeys.create(body.label)
          return {
            consumerKey: created.consumerKey,
            consumerSecret: created.consumerSecret,
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown'
          set.status = 502
          return { error: `TurboSMTP consumer-key create failed: ${reason}` }
        }
      },
      {
        body: t.Object({ label: t.String({ minLength: 1, maxLength: 100 }) }),
        detail: {
          tags: ['Admin'],
          summary: 'TurboSMTP — create a consumer key (secret returned ONCE)',
          operationId: 'createTurbosmtpConsumerKey',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        response: {
          200: t.Object({ consumerKey: t.String(), consumerSecret: t.String() }),
          412: ErrorSchema,
          502: ErrorSchema,
        },
      },
    )
    .delete(
      '/:key',
      async ({ params, set }) => {
        const client = buildTurboClient()
        if (!client) {
          set.status = 412
          return { error: 'TurboSMTP not configured — save API key first' }
        }
        try {
          await client.consumerKeys.delete(params.key)
          return { ok: true }
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown'
          // TurboSmtp NotFoundError → 404 to admin
          if (reason.toLowerCase().includes('not_found') || reason.includes('404')) {
            set.status = 404
            return { error: `consumer key ${params.key} not found` }
          }
          set.status = 502
          return { error: `TurboSMTP consumer-key delete failed: ${reason}` }
        }
      },
      {
        params: t.Object({ key: t.String() }),
        detail: {
          tags: ['Admin'],
          summary: 'TurboSMTP — delete a consumer key',
          operationId: 'deleteTurbosmtpConsumerKey',
          security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        },
        response: {
          200: t.Object({ ok: t.Boolean() }),
          404: ErrorSchema,
          412: ErrorSchema,
          502: ErrorSchema,
        },
      },
    )
}
