import { Elysia, t } from 'elysia'
import { db } from '../../../db'
import { plugins } from '../../../db/schema'
import { like, or, count, and, eq } from 'drizzle-orm'
import { projectPlugin } from '../../../lib/plugin-projection'
import { getKinds, isKindKey } from '../../../lib/kinds'

const screenshotSchema = t.Object({
  url: t.String(),
  caption: t.Nullable(t.String()),
  alt: t.Nullable(t.String()),
})

const pluginSummarySchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  providerInstanceId: t.Nullable(t.String()),
  name: t.String(),
  description: t.String(),
  author: t.String(),
  repoUrl: t.String(),
  homepage: t.String(),
  latestVersion: t.Nullable(t.String()),
  status: t.Union([t.Literal('approved'), t.Literal('pending'), t.Literal('rejected')]),
  category: t.Nullable(t.String()),
  tags: t.Array(t.String()),
  license: t.Nullable(t.String()),
  iconUrl: t.Nullable(t.String()),
  screenshots: t.Array(screenshotSchema),
  documentationUrl: t.Nullable(t.String()),
  supportEmail: t.Nullable(t.String()),
  issuesUrl: t.Nullable(t.String()),
  featured: t.Boolean(),
  featuredOrder: t.Nullable(t.Number()),
  downloads: t.Number(),
  manifestFetchedAt: t.Nullable(t.Number()),
  createdAt: t.Number(),
  updatedAt: t.Number(),
})

const pluginListResponseSchema = t.Object({
  total: t.Number(),
  page: t.Number(),
  limit: t.Number(),
  plugins: t.Array(pluginSummarySchema),
  facets: t.Object({
    categories: t.Array(t.Object({ value: t.String(), count: t.Number() })),
    kinds: t.Array(t.Object({ key: t.String(), label: t.String(), count: t.Number() })),
  }),
})

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

type RelationalFilter = Record<string, unknown>

export default new Elysia()
  .get('/', async ({ query }) => {
    const page = clampInt(query.page, 1, 1, 10_000)
    const limit = clampInt(query.limit, 20, 1, 100)
    const offset = (page - 1) * limit
    const search = query.search?.trim()
    const category = query.category?.trim()
    const tag = query.tag?.trim()
    const kindParam = query.kind?.trim()
    const kindFilterActive = kindParam !== undefined && kindParam.length > 0
    const kindValid = kindFilterActive && isKindKey(kindParam!)
    const orderBy: Record<string, 'asc' | 'desc'> = query.sort === 'new' ? { createdAt: 'desc' }
      : query.sort === 'name' ? { name: 'asc' }
      : query.sort === 'featured' ? { featuredOrder: 'asc' }
      : { updatedAt: 'desc' }

    const where: RelationalFilter = { status: 'approved' }
    if (search) {
      const term = `%${escapeLike(search)}%`
      where.OR = [
        { name: { like: term } },
        { description: { like: term } },
        { id: { like: term } },
      ]
    }
    if (category) where.category = category
    if (tag) where.tags = { like: `%"${escapeLike(tag)}"%` }
    if (kindFilterActive) {
      if (!kindValid) {
        return {
          total: 0,
          page,
          limit,
          plugins: [],
          facets: { categories: [], kinds: [] },
        }
      }
      where.tags = { like: `%"${escapeLike(kindParam!)}"%` }
    }
    if (query.featured === '1') where.featured = 1

    // Mirror the same filter as an SQL-expression for `db.select().count()`.
    const builderConditions = [eq(plugins.status, 'approved')]
    if (search) {
      const term = `%${escapeLike(search)}%`
      builderConditions.push(or(like(plugins.name, term), like(plugins.description, term), like(plugins.id, term))!)
    }
    if (category) builderConditions.push(eq(plugins.category, category))
    if (tag) builderConditions.push(like(plugins.tags, `%"${escapeLike(tag)}"%`))
    if (kindFilterActive && kindValid) builderConditions.push(like(plugins.tags, `%"${escapeLike(kindParam!)}"%`))
    if (query.featured === '1') builderConditions.push(eq(plugins.featured, 1))
    const builderWhere = builderConditions.length === 1 ? builderConditions[0] : and(...builderConditions)

    const [{ total }] = await db.select({ total: count() }).from(plugins).where(builderWhere)

    const rows = await db.query.plugins.findMany({
      where,
      limit,
      offset,
      orderBy,
    })

    const categoryRows = await db
      .select({ value: plugins.category, count: count() })
      .from(plugins)
      .where(eq(plugins.status, 'approved'))
      .groupBy(plugins.category)
    const categories = categoryRows
      .filter((c: { value: string | null; count: number }) => c.value !== null)
      .map((c: { value: string | null; count: number }) => ({ value: c.value as string, count: c.count }))
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count)

    const kinds = getKinds()
    let kindFacet: Array<{ key: string; label: string; count: number }> = []
    if (kinds.length > 0) {
      const tagRows = await db
        .select({ tags: plugins.tags })
        .from(plugins)
        .where(eq(plugins.status, 'approved'))
      const counts = new Map<string, number>()
      for (const row of tagRows) {
        if (!row.tags) continue
        let arr: unknown
        try { arr = JSON.parse(row.tags) } catch { continue }
        if (!Array.isArray(arr)) continue
        const seen = new Set<string>()
        for (const t of arr) {
          if (typeof t === 'string' && !seen.has(t)) {
            seen.add(t)
            if (kinds.some((k) => k.key === t)) counts.set(t, (counts.get(t) ?? 0) + 1)
          }
        }
      }
      kindFacet = kinds.map((k) => ({ key: k.key, label: k.label, count: counts.get(k.key) ?? 0 }))
    }

    return {
      total,
      page,
      limit,
      plugins: rows.map((p: typeof rows[number]) => projectPlugin(p)),
      facets: { categories, kinds: kindFacet },
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'List plugins',
      description:
        'Paginated catalog. Supports `search` (name/description/slug), `category` (exact), `tag` (exact), `featured=1`, and ' +
        '`sort=updated|new|name|featured`. Returns facets so the UI can render filter chips without an extra request. Public — no auth required.',
      operationId: 'listPlugins',
    },
    query: t.Object({
      search: t.Optional(t.String()),
      category: t.Optional(t.String()),
      tag: t.Optional(t.String()),
      kind: t.Optional(t.String()),
      featured: t.Optional(t.String()),
      sort: t.Optional(t.Union([t.Literal('updated'), t.Literal('new'), t.Literal('name'), t.Literal('featured')])),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
    response: { 200: pluginListResponseSchema },
  })
