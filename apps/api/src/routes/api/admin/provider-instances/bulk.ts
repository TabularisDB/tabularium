import { Elysia, t } from 'elysia'
import { inArray } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { providerInstances } from '$db/schema'
import { initProviderInstances, getInstance } from '$lib/provider-instance'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const actionEnum = t.Union([t.Literal('enable'), t.Literal('disable')])

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ body, set, admin, request }) => {
    if (body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one id' }
    }
    if (body.ids.length > 100) {
      set.status = 400
      return { error: 'bulk action limited to 100 ids per request' }
    }

    const found = body.ids.filter((id) => getInstance(id) !== undefined)
    const missing = body.ids.filter((id) => getInstance(id) === undefined)

    let affected = 0
    if (found.length > 0) {
      const enabledValue = body.action === 'enable' ? 1 : 0
      await db.update(providerInstances).set({ enabled: enabledValue }).where(inArray(providerInstances.id, found))
      affected = found.length
      // Rebuild the in-memory cache so subsequent reads (including the very
      // next list call from the admin UI) see the new enabled state.
      await initProviderInstances()
    }

    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: `provider_instance.bulk_${body.action}`,
      target: `provider_instances:${body.ids.length}`,
      meta: { ids: body.ids, missing, affected },
    })

    return { ok: true, action: body.action, affected, missing }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Bulk enable / disable provider instances',
      description:
        'Flip `enabled` on up to 100 provider instances in one round-trip. Unknown ids are returned in `missing` and silently skipped. Single audit-log entry per call.',
      operationId: 'bulkProviderInstanceAction',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      ids: t.Array(t.String(), { maxItems: 100 }),
      action: actionEnum,
    }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        action: actionEnum,
        affected: t.Number(),
        missing: t.Array(t.String()),
      }),
      400: t.Object({ error: t.String() }),
    },
  },
)
