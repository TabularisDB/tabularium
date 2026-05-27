import { and, eq } from 'drizzle-orm'
import { db } from '$db'
import { releases } from '$db/schema'
import { parseAssets, serializeAssets, hashAsset, type AssetMap } from '$lib/asset'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'

export type RehashResult = Record<string, { sha256?: string; size?: number; reason?: string }>

// Re-hashes every asset of (pluginId, version), updating the releases.assets
// JSON in place. Skips assets that already have a sha256 unless force=true.
export async function rehashRelease(
  pluginId: string,
  version: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: true; results: RehashResult } | { ok: false; status: number; error: string }> {
  const release = await db.query.releases.findFirst({ where: { pluginId, version } })
  if (!release) return { ok: false, status: 404, error: `Release ${version} not found` }

  const current = parseAssets(release.assets)
  const updated: AssetMap = { ...current }
  const results: RehashResult = {}

  for (const [platform, entry] of Object.entries(current)) {
    if (entry.sha256 && !opts.force) {
      results[platform] = { sha256: entry.sha256, size: entry.size }
      continue
    }
    const result = await hashAsset(entry.url)
    results[platform] = result
    if (result.sha256) updated[platform] = { ...entry, sha256: result.sha256, size: result.size }
  }

  await db
    .update(releases)
    .set({ assets: serializeAssets(updated) })
    .where(and(eq(releases.pluginId, pluginId), eq(releases.version, version)))
  await cache().del(latestCacheKey(pluginId))

  return { ok: true, results }
}
