import { Elysia, t } from 'elysia'
import { eq, inArray } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { plugins, releases } from '$db/schema'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const actionEnum = t.Union([t.Literal('approve'), t.Literal('reject'), t.Literal('delete')])

export default new Elysia()
  .use(adminMiddleware)
  .post('/', async ({ body, set, admin, request }) => {
    if (body.ids.length === 0) {
      set.status = 400
      return { error: 'ids must contain at least one slug' }
    }
    if (body.ids.length > 100) {
      set.status = 400
      return { error: 'bulk action limited to 100 ids per request' }
    }

    const targets = await db.query.plugins.findMany({ where: { id: { in: body.ids } } })
    const found = new Set(targets.map((p) => p.id))
    const missing = body.ids.filter((id) => !found.has(id))

    let affected = 0
    if (body.action === 'delete') {
      await db.delete(releases).where(inArray(releases.pluginId, body.ids))
      await db.delete(plugins).where(inArray(plugins.id, body.ids))
      affected = targets.length
    } else {
      const status = body.action === 'approve' ? 'approved' : 'rejected'
      const patch: Partial<typeof plugins.$inferInsert> = {
        status,
        rejectionReason: body.action === 'reject' ? (body.rejectionReason ?? null) : null,
        updatedAt: Date.now(),
      }
      await db.update(plugins).set(patch).where(inArray(plugins.id, body.ids))
      affected = targets.length
    }

    for (const id of body.ids) await cache().del(latestCacheKey(id))

    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: `plugin.bulk.${body.action}`,
      target: `plugins:${body.ids.length}`,
      meta: { ids: body.ids, missing, affected, rejectionReason: body.rejectionReason ?? null },
    })

    return { ok: true, action: body.action, affected, missing }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Bulk-approve / reject / delete plugins',
      description:
        'Apply the same action to up to 100 plugins in one round-trip. `delete` cascades to releases. `reject` accepts an optional reason. Single audit-log entry per call.',
      operationId: 'bulkPluginAction',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      ids: t.Array(t.String(), { maxItems: 100 }),
      action: actionEnum,
      rejectionReason: t.Optional(t.String({ maxLength: 500 })),
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
  })
