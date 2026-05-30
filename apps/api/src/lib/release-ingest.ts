import { ulid } from 'ulid'
import { and, eq } from 'drizzle-orm'
import { db } from '$db'
import { plugins, releases, releaseAssets } from '$db/schema'
import { inferPlatformKey, type NormalizedRelease } from './webhook'
import { parseRepoUrl } from './providers'
import { getValidAccessToken, OAuthExpiredError } from './oauth-tokens'
import { hashAsset, serializeAssets, parseAssets, type AssetMap } from './asset'
import { cache } from './cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit } from './audit'
import { fetchAttestation } from './attestation'
import { logger } from './logger'
import { compareSemver } from './semver'
import { resolveManifest, rawContentBase } from './manifest'
import { manifestPatch, applyManifestToPlugin } from './manifest-apply'
import { createHash } from 'node:crypto'

const log = logger.child({ module: 'release-ingest' })

// Upserts the release row + bumps latestVersion + invalidates latest cache.
// Assets are NOT hashed here — fire hashReleaseAssetsAsync in the background.
// `manifestSha256` is the sha256 of the raw manifest file at this release —
// the registry-integrity JWS signs it so verifiers can pin the source manifest.
export async function persistRelease(
  plugin: { id: string; latestVersion: string | null },
  normalized: NormalizedRelease,
  opts: { manifestSha256?: string | null } = {},
): Promise<{ version: string; assetMap: AssetMap }> {
  const version = normalized.tag.replace(/^v/, '')

  const assetMap: AssetMap = {}
  for (const asset of normalized.assets) {
    const key = inferPlatformKey(asset.name)
    if (key) assetMap[key] = { url: asset.url }
  }

  const sha = opts.manifestSha256 ?? null
  await db
    .insert(releases)
    .values({ id: ulid(), pluginId: plugin.id, version, assets: serializeAssets(assetMap), manifestSha256: sha })
    .onConflictDoUpdate({
      target: [releases.pluginId, releases.version],
      set: { assets: serializeAssets(assetMap), manifestSha256: sha },
    })

  if (!plugin.latestVersion || compareSemver(version, plugin.latestVersion) > 0) {
    await db.update(plugins).set({ latestVersion: version, updatedAt: Date.now() }).where(eq(plugins.id, plugin.id))
  }

  await cache().del(latestCacheKey(plugin.id))

  return { version, assetMap }
}

// Background job — never await inside a request handler. Hashes assets,
// writes release_assets rows, mirrors hashes into the releases.assets JSON,
// and pulls GitHub sigstore attestations when present.
export async function hashReleaseAssetsAsync(
  plugin: { id: string; ownerId: string; repoUrl: string },
  normalized: NormalizedRelease,
  assetMap: AssetMap,
  version: string,
): Promise<void> {
  try {
    const fresh: AssetMap = { ...assetMap }
    const hashed = new Map<string, { sha256: string; size: number; url: string }>()
    const current = await db.query.releases.findFirst({
      where: { pluginId: plugin.id, version },
    })
    if (!current) return

    for (const asset of normalized.assets) {
      const result = await hashAsset(asset.url)
      if (!result.sha256 || typeof result.size !== 'number') {
        if (result.reason && /exceeds.*hash budget/i.test(result.reason)) {
          await recordAudit({
            action: 'release.asset_skipped',
            target: `release:${current.id}`,
            meta: { reason: result.reason, url: asset.url, name: asset.name },
          })
        }
        continue
      }
      hashed.set(asset.name, { sha256: result.sha256, size: result.size, url: asset.url })
      const platform = inferPlatformKey(asset.name)
      if (platform && fresh[platform]) {
        fresh[platform] = { ...fresh[platform], sha256: result.sha256, size: result.size }
      }
    }

    const merged = parseAssets(current.assets)
    for (const [platform, entry] of Object.entries(fresh)) {
      if (entry.sha256) merged[platform] = entry
    }
    await db
      .update(releases)
      .set({ assets: serializeAssets(merged) })
      .where(and(eq(releases.pluginId, plugin.id), eq(releases.version, version)))

    for (const [name, info] of hashed) {
      await db
        .insert(releaseAssets)
        .values({
          id: ulid(),
          releaseId: current.id,
          name,
          url: info.url,
          size: info.size,
          sha256: info.sha256,
        })
        .onConflictDoUpdate({
          target: [releaseAssets.releaseId, releaseAssets.name],
          set: { url: info.url, size: info.size, sha256: info.sha256 },
        })
    }

    const ref = parseRepoUrl(plugin.repoUrl)
    if (ref && ref.instance.kind === 'github' && hashed.size > 0) {
      const ownerIdentity = await db.query.identities.findFirst({
        where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
      })
      if (ownerIdentity?.accessToken) {
        let token: string
        try {
          token = await getValidAccessToken(ownerIdentity, ref.instance)
        } catch (e) {
          if (e instanceof OAuthExpiredError) {
            log.warn({ slug: plugin.id, version }, 'attestation skipped — token refresh failed')
            return
          }
          throw e
        }
        const apiBase =
          ref.instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${ref.instance.baseUrl}/api/v3`
        for (const [name, info] of hashed) {
          try {
            const bundle = await fetchAttestation({
              apiBase,
              owner: ref.owner,
              repo: ref.repo,
              sha256: info.sha256,
              token,
            })
            if (bundle) {
              await db
                .update(releaseAssets)
                .set({ attestationBundle: JSON.stringify(bundle) })
                .where(and(eq(releaseAssets.releaseId, current.id), eq(releaseAssets.name, name)))
            }
          } catch (err) {
            log.warn({ err, slug: plugin.id, version, name }, 'attestation relay failed')
          }
        }
      }
    }

    await cache().del(latestCacheKey(plugin.id))
    log.info({ slug: plugin.id, version, hashed: hashed.size }, 'release assets hashed')
  } catch (err) {
    log.error({ err, slug: plugin.id, version }, 'asset hashing failed')
  }
}

export function manifestSha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

// Pulls the manifest at `ref.tag` and applies it to the plugin row, returning
// the manifest sha256 so the caller can persist it on the release. Returns null
// when the owner OAuth token isn't usable or no manifest is found.
const REFRESH_RETRY_DELAY_MS = 5_000

export async function refreshManifestAtRelease(
  plugin: { id: string; ownerId: string; repoUrl: string },
  tag: string,
  version: string,
): Promise<string | null> {
  const ref = parseRepoUrl(plugin.repoUrl)
  if (!ref) return null
  const ownerIdentity = await db.query.identities.findFirst({
    where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
  })
  if (!ownerIdentity?.accessToken) {
    await recordAudit({
      action: 'plugin.manifest_refresh_failed',
      target: `plugin:${plugin.id}`,
      meta: { tag, version, reason: 'owner has no stored access token' },
    })
    return null
  }
  let token: string
  try {
    token = await getValidAccessToken(ownerIdentity, ref.instance)
  } catch (e) {
    if (e instanceof OAuthExpiredError) {
      log.warn({ slug: plugin.id }, 'manifest refresh skipped — owner OAuth token expired')
      await recordAudit({
        action: 'plugin.manifest_refresh_failed',
        target: `plugin:${plugin.id}`,
        meta: { tag, version, reason: 'owner OAuth token expired' },
      })
      return null
    }
    throw e
  }

  // Webhooks fire microseconds after the tag is pushed; the upstream API
  // sometimes returns 404 for the tag for a beat. One bounded retry covers
  // that race without turning a hard failure into an infinite loop.
  let manifest: Awaited<ReturnType<typeof resolveManifest>> = null
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      manifest = await resolveManifest(token, ref, { ref: tag })
      if (manifest) break
      if (attempt < 2) {
        log.info({ slug: plugin.id, tag, attempt }, 'manifest not found — retrying after delay')
        await new Promise((r) => setTimeout(r, REFRESH_RETRY_DELAY_MS))
      }
    } catch (err) {
      lastError = err
      if (attempt < 2) {
        log.warn({ err, slug: plugin.id, tag, attempt }, 'manifest fetch errored — retrying after delay')
        await new Promise((r) => setTimeout(r, REFRESH_RETRY_DELAY_MS))
      }
    }
  }

  if (!manifest) {
    const reason = lastError instanceof Error ? lastError.message : 'no .tabularium file at release tag'
    log.warn({ slug: plugin.id, tag, reason }, 'manifest refresh at release failed after retry')
    await recordAudit({
      action: 'plugin.manifest_refresh_failed',
      target: `plugin:${plugin.id}`,
      meta: { tag, version, reason },
    })
    return null
  }

  try {
    const patch = manifestPatch(manifest, { repoBase: rawContentBase(ref, tag), version })
    await applyManifestToPlugin(plugin.id, patch)
    await cache().del(latestCacheKey(plugin.id))
    const sha = manifestSha256(manifest.raw)
    log.info({ slug: plugin.id, version, source: manifest.source }, 'manifest refreshed at release')
    return sha
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    log.warn({ err, slug: plugin.id }, 'manifest apply failed after fetch succeeded')
    await recordAudit({
      action: 'plugin.manifest_refresh_failed',
      target: `plugin:${plugin.id}`,
      meta: { tag, version, reason: `apply failed: ${reason}` },
    })
    return null
  }
}
