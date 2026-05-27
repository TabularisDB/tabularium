// Dialect-aware plugin search. pg → tsvector+GIN, sqlite → FTS5, mysql → LIKE
// (FULLTEXT's 3-char min token would silently drop short slugs like "ui").
import { sql, and, eq, count, inArray } from 'drizzle-orm'
import { db, getDialect } from '$db'
import { plugins } from '$db/schema'

export interface SearchFilters {
  status: 'approved' | 'pending' | 'rejected'
  category?: string | null
  tag?: string | null
  featured?: boolean
}

export interface SearchOptions extends SearchFilters {
  term: string
  limit: number
  offset: number
}

export interface SearchResult {
  total: number
  ids: string[]
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function sanitiseToken(term: string): string {
  // FTS-safe: keep word chars + spaces. Strip anything that could be a
  // tsquery / fts5-query operator (`!`, `&`, `:`, `"`, `*`, etc.).
  return term
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export async function searchPluginIds(opts: SearchOptions): Promise<SearchResult> {
  const dialect = getDialect()
  const clean = sanitiseToken(opts.term)
  if (!clean) return { total: 0, ids: [] }

  if (dialect === 'pg') return searchPgIds(clean, opts)
  if (dialect === 'sqlite') return searchSqliteIds(clean, opts)
  return searchMysqlIds(clean, opts)
}

// ----- pg ------------------------------------------------------------------

async function searchPgIds(term: string, opts: SearchOptions): Promise<SearchResult> {
  // websearch_to_tsquery handles operator-free user input safely (quoted phrases,
  // OR, etc.); append a prefix-match clause manually so "rea" finds "reactive".
  // Build as: (websearch_to_tsquery(term)) && to_tsquery(last_token:*)
  const tokens = term.split(' ')
  const prefix = tokens[tokens.length - 1]
  const tsQuery = sql`websearch_to_tsquery('english', ${term})`
  const prefixQuery = sql`to_tsquery('english', ${prefix + ':*'})`
  const fullQuery = sql`(${tsQuery} || ${prefixQuery})`

  const filters = [eq(plugins.status, opts.status)]
  if (opts.category) filters.push(eq(plugins.category, opts.category))
  if (opts.featured) filters.push(eq(plugins.featured, 1))
  if (opts.tag) {
    filters.push(sql`${plugins.tags} LIKE ${'%"' + escapeLike(opts.tag) + '"%'}`)
  }
  const where = and(sql`search_tsv @@ ${fullQuery}`, ...filters)

  const [{ total }] = await db.select({ total: count() }).from(plugins).where(where)
  const rows = await db
    .select({
      id: plugins.id,
      rank: sql<number>`ts_rank_cd(search_tsv, ${fullQuery})`.as('rank'),
    })
    .from(plugins)
    .where(where)
    .orderBy(sql`rank DESC, ${plugins.updatedAt} DESC`)
    .limit(opts.limit)
    .offset(opts.offset)

  return { total: Number(total), ids: rows.map((r) => r.id) }
}

// ----- sqlite --------------------------------------------------------------

async function searchSqliteIds(term: string, opts: SearchOptions): Promise<SearchResult> {
  // FTS5 MATCH: turn each token into a prefix query joined with AND, so
  // "rea ui" matches "reactive ui-kit". The triggers keep plugins_fts in sync.
  const match = term
    .split(' ')
    .map((t) => `"${t}"*`)
    .join(' AND ')

  const filters = [eq(plugins.status, opts.status)]
  if (opts.category) filters.push(eq(plugins.category, opts.category))
  if (opts.featured) filters.push(eq(plugins.featured, 1))
  if (opts.tag) {
    filters.push(sql`${plugins.tags} LIKE ${'%"' + escapeLike(opts.tag) + '"%'}`)
  }

  // Two-step: FTS5 to get matching ids ranked by bm25, then re-apply filters
  // via the regular plugins table (so we keep one consistent query path).
  const hits = (await db.all(sql`
    SELECT plugins.id AS id, bm25(plugins_fts) AS rank
    FROM plugins_fts
    JOIN plugins ON plugins.rowid = plugins_fts.rowid
    WHERE plugins_fts MATCH ${match}
      AND plugins.status = ${opts.status}
    ORDER BY rank
    LIMIT 1000
  `)) as Array<{ id: string; rank: number }>

  if (hits.length === 0) return { total: 0, ids: [] }

  const idSet = hits.map((h) => h.id)
  const filterWithFts = and(inArray(plugins.id, idSet), ...filters)
  const [{ total }] = await db.select({ total: count() }).from(plugins).where(filterWithFts)
  const filtered = await db
    .select({ id: plugins.id })
    .from(plugins)
    .where(filterWithFts)
  const allowed = new Set(filtered.map((r) => r.id))
  const ranked = hits.filter((h) => allowed.has(h.id)).slice(opts.offset, opts.offset + opts.limit)
  return { total: Number(total), ids: ranked.map((r) => r.id) }
}

// ----- mysql ---------------------------------------------------------------

async function searchMysqlIds(term: string, opts: SearchOptions): Promise<SearchResult> {
  // LIKE fallback. See top-of-file rationale for why FULLTEXT is skipped.
  const like = `%${escapeLike(term)}%`
  const filters = [
    eq(plugins.status, opts.status),
    sql`(${plugins.name} LIKE ${like} OR ${plugins.description} LIKE ${like} OR ${plugins.id} LIKE ${like})`,
  ]
  if (opts.category) filters.push(eq(plugins.category, opts.category))
  if (opts.featured) filters.push(eq(plugins.featured, 1))
  if (opts.tag) filters.push(sql`${plugins.tags} LIKE ${'%"' + escapeLike(opts.tag) + '"%'}`)
  const where = and(...filters)

  const [{ total }] = await db.select({ total: count() }).from(plugins).where(where)
  const rows = await db
    .select({ id: plugins.id })
    .from(plugins)
    .where(where)
    .orderBy(sql`${plugins.updatedAt} DESC`)
    .limit(opts.limit)
    .offset(opts.offset)
  return { total: Number(total), ids: rows.map((r) => r.id) }
}
