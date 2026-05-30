import { Elysia, t } from 'elysia'
import { eq, count } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { plugins } from '$db/schema'

const statusFilter = t.Optional(t.Union([t.Literal('approved'), t.Literal('pending'), t.Literal('rejected')]))

const pluginRowSchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  name: t.String(),
  description: t.String(),
  repoUrl: t.String(),
  status: t.Union([t.Literal('approved'), t.Literal('pending'), t.Literal('rejected')]),
  rejectionReason: t.Nullable(t.String()),
  latestVersion: t.Nullable(t.String()),
  featured: t.Boolean(),
  featuredOrder: t.Nullable(t.Number()),
  verified: t.Boolean(),
  verifiedAt: t.Nullable(t.Number()),
  verifiedBy: t.Nullable(t.String()),
  category: t.Nullable(t.String()),
  manifestFetchedAt: t.Nullable(t.Number()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
})

export default new Elysia().use(adminMiddleware).get(
  '/',
  async ({ query }) => {
    const builderWhere = query.status ? eq(plugins.status, query.status) : undefined
    const filter = query.status ? { status: query.status } : undefined
    const [{ total }] = await db.select({ total: count() }).from(plugins).where(builderWhere)
    const rows = await db.query.plugins.findMany({ where: filter })
    return {
      total,
      plugins: rows.map((p) => ({
        id: p.id,
        ownerId: p.ownerId,
        name: p.name,
        description: p.description,
        repoUrl: p.repoUrl,
        status: p.status,
        rejectionReason: p.rejectionReason,
        latestVersion: p.latestVersion,
        featured: p.featured === 1,
        featuredOrder: p.featuredOrder ?? null,
        verified: p.verifiedAt !== null,
        verifiedAt: p.verifiedAt ?? null,
        verifiedBy: p.verifiedBy ?? null,
        category: p.category ?? null,
        manifestFetchedAt: p.manifestFetchedAt ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'List plugins (incl. non-approved)',
      operationId: 'adminListPlugins',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    query: t.Object({ status: statusFilter }),
    response: {
      200: t.Object({ total: t.Number(), plugins: t.Array(pluginRowSchema) }),
    },
  },
)
