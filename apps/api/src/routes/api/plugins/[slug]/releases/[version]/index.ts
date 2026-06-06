import { Elysia, t } from 'elysia'
import { sql, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { db } from '$db'
import { plugins, downloadEvents } from '$db/schema'
import { parseAssets } from '$lib/asset'

const platformEntrySchema = t.Object({
  url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
})

const successSchema = t.Object({
  version: t.String(),
  min_runtime_version: t.Nullable(t.String()),
  platform: t.Nullable(t.String()),
  download_url: t.String(),
  size: t.Optional(t.Number()),
  sha256: t.Optional(t.String()),
  platforms: t.Record(t.String(), platformEntrySchema),
  yanked: t.Boolean(),
  yanked_reason: t.Nullable(t.String()),
})

const errorSchema = t.Object({
  error: t.String(),
  platforms: t.Optional(t.Record(t.String(), platformEntrySchema)),
})

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

// Pinned-version sibling of /latest. Same resolver shape — the client picks
// a specific version (lockfile, deeplink, downgrade) and gets the same
// {download_url, sha256, platforms} envelope. Yanked releases still resolve
// (so existing installs can re-verify) but the `yanked` flag is set so the
// caller can warn or refuse.
export default new Elysia().get(
  '/',
  async ({ params, query, headers, set }) => {
    const plugin = await db.query.plugins.findFirst({
      where: { id: params.slug },
      columns: { id: true, status: true },
    })
    if (!plugin || plugin.status !== 'approved') {
      set.status = 404
      return { error: 'Plugin not found' }
    }

    const release = await db.query.releases.findFirst({
      where: { pluginId: plugin.id, version: params.version },
    })
    if (!release) {
      set.status = 404
      return { error: `Release ${params.version} not found` }
    }

    const assetMap = parseAssets(release.assets)

    const ua = headers['user-agent']
    const detected = detectFromUserAgent(ua)
    const os = query.os ?? detected.os
    const arch = query.arch ?? detected.arch
    const platformKey = os && arch ? `${os}-${arch}` : null
    const entry = (platformKey && assetMap[platformKey]) || assetMap.universal || null

    if (!entry) {
      set.status = 422
      return {
        error: platformKey
          ? `Platform ${platformKey} not available for ${release.version} — see 'platforms' for the full list`
          : 'No platform specified and no universal asset published — pass ?os=&arch=',
        platforms: assetMap,
      }
    }

    const resolvedPlatform =
      platformKey && assetMap[platformKey] ? platformKey : assetMap.universal ? 'universal' : 'unknown'

    Promise.allSettled([
      db
        .update(plugins)
        .set({ downloads: sql`${plugins.downloads} + 1` })
        .where(eq(plugins.id, params.slug)),
      db.insert(downloadEvents).values({
        id: ulid(),
        pluginId: params.slug,
        version: release.version,
        platform: resolvedPlatform,
      }),
    ]).catch(() => {})

    if (query.redirect === '1') {
      set.status = 302
      set.headers['location'] = entry.url
      set.headers['cache-control'] = 'no-store'
      return ''
    }

    return {
      version: release.version,
      min_runtime_version: release.minRuntimeVersion,
      platform: platformKey && assetMap[platformKey] ? platformKey : assetMap.universal ? 'universal' : null,
      download_url: entry.url,
      size: entry.size,
      sha256: entry.sha256,
      platforms: assetMap,
      yanked: release.yankedAt !== null,
      yanked_reason: release.yankReason ?? null,
    }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Resolve a specific release for a platform',
      description:
        'Version-pinned counterpart to `/latest`. Returns the matching asset URL + sha256 for an explicit `version`. ' +
        '`os` and `arch` follow the same UA-detection fallback. Yanked releases still resolve so existing installs can ' +
        're-verify checksums; the `yanked` flag (and optional `yanked_reason`) lets the client decide whether to warn or refuse.',
      operationId: 'getReleaseAsset',
    },
    params: t.Object({ slug: t.String(), version: t.String() }),
    query: t.Object({
      os: t.Optional(t.String({ description: '`linux`, `darwin`, or `win`.' })),
      arch: t.Optional(t.String({ description: '`x64` or `arm64`.' })),
      redirect: t.Optional(
        t.String({ description: 'Pass `1` to 302-redirect to the download URL instead of returning JSON.' }),
      ),
    }),
    response: {
      200: successSchema,
      302: t.String(),
      404: errorSchema,
      422: errorSchema,
    },
  },
)
