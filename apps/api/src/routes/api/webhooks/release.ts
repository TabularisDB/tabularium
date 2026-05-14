import { Elysia } from 'elysia'
import { ulid } from 'ulid'
import { eq, and } from 'drizzle-orm'
import { db } from '$db'
import { plugins, releases } from '$db/schema'
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
        for (const [platform, entry] of Object.entries(fresh)) {
          const result = await hashAsset(entry.url)
          if (result.sha256) fresh[platform] = { ...entry, sha256: result.sha256, size: result.size }
        }
        const current = await db.query.releases.findFirst({
          where: { pluginId: plugin.id, version },
        })
        if (!current) return
        const merged = parseAssets(current.assets)
        for (const [platform, entry] of Object.entries(fresh)) {
          if (entry.sha256) merged[platform] = entry
        }
        await db
          .update(releases)
          .set({ assets: serializeAssets(merged) })
          .where(and(eq(releases.pluginId, plugin.id), eq(releases.version, version)))
        await cache().del(latestCacheKey(plugin.id))
        ingestLog.info({ slug: plugin.id, version, hashed: Object.keys(merged).length }, 'release assets hashed')
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
