import { Elysia, t } from 'elysia'
import { sql, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { db } from '../../../../db'
import { plugins, downloadEvents } from '../../../../db/schema'
import { cache } from '../../../../lib/cache'
import { parseAssets, type AssetMap } from '../../../../lib/asset'

function isLatestResolved(v: unknown): v is LatestResolved {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.version === 'string'
    && (o.minRuntimeVersion === null || typeof o.minRuntimeVersion === 'string')
    && typeof o.assets === 'object' && o.assets !== null
}

const platformEntrySchema = t.Object({
  url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
})

const latestSuccessSchema = t.Object({
  version: t.String(),
  min_runtime_version: t.Nullable(t.String()),
  platform: t.Nullable(t.String()),
  download_url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
  platforms: t.Record(t.String(), platformEntrySchema),
})

const errorSchema = t.Object({
  error: t.String(),
  platforms: t.Optional(t.Record(t.String(), platformEntrySchema)),
})

type LatestResolved = {
  version: string
  minRuntimeVersion: string | null
  assets: AssetMap
}

export function latestCacheKey(slug: string): string {
  return `plugin:latest:${slug}`
}

const TTL_SECONDS = 60

function detectFromUserAgent(ua: string | undefined): { os?: string; arch?: string } {
  if (!ua) return {}
  const lower = ua.toLowerCase()
  let os: string | undefined
  if (lower.includes('linux')) os = 'linux'
  else if (lower.includes('mac os') || lower.includes('darwin')) os = 'darwin'
  else if (lower.includes('windows') || lower.includes('win64') || lower.includes('win32')) os = 'win'
  let arch: string | undefined
  if (lower.includes('arm64') || lower.includes('aarch64')) arch = 'arm64'
  else if (lower.includes('x86_64') || lower.includes('x64') || lower.includes('amd64')) arch = 'x64'
  return { os, arch }
}

export default new Elysia()
  .get('/', async ({ params, query, headers, set }) => {
    const key = latestCacheKey(params.slug)
    let resolved = await cache().get<LatestResolved>(key, isLatestResolved)

    if (!resolved) {
      const plugin = await db.query.plugins.findFirst({ where: { id: params.slug } })
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

    const ua = headers['user-agent']
    const detected = detectFromUserAgent(ua)
    const os = query.os ?? detected.os
    const arch = query.arch ?? detected.arch
    const platformKey = os && arch ? `${os}-${arch}` : null
    const entry = (platformKey && resolved.assets[platformKey]) || resolved.assets.universal || null

    if (!entry) {
      set.status = 422
      return {
        error: platformKey
          ? `Platform ${platformKey} not available — see 'platforms' for the full list`
          : 'No platform specified and no universal asset published — pass ?os=&arch=',
        platforms: resolved.assets,
      }
    }

    // Best-effort tracking — failures don't break the resolve.
    const resolvedPlatform = platformKey && resolved.assets[platformKey]
      ? platformKey
      : (resolved.assets.universal ? 'universal' : 'unknown')
    Promise.allSettled([
      db.update(plugins).set({ downloads: sql`${plugins.downloads} + 1` }).where(eq(plugins.id, params.slug)),
      db.insert(downloadEvents).values({
        id: ulid(),
        pluginId: params.slug,
        version: resolved.version,
        platform: resolvedPlatform,
      }),
    ]).catch(() => {})

    return {
      version: resolved.version,
      min_runtime_version: resolved.minRuntimeVersion,
      platform: platformKey && resolved.assets[platformKey] ? platformKey : (resolved.assets.universal ? 'universal' : null),
      download_url: entry.url,
      size: entry.size,
      sha256: entry.sha256,
      platforms: resolved.assets,
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Resolve latest release for a platform',
      description:
        'Returns the matching asset for the requested platform. `os` and `arch` are optional — if missing, the User-Agent is inspected; if still unknown, falls back to `universal`. The full per-platform map is always included so clients can present alternatives.',
      operationId: 'getLatestAsset',
    },
    params: t.Object({ slug: t.String() }),
    query: t.Object({
      os: t.Optional(t.String({ description: '`linux`, `darwin`, or `win`.' })),
      arch: t.Optional(t.String({ description: '`x64` or `arm64`.' })),
    }),
    response: {
      200: latestSuccessSchema,
      404: errorSchema,
      422: errorSchema,
    },
  })
