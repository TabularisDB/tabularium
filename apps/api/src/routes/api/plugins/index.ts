import { Elysia, t } from 'elysia'
import { db } from '$db'
import { plugins } from '$db/schema'
import { like, count, and, or, eq, isNotNull, sql } from 'drizzle-orm'
import { projectPlugin } from '$lib/plugin-projection'
import { getKinds, isKindKey } from '$lib/kinds'
import { searchPluginIds } from '$lib/search-plugins'

const screenshotSchema = t.Object({
  url: t.String(),
  caption: t.Nullable(t.String()),
  alt: t.Nullable(t.String()),
})

const requireEntrySchema = t.Object({
  id: t.String(),
  version: t.Optional(t.String()),
  optional: t.Optional(t.Boolean()),
  reason: t.Optional(t.String()),
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
  requires: t.Array(requireEntrySchema),
  documentationUrl: t.Nullable(t.String()),
  supportEmail: t.Nullable(t.String()),
  issuesUrl: t.Nullable(t.String()),
  featured: t.Boolean(),
  featuredOrder: t.Nullable(t.Number()),
  verified: t.Boolean(),
  verifiedAt: t.Nullable(t.Number()),
  extensions: t.Nullable(t.Record(t.String(), t.Any())),
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

function tagLikePattern(tag: string): string {
  return `%"${escapeLike(tag)}"%`
}

// Each filter tries two LIKE patterns so one query matches both scalar values
// (`"engine":"firestore"`) and array members (`"paradigms":[...,"document",...]`).
type ExtFilter = { key: string; value: string }

function parseExtFilters(rawQuery: Record<string, string | undefined>): ExtFilter[] {
  const out: ExtFilter[] = []
  for (const [k, v] of Object.entries(rawQuery)) {
    if (!k.startsWith('ext.') || k.length <= 4) continue
    if (typeof v !== 'string' || v.length === 0) continue
    out.push({ key: k.slice(4), value: v })
  }
  return out
}

function extLikePatterns(f: ExtFilter): { scalar: string; array: string } {
  const k = escapeLike(f.key)
  const v = escapeLike(f.value)
  return {
    scalar: `%"${k}":"${v}"%`,
    array: `%"${k}":[%"${v}"%]%`,
  }
}

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

type RelationalFilter = Record<string, unknown>

export default new Elysia().get(
  '/',
  async ({ query }) => {
    const page = clampInt(query.page, 1, 1, 10_000)
    const limit = clampInt(query.limit, 20, 1, 100)
    const offset = (page - 1) * limit
    const search = query.search?.trim()
    const category = query.category?.trim()
    const tag = query.tag?.trim()
    const kindParam = query.kind?.trim()
    const kindFilterActive = kindParam !== undefined && kindParam.length > 0
    const kindValid = kindFilterActive && isKindKey(kindParam!)
    // Verified plugins always lead each sort — admin-vetted entries sit
    // above unverified at equal rank. Drizzle's relational orderBy accepts a
    // function returning SQL fragments; `verifiedAt IS NULL` evaluates to 0
    // for verified rows and 1 for the rest in all three dialects, so an
    // ascending sort puts verified first regardless of NULLS-default policy.
    const baseOrderFns: Record<string, (cols: typeof plugins) => ReturnType<typeof sql>> = {
      new: (cols) => sql`${cols.createdAt} DESC`,
      name: (cols) => sql`${cols.name} ASC`,
      featured: (cols) => sql`${cols.featuredOrder} ASC`,
      updated: (cols) => sql`${cols.updatedAt} DESC`,
    }
    const baseOrderFn = baseOrderFns[query.sort ?? 'updated'] ?? baseOrderFns.updated
    const orderBy = (cols: typeof plugins) => [sql`(${cols.verifiedAt} IS NULL) ASC`, baseOrderFn(cols)]

    if (kindFilterActive && !kindValid) {
      return {
        total: 0,
        page,
        limit,
        plugins: [],
        facets: { categories: [], kinds: [] },
      }
    }

    const tagFilter = kindFilterActive ? kindParam! : tag
    const verifiedOnly = query.verified === '1'
    const extFilters = parseExtFilters(query as Record<string, string | undefined>)
    // manifestVersion is non-null only after a valid .tabularium has been
    // resolved and applied at ingest. Gating on it keeps manifest-less repos
    // (release published, no manifest asset) out of the public catalog — being
    // approved alone is not enough to be listed.
    const where: RelationalFilter = { status: 'approved', manifestVersion: { isNotNull: true } }
    if (category) where.category = category
    if (tagFilter) where.tags = { like: tagLikePattern(tagFilter) }
    if (query.featured === '1') where.featured = 1
    if (verifiedOnly) where.verifiedAt = { isNotNull: true }

    let total: number
    let rows: Awaited<ReturnType<typeof db.query.plugins.findMany>>

    if (search) {
      const result = await searchPluginIds({
        term: search,
        status: 'approved',
        category: category || null,
        tag: tagFilter || null,
        featured: query.featured === '1',
        verified: verifiedOnly,
        extFilters,
        limit,
        offset,
      })
      total = result.total
      if (result.ids.length === 0) {
        rows = []
      } else {
        const fetched = await db.query.plugins.findMany({ where: { id: { in: result.ids } } })
        const byId = new Map(fetched.map((p) => [p.id, p]))
        rows = result.ids.map((id) => byId.get(id)).filter((p): p is (typeof fetched)[number] => Boolean(p))
      }
    } else {
      const builderConditions = [eq(plugins.status, 'approved'), isNotNull(plugins.manifestVersion)]
      if (category) builderConditions.push(eq(plugins.category, category))
      if (tagFilter) builderConditions.push(like(plugins.tags, tagLikePattern(tagFilter)))
      if (query.featured === '1') builderConditions.push(eq(plugins.featured, 1))
      if (verifiedOnly) builderConditions.push(isNotNull(plugins.verifiedAt))
      for (const f of extFilters) {
        const p = extLikePatterns(f)
        const orClause = or(like(plugins.extensions, p.scalar), like(plugins.extensions, p.array))
        if (orClause) builderConditions.push(orClause)
      }
      const builderWhere = builderConditions.length === 1 ? builderConditions[0] : and(...builderConditions)

      const [row] = await db.select({ total: count() }).from(plugins).where(builderWhere)
      total = row.total
      if (extFilters.length > 0) {
        // ext-filter LIKE conditions don't fit the relational query syntax —
        // use the builder for the row fetch too so the two paths agree.
        rows = await db
          .select()
          .from(plugins)
          .where(builderWhere)
          .orderBy(...orderBy(plugins))
          .limit(limit)
          .offset(offset)
      } else {
        rows = await db.query.plugins.findMany({ where, limit, offset, orderBy })
      }
    }

    const listable = and(eq(plugins.status, 'approved'), isNotNull(plugins.manifestVersion))
    const categoryRows = await db
      .select({ value: plugins.category, count: count() })
      .from(plugins)
      .where(listable)
      .groupBy(plugins.category)
    const categories = categoryRows
      .filter((c: { value: string | null; count: number }) => c.value !== null)
      .map((c: { value: string | null; count: number }) => ({ value: c.value as string, count: c.count }))
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count)

    const kinds = getKinds()
    let kindFacet: Array<{ key: string; label: string; count: number }> = []
    if (kinds.length > 0) {
      const tagRows = await db.select({ tags: plugins.tags }).from(plugins).where(listable)
      const counts = new Map<string, number>()
      for (const row of tagRows) {
        if (!row.tags) continue
        let arr: unknown
        try {
          arr = JSON.parse(row.tags)
        } catch {
          continue
        }
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
      plugins: rows.map((p: (typeof rows)[number]) => projectPlugin(p)),
      facets: { categories, kinds: kindFacet },
    }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'List plugins',
      description:
        'Paginated catalog. Supports `search` (name/description/slug), `category` (exact), `tag` (exact), `featured=1`, and ' +
        '`sort=updated|new|name|featured`. Returns facets so the UI can render filter chips without an extra request. Public — no auth required.',
      operationId: 'listPlugins',
    },
    query: t.Object(
      {
        search: t.Optional(t.String()),
        category: t.Optional(t.String()),
        tag: t.Optional(t.String()),
        kind: t.Optional(t.String()),
        featured: t.Optional(t.String()),
        verified: t.Optional(t.String()),
        sort: t.Optional(t.Union([t.Literal('updated'), t.Literal('new'), t.Literal('name'), t.Literal('featured')])),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      },
      { additionalProperties: t.String() },
    ),
    response: { 200: pluginListResponseSchema },
  },
)
