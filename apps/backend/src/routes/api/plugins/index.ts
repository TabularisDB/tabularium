import { Elysia, t } from 'elysia'
import { db } from '../../../db'
import { plugins } from '../../../db/schema'
import { like, or, count } from 'drizzle-orm'

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
    query: t.Object({
      search: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  })
