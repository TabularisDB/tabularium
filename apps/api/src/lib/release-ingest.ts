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
import { resolveManifest, resolveManifestFromReleaseAssets, fetchReleaseAssetList, rawContentBase } from './manifest'
import { manifestPatch, applyManifestToPlugin } from './manifest-apply'
import { getSetting } from './settings'
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
  assets: Array<{ name: string; url: string }> = [],
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

  // Asset-first: the release payload carries direct download URLs to every
  // file the author published. These are immutable per release, so this path
  // is race-free (unlike the legacy git-ref fetch). Fall back to the git path
  // only when the operator allows it via the require_release_asset setting.
  let manifest: Awaited<ReturnType<typeof resolveManifest>> = null
  try {
    manifest = await resolveManifestFromReleaseAssets(token, assets)
  } catch (err) {
    log.warn({ err, slug: plugin.id, tag }, 'asset-based manifest resolution errored')
  }

  if (!manifest) {
    const require = getSetting('manifest.require_release_asset') !== '0'
    if (require) {
      const reason = 'no manifest asset published on the release'
      log.warn({ slug: plugin.id, tag, reason, assetCount: assets.length }, 'manifest asset missing — strict mode')
      await recordAudit({
        action: 'plugin.manifest_asset_missing',
        target: `plugin:${plugin.id}`,
        meta: { tag, version, assetCount: assets.length, willRecheck: true },
      })
      // Most CIs create the release first and upload assets seconds later
      // (one PUT per asset, no second webhook). Schedule background rechecks
      // that re-pull the current asset list from the forge; if the manifest
      // shows up, we ingest then and emit plugin.manifest_recovered.
      scheduleAssetRecheck({ id: plugin.id, ownerId: plugin.ownerId, repoUrl: plugin.repoUrl }, tag, version, 0)
      return null
    }
    // Fallback to the legacy git-ref fetch with a bounded retry to absorb
    // the tag-just-pushed propagation race.
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

const ASSET_RECHECK_DELAYS_MS = [30_000, 90_000, 180_000]

type PluginRef = { id: string; ownerId: string; repoUrl: string }

function scheduleAssetRecheck(plugin: PluginRef, tag: string, version: string, attempt: number): void {
  if (attempt >= ASSET_RECHECK_DELAYS_MS.length) return
  const delay = ASSET_RECHECK_DELAYS_MS[attempt]
  const timer = setTimeout(() => {
    void recheckAssetsOnce(plugin, tag, version, attempt).catch((err) =>
      log.error({ err, slug: plugin.id, tag, attempt }, 'asset recheck crashed'),
    )
  }, delay)
  // Don't pin the event loop on this timer — process shutdown shouldn't wait.
  timer.unref?.()
}

async function recheckAssetsOnce(plugin: PluginRef, tag: string, version: string, attempt: number): Promise<void> {
  // Bail if some other ingest path beat us to applying the manifest, or if
  // the plugin's latest moved past this version (a newer release superseded).
  const expectedVersion = version.replace(/^v/, '')
  const current = await db.query.plugins.findFirst({
    where: { id: plugin.id },
    columns: { latestVersion: true, manifestVersion: true },
  })
  if (!current) return
  if (current.latestVersion !== expectedVersion) return
  if (current.manifestVersion === expectedVersion) return

  const ref = parseRepoUrl(plugin.repoUrl)
  if (!ref) return
  const ownerIdentity = await db.query.identities.findFirst({
    where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
  })
  if (!ownerIdentity?.accessToken) return
  let token: string
  try {
    token = await getValidAccessToken(ownerIdentity, ref.instance)
  } catch {
    return
  }

  const assets = await fetchReleaseAssetList(token, ref, tag)
  if (!assets || assets.length === 0) {
    scheduleAssetRecheck(plugin, tag, version, attempt + 1)
    return
  }
  let manifest: Awaited<ReturnType<typeof resolveManifest>> = null
  try {
    manifest = await resolveManifestFromReleaseAssets(token, assets)
  } catch (err) {
    log.warn({ err, slug: plugin.id, tag, attempt }, 'asset recheck resolution errored')
  }
  if (!manifest) {
    scheduleAssetRecheck(plugin, tag, version, attempt + 1)
    return
  }
  try {
    const patch = manifestPatch(manifest, { repoBase: rawContentBase(ref, tag), version: expectedVersion })
    await applyManifestToPlugin(plugin.id, patch)

    // Back-fill the binary asset URL map. The original webhook race left
    // releases.assets={} (the publish event fires before CI uploads the zips);
    // by the time the recheck runs, the forge API returns the full list, so
    // mirror it onto the release row and kick off hashing.
    const freshMap: AssetMap = {}
    for (const asset of assets) {
      const key = inferPlatformKey(asset.name)
      if (key) freshMap[key] = { url: asset.url }
    }
    let assetsBackfilled = 0
    if (Object.keys(freshMap).length > 0) {
      const currentRelease = await db.query.releases.findFirst({
        where: { pluginId: plugin.id, version: expectedVersion },
      })
      if (currentRelease) {
        const merged = parseAssets(currentRelease.assets)
        for (const [platform, entry] of Object.entries(freshMap)) {
          const prev = merged[platform]
          if (prev && prev.url === entry.url && prev.sha256) continue
          merged[platform] = entry
          assetsBackfilled++
        }
        if (assetsBackfilled > 0) {
          await db
            .update(releases)
            .set({ assets: serializeAssets(merged) })
            .where(and(eq(releases.pluginId, plugin.id), eq(releases.version, expectedVersion)))
          void hashReleaseAssetsAsync(
            plugin,
            { repoUrl: plugin.repoUrl, published: true, tag, assets },
            freshMap,
            expectedVersion,
          ).catch((err) => log.error({ err, slug: plugin.id, tag }, 'recheck asset hashing crashed'))
        }
      }
    }

    await cache().del(latestCacheKey(plugin.id))
    log.info({ slug: plugin.id, tag, attempt, assetsBackfilled }, 'manifest recovered via asset recheck')
    await recordAudit({
      action: 'plugin.manifest_recovered',
      target: `plugin:${plugin.id}`,
      meta: {
        tag,
        version: expectedVersion,
        attempt: attempt + 1,
        delaySeconds: ASSET_RECHECK_DELAYS_MS[attempt] / 1000,
        assetsBackfilled,
      },
    })
  } catch (err) {
    log.warn({ err, slug: plugin.id, tag }, 'asset recheck apply failed')
  }
}
