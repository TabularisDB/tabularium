import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { parseRepoUrl } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError, UpstreamUnauthorizedError, reauthErrorBody } from '$lib/oauth-tokens'
import { fetchLatestRelease } from '$lib/release-fetch'
import { persistRelease, hashReleaseAssetsAsync, refreshManifestAtRelease } from '$lib/release-ingest'
import { InvalidVersionError } from '$lib/semver'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'webhook-replay' })

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
    let token: string
    try {
      token = await getValidAccessToken(ownerIdentity, ref.instance)
    } catch (e) {
      if (e instanceof OAuthExpiredError) {
        set.status = 401
        return reauthErrorBody(e)
      }
      throw e
    }

    let normalized
    try {
      normalized = await fetchLatestRelease(token, ref)
    } catch (err) {
      if (err instanceof UpstreamUnauthorizedError) {
        set.status = 401
        return reauthErrorBody(err)
      }
      log.warn({ err, slug: plugin.id }, 'fetch latest release failed')
      normalized = null
    }
    if (!normalized) {
      set.status = 404
      return { error: 'No published release found on the upstream repo' }
    }
    if (!normalized.published) {
      return { ok: true, skipped: true, reason: 'Latest release is a draft' }
    }

    let version: string
    let assetMap: Awaited<ReturnType<typeof persistRelease>>['assetMap']
    try {
      ;({ version, assetMap } = await persistRelease(plugin, normalized))
    } catch (err) {
      if (err instanceof InvalidVersionError) {
        set.status = 422
        return { error: err.message }
      }
      throw err
    }

    queueMicrotask(async () => {
      const manifest = await refreshManifestAtRelease(plugin, normalized.tag, version)
      if (manifest)
        await persistRelease(plugin, normalized, { manifestSha256: manifest.sha, manifestRaw: manifest.raw })
    })

    queueMicrotask(() => {
      hashReleaseAssetsAsync(plugin, normalized, assetMap, version).catch((err) =>
        log.error({ err, slug: plugin.id, version }, 'background hashing crashed'),
      )
    })

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
      401: t.Object({ error: t.String(), reauthFor: t.String() }),
      404: t.Object({ error: t.String() }),
      412: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
      423: t.Object({ error: t.String() }),
    },
  },
)
