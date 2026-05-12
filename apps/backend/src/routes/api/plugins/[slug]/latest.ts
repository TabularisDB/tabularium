import { Elysia, t } from 'elysia'
import { db } from '../../../../db'
import { plugins, releases } from '../../../../db/schema'
import { eq, and } from 'drizzle-orm'

const latestSuccessSchema = t.Object({
  version: t.String(),
  min_tabularis_version: t.Nullable(t.String()),
  download_url: t.String(),
})

const errorSchema = t.Object({ error: t.String() })

export default new Elysia()
  .get('/', async ({ params, query, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: eq(plugins.id, params.slug),
    })

    if (!plugin || !plugin.latestVersion) {
      set.status = 404
      return { error: 'Plugin not found or has no releases' }
    }

    const release = await db.query.releases.findFirst({
      where: and(
        eq(releases.pluginId, plugin.id),
        eq(releases.version, plugin.latestVersion),
      ),
    })

    if (!release) {
      set.status = 404
      return { error: 'Latest release not found' }
    }

    const platformKey = `${query.os}-${query.arch}`
    const assets = JSON.parse(release.assets) as Record<string, string>
    const downloadUrl = assets[platformKey] ?? assets.universal

    if (!downloadUrl) {
      set.status = 422
      return { error: `Platform ${platformKey} not supported by this plugin` }
    }

    return {
      version: release.version,
      min_tabularis_version: release.minTabularisVersion,
      download_url: downloadUrl,
    }
  }, {
    detail: { tags: ['Plugins'] },
    query: t.Object({
      os: t.String(),
      arch: t.String(),
    }),
    response: {
      200: latestSuccessSchema,
      404: errorSchema,
      422: errorSchema,
    },
  })
