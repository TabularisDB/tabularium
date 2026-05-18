import { Elysia, t } from 'elysia'
import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { plugins, releases } from '$db/schema'
import { inferPlatformKey } from '$lib/webhook'
import { parseRepoUrl } from '$lib/providers'
import { decryptToken } from '$lib/crypto'
import { fetchLatestRelease } from '$lib/release-fetch'
import { serializeAssets, type AssetMap } from '$lib/asset'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'webhook-replay' })

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(Number)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (Number.isNaN(aMaj + aMin + aPat) || Number.isNaN(bMaj + bMin + bPat)) return 0
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPat - bPat
}

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, set, admin, request }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    if (plugin.status !== 'approved') {
      set.status = 423
      return { error: `Plugin is ${plugin.status} — approve before replaying releases` }
    }
    const ref = parseRepoUrl(plugin.repoUrl)
    if (!ref) {
      set.status = 422
      return { error: 'Repo URL no longer parses to a configured provider instance' }
    }
    const ownerIdentity = await db.query.identities.findFirst({
      where: { userId: plugin.ownerId, providerInstanceId: ref.instance.id },
    })
    if (!ownerIdentity?.accessToken) {
      set.status = 412
      return { error: 'No stored access token for owner — owner must re-link their provider account' }
    }
    const token = decryptToken(ownerIdentity.accessToken)

    const normalized = await fetchLatestRelease(token, ref).catch((err) => {
      log.warn({ err, slug: plugin.id }, 'fetch latest release failed')
      return null
    })
    if (!normalized) {
      set.status = 404
      return { error: 'No published release found on the upstream repo' }
    }
    if (!normalized.published) {
      return { ok: true, skipped: true, reason: 'Latest release is a draft' }
    }

    const version = normalized.tag.replace(/^v/, '')
    const assetMap: AssetMap = {}
    for (const asset of normalized.assets) {
      const key = inferPlatformKey(asset.name)
      if (key) assetMap[key] = { url: asset.url }
    }

    await db
      .insert(releases)
      .values({ id: ulid(), pluginId: plugin.id, version, assets: serializeAssets(assetMap) })
      .onConflictDoUpdate({
        target: [releases.pluginId, releases.version],
        set: { assets: serializeAssets(assetMap) },
      })

    if (!plugin.latestVersion || compareSemver(version, plugin.latestVersion) > 0) {
      await db.update(plugins).set({ latestVersion: version, updatedAt: Date.now() }).where(eq(plugins.id, plugin.id))
    }
    await cache().del(latestCacheKey(plugin.id))

    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'plugin.replay_webhook',
      target: `plugin:${plugin.id}`,
      meta: { version, assets: Object.keys(assetMap) },
    })

    return { ok: true, version, assets: Object.keys(assetMap) }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Manually replay the latest release ingest',
      description:
        "Re-fetches the upstream latest release via the owner's stored OAuth token and runs the same ingest path the " +
        'webhook uses. Useful when the webhook never fired (initial setup) or upstream timed out. Skips signature verification.',
      operationId: 'replayWebhook',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        version: t.Optional(t.String()),
        assets: t.Optional(t.Array(t.String())),
        skipped: t.Optional(t.Boolean()),
        reason: t.Optional(t.String()),
      }),
      404: t.Object({ error: t.String() }),
      412: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
      423: t.Object({ error: t.String() }),
    },
  },
)
