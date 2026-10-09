import { Elysia, t } from 'elysia'
import { and, count, countDistinct, eq, isNotNull, sum } from 'drizzle-orm'
import { db } from '$db'
import { plugins, pluginRequests } from '$db/schema'
import { cache } from '$lib/cache'
import { getKinds } from '$lib/kinds'

const statsSchema = t.Object({
  plugins: t.Number(),
  downloads: t.Number(),
  authors: t.Number(),
  requests: t.Number(),
  kinds: t.Number(),
})
type Stats = typeof statsSchema.static

const CACHE_KEY = 'stats:public'
const CACHE_TTL_SECONDS = 60

const isStats = (v: unknown): v is Stats =>
  !!v && typeof v === 'object' && typeof (v as Stats).plugins === 'number' && typeof (v as Stats).downloads === 'number'

async function computeStats(): Promise<Stats> {
  // Same visibility rule as the public catalogue: approved and indexed.
  const listed = and(eq(plugins.status, 'approved'), isNotNull(plugins.manifestVersion))
  const [catalog] = await db
    .select({ plugins: count(), downloads: sum(plugins.downloads), authors: countDistinct(plugins.author) })
    .from(plugins)
    .where(listed)
  const [requests] = await db.select({ n: count() }).from(pluginRequests)
  return {
    plugins: catalog.plugins,
    // SUM comes back as a string (or null on an empty table) on every dialect.
    downloads: Number(catalog.downloads ?? 0),
    authors: catalog.authors,
    requests: requests.n,
    kinds: getKinds().length,
  }
}

export default new Elysia().get(
  '/',
  async () => {
    const cached = await cache().get(CACHE_KEY, isStats)
    if (cached) return cached
    const fresh = await computeStats()
    await cache().set(CACHE_KEY, fresh, CACHE_TTL_SECONDS)
    return fresh
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Public registry stats',
      description:
        'Headline numbers for the landing page: listed plugins, total downloads, distinct authors, open requests and configured kinds. Cached for 60 seconds. Public — no auth required.',
      operationId: 'getStats',
    },
    response: { 200: statsSchema },
  },
)
