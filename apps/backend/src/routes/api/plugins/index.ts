import { Elysia, t } from 'elysia'
import { db } from '../../../db'
import { plugins } from '../../../db/schema'
import { like, or, count } from 'drizzle-orm'

const releaseSchema = t.Object({
  id: t.String(),
  pluginId: t.String(),
  version: t.String(),
  minTabularisVersion: t.Nullable(t.String()),
  assets: t.Record(t.String(), t.String()),
  createdAt: t.Number(),
})

const pluginSummarySchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  name: t.String(),
  description: t.String(),
  author: t.String(),
  repoUrl: t.String(),
  homepage: t.String(),
  latestVersion: t.Nullable(t.String()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
  releases: t.Array(releaseSchema),
})

const pluginListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  plugins: t.Array(pluginSummarySchema),
})

export default new Elysia()
  .get('/', async ({ query }) => {
    const page = Number(query.page ?? 1)
    const limit = Math.min(Number(query.limit ?? 20), 100)
    const offset = (page - 1) * limit
    const search = query.search?.trim()

    const where = search
      ? or(
          like(plugins.name, `%${search}%`),
          like(plugins.description, `%${search}%`),
          like(plugins.id, `%${search}%`),
        )
      : undefined

    const [{ total }] = await db
      .select({ total: count() })
      .from(plugins)
      .where(where)

    const rows = await db.query.plugins.findMany({
      where,
      limit,
      offset,
      with: { releases: true },
    })

    return {
      total,
      page,
      limit,
      plugins: rows.map(({ webhookSecret, ...p }) => ({
        ...p,
        releases: p.releases.map((r) => ({
          ...r,
          assets: JSON.parse(r.assets) as Record<string, string>,
        })),
      })),
    }
  }, {
    detail: { tags: ['Plugins'] },
    query: t.Object({
      search: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
    response: { 200: pluginListResponseSchema },
  })
