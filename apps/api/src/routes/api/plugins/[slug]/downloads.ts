import { Elysia, t } from 'elysia'
import { sql, eq } from 'drizzle-orm'
import { db } from '$db'
import { downloadEvents } from '$db/schema'

export default new Elysia().get(
  '/',
  async ({ params, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: { id: params.slug },
      columns: { id: true },
    })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }

    const byVersion = await db
      .select({
        version: downloadEvents.version,
        platform: downloadEvents.platform,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(downloadEvents)
      .where(eq(downloadEvents.pluginId, params.slug))
      .groupBy(downloadEvents.version, downloadEvents.platform)

    const versionMap = new Map<string, { total: number; platforms: Record<string, number> }>()
    let grandTotal = 0
    for (const row of byVersion) {
      const n = Number(row.count) || 0
      grandTotal += n
      const v = versionMap.get(row.version) ?? { total: 0, platforms: {} }
      v.total += n
      v.platforms[row.platform] = (v.platforms[row.platform] ?? 0) + n
      versionMap.set(row.version, v)
    }

    const versions = Array.from(versionMap.entries())
      .map(([version, data]) => ({ version, ...data }))
      .sort((a, b) => (a.version < b.version ? 1 : -1))

    return { total: grandTotal, versions }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Aggregated download counts per version + platform',
      operationId: 'getPluginDownloadStats',
    },
    params: t.Object({ slug: t.String() }),
    response: {
      200: t.Object({
        total: t.Number(),
        versions: t.Array(
          t.Object({
            version: t.String(),
            total: t.Number(),
            platforms: t.Record(t.String(), t.Number()),
          }),
        ),
      }),
      404: t.Object({ error: t.String() }),
    },
  },
)
