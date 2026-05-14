import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { plugins, releases, users } from '$db/schema'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit } from '$lib/audit'

const statusEnum = t.Union([t.Literal('approved'), t.Literal('pending'), t.Literal('rejected')])

function jsonArray<T>(v: T[] | undefined): string | null | undefined {
  if (v === undefined) return undefined
  if (v.length === 0) return null
  return JSON.stringify(v)
}

export default new Elysia()
  .use(adminMiddleware)
  .patch('/', async ({ params, body, set, admin, request }) => {
    const existing = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const patch: Partial<typeof plugins.$inferInsert> = { updatedAt: Date.now() }
    if (body.status !== undefined) {
      patch.status = body.status
      patch.rejectionReason = body.status === 'rejected' ? (body.rejectionReason ?? null) : null
    }
    if (body.category !== undefined) patch.category = body.category || null
    if (body.tags !== undefined) {
      const v = jsonArray(body.tags)
      if (v !== undefined) patch.tags = v
    }
    if (body.featured !== undefined) {
      patch.featured = body.featured ? 1 : 0
      if (!body.featured) patch.featuredOrder = null
    }
    if (body.featuredOrder !== undefined) patch.featuredOrder = body.featuredOrder
    if (body.ownerId !== undefined) {
      const target = await db.query.users.findFirst({ where: { id: body.ownerId } })
      if (!target) {
        set.status = 400
        return { error: 'New owner user not found' }
      }
      patch.ownerId = body.ownerId
    }
    await db.update(plugins).set(patch).where(eq(plugins.id, params.id))
    await cache().del(latestCacheKey(params.id))
    await recordAudit({
      actorId: admin.id,
      actorName: admin.displayName,
      action: 'plugin.update',
      target: `plugin:${params.id}`,
      meta: body as Record<string, unknown>,
      ip: request.headers.get('x-forwarded-for') ?? null,
    })
    return { ok: true, id: params.id }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update plugin (status / moderation / pin / categorize)',
      description:
        'Partial update. `status` toggles approval. `featured: true` pins to the landing grid (use `featuredOrder` to set position). ' +
        '`category`/`tags` are normally driven by the `.pluggr` manifest but can be overridden here.',
      operationId: 'updatePlugin',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      status: t.Optional(statusEnum),
      rejectionReason: t.Optional(t.String({ maxLength: 500 })),
      category: t.Optional(t.String({ maxLength: 40 })),
      tags: t.Optional(t.Array(t.String({ maxLength: 30 }), { maxItems: 16 })),
      featured: t.Optional(t.Boolean()),
      featuredOrder: t.Optional(t.Number()),
      ownerId: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), id: t.String() }),
      404: t.Object({ error: t.String() }),
    },
  })
  .delete('/', async ({ params, set, admin, request }) => {
    const existing = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    await db.delete(releases).where(eq(releases.pluginId, params.id))
    await db.delete(plugins).where(eq(plugins.id, params.id))
    await cache().del(latestCacheKey(params.id))
    await recordAudit({
      actorId: admin.id,
      actorName: admin.displayName,
      ip: request.headers.get('x-forwarded-for') ?? null,
      action: 'plugin.delete',
      target: `plugin:${params.id}`,
    })
    set.status = 204
    return null
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Force-delete a plugin (admin override)',
      operationId: 'adminDeletePlugin',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  })
