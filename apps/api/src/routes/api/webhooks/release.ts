import { Elysia } from 'elysia'
import { ulid } from 'ulid'
import { eq, and } from 'drizzle-orm'
import { db } from '$db'
import { plugins, releases, releaseAssets } from '$db/schema'
import {
  inferPlatformKey,
  verifyGithubSignature,
  verifyGitlabToken,
  parseGithubPayload,
  parseGitlabPayload,
  type NormalizedRelease,
} from '$lib/webhook'
import { getInstance } from '$lib/provider-instance'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { hashAsset, serializeAssets, parseAssets, type AssetMap } from '$lib/asset'
import { logger } from '$lib/logger'
import { identities } from '$db/schema'
import { decryptToken } from '$lib/crypto'
import { resolveManifest, rawContentBase } from '$lib/manifest'
import { manifestPatch, applyManifestToPlugin } from '$lib/manifest-apply'
import { parseRepoUrl } from '$lib/providers'
import { fetchAttestation } from '$lib/attestation'
import { recordAudit } from '$lib/audit'

const ingestLog = logger.child({ module: 'release-ingest' })

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(Number)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (Number.isNaN(aMaj + aMin + aPat) || Number.isNaN(bMaj + bMin + bPat)) return 0
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPat - bPat
}

export default new Elysia()
  .post('/', async ({ request, set }) => {
    const rawBody = await request.arrayBuffer()
    const bodyBuffer = Buffer.from(rawBody)

    let payload: unknown
    try {
      payload = JSON.parse(bodyBuffer.toString('utf-8'))
    } catch {
      set.status = 400
      return { error: 'Invalid JSON' }
    }

    const githubSig = request.headers.get('x-hub-signature-256')
    const gitlabToken = request.headers.get('x-gitlab-token')

    let normalized: NormalizedRelease | null = null
    if (gitlabToken) normalized = parseGitlabPayload(payload)
    if (!normalized && githubSig) normalized = parseGithubPayload(payload)
    if (!normalized) normalized = parseGithubPayload(payload) ?? parseGitlabPayload(payload)

    if (!normalized) {
      set.status = 400
      return { error: 'Unrecognized webhook payload' }
    }

    const plugin = await db.query.plugins.findFirst({ where: { repoUrl: normalized.repoUrl } })

    const inst = plugin?.providerInstanceId ? getInstance(plugin.providerInstanceId) : undefined
    const valid = await (async () => {
      if (!plugin) return false
      // GitLab kind always uses x-gitlab-token. github / gitea always use x-hub-signature-256.
      if (inst?.kind === 'gitlab') {
        return gitlabToken ? verifyGitlabToken(plugin.webhookSecret, gitlabToken) : false
      }
      if (githubSig) return verifyGithubSignature(plugin.webhookSecret, bodyBuffer, githubSig)
      // Fallback for plugins without an instance link (legacy): accept either scheme.
      if (gitlabToken) return verifyGitlabToken(plugin.webhookSecret, gitlabToken)
      return false
    })()

    if (!plugin || !valid) {
      set.status = 401
      return { error: 'Invalid signature' }
    }

    if (plugin.status !== 'approved') {
      set.status = 423
      return { error: `Plugin is ${plugin.status} — releases are not ingested until approved by an admin` }
    }

    if (!normalized.published) {
      return { ok: true, skipped: true }
    }

    const version = normalized.tag.replace(/^v/, '')

    const assetMap: AssetMap = {}
    for (const asset of normalized.assets) {
      const key = inferPlatformKey(asset.name)
      if (key) assetMap[key] = { url: asset.url }
    }

    const releaseId = ulid()
    await db
      .insert(releases)
      .values({
        id: releaseId,
        pluginId: plugin.id,
        version,
        assets: serializeAssets(assetMap),
      })
      .onConflictDoUpdate({
        target: [releases.pluginId, releases.version],
        set: { assets: serializeAssets(assetMap) },
      })

    const shouldUpdate = !plugin.latestVersion || compareSemver(version, plugin.latestVersion) > 0
    if (shouldUpdate) {
      await db.update(plugins).set({ latestVersion: version, updatedAt: Date.now() }).where(eq(plugins.id, plugin.id))
    }

    await cache().del(latestCacheKey(plugin.id))

    // Re-fetch .tabularium at the tag in the background.
    queueMicrotask(async () => {
      try {
        const ref = parseRepoUrl(plugin.repoUrl)
        if (!ref) return
        const ownerIdentity = await db.query.identities.findFirst({
          where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
        })
        if (!ownerIdentity?.accessToken) return
        const token = decryptToken(ownerIdentity.accessToken)
        const manifest = await resolveManifest(token, ref, { ref: normalized.tag })
        if (!manifest) return
        const patch = manifestPatch(manifest, {
          repoBase: rawContentBase(ref, normalized.tag),
          version,
        })
        await applyManifestToPlugin(plugin.id, patch)
        await cache().del(latestCacheKey(plugin.id))
        ingestLog.info({ slug: plugin.id, version, source: manifest.source }, 'manifest refreshed at release')
      } catch (err) {
        ingestLog.warn({ err, slug: plugin.id }, 'manifest refresh at release failed')
      }
    })

    // Hash assets in the background — don't block the webhook response.
    queueMicrotask(async () => {
      try {
        const fresh: AssetMap = { ...assetMap }
        // hashed[name] = { sha256, size } — keyed by raw asset.name so we can
        // also upsert per-asset rows into `release_assets` below.
        const hashed = new Map<string, { sha256: string; size: number; url: string }>()
        // We need the release row early so over-cap audits can target it.
        const current = await db.query.releases.findFirst({
          where: { pluginId: plugin.id, version },
        })
        if (!current) return
        for (const asset of normalized.assets) {
          const result = await hashAsset(asset.url)
          if (!result.sha256 || typeof result.size !== 'number') {
            // Over-cap skips emit an audit entry so operators can trace
            // why a release came in without one of its expected assets.
            if (result.reason && /exceeds.*byte cap/i.test(result.reason)) {
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

        // Keep the legacy JSON-blob in sync (read-only fallback per spec §C.6).
        const merged = parseAssets(current.assets)
        for (const [platform, entry] of Object.entries(fresh)) {
          if (entry.sha256) merged[platform] = entry
        }
        await db
          .update(releases)
          .set({ assets: serializeAssets(merged) })
          .where(and(eq(releases.pluginId, plugin.id), eq(releases.version, version)))

        // Persist one row per asset into `release_assets`, upserting by the
        // `(release_id, name)` unique index so webhook re-deliveries don't
        // duplicate rows.
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

        // GitHub artifact attestation relay — for plugins hosted on a GitHub
        // (or GHE) instance, look up the sigstore bundle GitHub stores
        // alongside the build and persist it verbatim into
        // `release_assets.attestation_bundle`. Non-GitHub providers and
        // releases without a bundle are silently skipped.
        const ref = parseRepoUrl(plugin.repoUrl)
        if (ref && ref.instance.kind === 'github' && hashed.size > 0) {
          const ownerIdentity = await db.query.identities.findFirst({
            where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
          })
          if (ownerIdentity?.accessToken) {
            const token = decryptToken(ownerIdentity.accessToken)
            const apiBase = ref.instance.baseUrl === 'https://github.com'
              ? 'https://api.github.com'
              : `${ref.instance.baseUrl}/api/v3`
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
                ingestLog.warn(
                  { err, slug: plugin.id, version, name },
                  'attestation relay failed',
                )
              }
            }
          }
        }

        await cache().del(latestCacheKey(plugin.id))
        ingestLog.info(
          { slug: plugin.id, version, hashed: hashed.size },
          'release assets hashed',
        )
      } catch (err) {
        ingestLog.error({ err, slug: plugin.id, version }, 'asset hashing failed')
      }
    })

    return { ok: true, version, assets: Object.keys(assetMap) }
  }, {
    detail: {
      tags: ['Webhooks'],
      summary: 'Release event ingestion',
      description: 'GitHub / GitLab / Gitea (and Forgejo) post releases here. Signature scheme is picked per plugin\'s linked provider instance kind.',
      operationId: 'releaseWebhook',
    },
  })
