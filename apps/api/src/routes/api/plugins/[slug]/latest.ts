import { Elysia, t } from 'elysia'
import { db } from '../../../../db'
import { cache } from '../../../../lib/cache'
import { parseAssets, type AssetMap } from '../../../../lib/asset'

function isLatestResolved(v: unknown): v is LatestResolved {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.version === 'string'
    && (o.minRuntimeVersion === null || typeof o.minRuntimeVersion === 'string')
    && typeof o.assets === 'object' && o.assets !== null
}

const latestSuccessSchema = t.Object({
  version: t.String(),
  min_runtime_version: t.Nullable(t.String()),
  download_url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
})

const errorSchema = t.Object({ error: t.String() })

type LatestResolved = {
  version: string
  minRuntimeVersion: string | null
  assets: AssetMap
}

export function latestCacheKey(slug: string): string {
  return `plugin:latest:${slug}`
}

const TTL_SECONDS = 60

export default new Elysia()
  .get('/', async ({ params, query, set }) => {
    const key = latestCacheKey(params.slug)
    let resolved = await cache().get<LatestResolved>(key, isLatestResolved)

    if (!resolved) {
      const plugin = await db.query.plugins.findFirst({
        where: { id: params.slug },
      })

      if (!plugin || plugin.status !== 'approved' || !plugin.latestVersion) {
        set.status = 404
        return { error: 'Plugin not found or has no releases' }
      }

      const release = await db.query.releases.findFirst({
        where: { pluginId: plugin.id, version: plugin.latestVersion },
      })

      if (!release) {
        set.status = 404
        return { error: 'Latest release not found' }
      }

      resolved = {
        version: release.version,
        minRuntimeVersion: release.minRuntimeVersion,
        assets: parseAssets(release.assets),
      }
      await cache().set(key, resolved, TTL_SECONDS)
    }

    const platformKey = `${query.os}-${query.arch}`
    const entry = resolved.assets[platformKey] ?? resolved.assets.universal

    if (!entry) {
      set.status = 422
      return { error: `Platform ${platformKey} not supported by this plugin` }
    }

    return {
      version: resolved.version,
      min_runtime_version: resolved.minRuntimeVersion,
      download_url: entry.url,
      size: entry.size,
      sha256: entry.sha256,
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Resolve latest release for a platform',
      description:
        'CLI-friendly endpoint that returns the download URL of the latest plugin release for a specific platform. ' +
        'If the platform-specific asset is missing, falls back to the `universal` asset. Returns 422 when neither is available. ' +
        'Response is cached server-side for 60s; cache is invalidated on every release webhook.',
      operationId: 'getLatestAsset',
    },
    params: t.Object({ slug: t.String() }),
    query: t.Object({
      os: t.String({ description: 'Operating system: `linux`, `darwin`, or `win`.' }),
      arch: t.String({ description: 'CPU architecture: `x64` or `arm64`.' }),
    }),
    response: {
      200: latestSuccessSchema,
      404: errorSchema,
      422: errorSchema,
    },
  })
