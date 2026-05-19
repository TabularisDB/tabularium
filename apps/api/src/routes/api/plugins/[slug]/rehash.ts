import { Elysia, t } from 'elysia'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { releases } from '$db/schema'
import { parseAssets, serializeAssets, hashAsset, type AssetMap } from '$lib/asset'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit, actorFromUser } from '$lib/audit'
import { parseRepoUrl } from '$lib/providers'
import { decryptToken } from '$lib/crypto'
import { fetchLatestRelease } from '$lib/release-fetch'
import { persistRelease, hashReleaseAssetsAsync } from '$lib/release-ingest'

export default new Elysia()
  .use(authMiddleware)
  .use(
    rateLimit({
      bucket: 'plugin.author.rehash',
      limit: 1,
      windowSeconds: 60,
      keyFn: ({ user, request }) => {
        const url = new URL(request.url)
        const slug = url.pathname.split('/')[3] ?? 'unknown'
        return `plugin:${slug}:${user?.sub ?? 'anon'}`
      },
    }),
  )
  .post(
    '/',
    async ({ params, body, set, user, request }) => {
      const plugin = await db.query.plugins.findFirst({ where: { id: params.slug } })
      if (!plugin) {
        set.status = 404
        return { error: 'Plugin not found' }
      }
      if (plugin.ownerId !== user.sub) {
        set.status = 403
        return { error: 'Only the plugin owner can re-hash this release' }
      }
      // No version on disk yet → try to pull the latest release directly from
      // the forge. Useful right after submit, when the webhook hasn't fired or
      // the forge sent the release event before assets were uploaded.
      const version = body.version ?? plugin.latestVersion
      if (!version) {
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
          return { error: 'No stored access token — re-link your provider account first' }
        }
        const token = decryptToken(ownerIdentity.accessToken)
        const fetched = await fetchLatestRelease(token, ref).catch(() => null)
        if (!fetched || !fetched.published) {
          set.status = 404
          return { error: 'No published release found on the forge yet' }
        }
        const { version: fetchedVersion, assetMap } = await persistRelease(
          { id: plugin.id, latestVersion: plugin.latestVersion },
          fetched,
        )
        queueMicrotask(() =>
          hashReleaseAssetsAsync(
            { id: plugin.id, ownerId: plugin.ownerId, repoUrl: plugin.repoUrl },
            fetched,
            assetMap,
            fetchedVersion,
          ),
        )
        await recordAudit({
          ...actorFromUser(user, request),
          action: 'plugin.rehash',
          target: `plugin:${plugin.id}`,
          meta: { version: fetchedVersion, by: 'author', source: 'forge-fetch' },
        })
        const results: Record<string, { sha256?: string; size?: number; reason?: string }> = {}
        for (const [platform, entry] of Object.entries(assetMap)) {
          results[platform] = { sha256: entry.sha256, size: entry.size }
        }
        return { ok: true, slug: plugin.id, version: fetchedVersion, results }
      }
      const release = await db.query.releases.findFirst({
        where: { pluginId: plugin.id, version },
      })
      if (!release) {
        set.status = 404
        return { error: `Release ${version} not found` }
      }

      const current = parseAssets(release.assets)
      const updated: AssetMap = { ...current }
      const results: Record<string, { sha256?: string; size?: number; reason?: string }> = {}

      for (const [platform, entry] of Object.entries(current)) {
        if (entry.sha256 && !body.force) {
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
        .where(and(eq(releases.pluginId, plugin.id), eq(releases.version, version)))
      await cache().del(latestCacheKey(plugin.id))
      await recordAudit({
        ...actorFromUser(user, request),
        action: 'plugin.rehash',
        target: `plugin:${plugin.id}`,
        meta: { version, force: Boolean(body.force), by: 'author' },
      })

      return { ok: true, slug: plugin.id, version, results }
    },
    {
      detail: {
        tags: ['Plugins'],
        summary: 'Re-hash release assets (plugin owner)',
        description:
          'Re-fetches every asset of the given (or latest) release and updates `sha256` + `size`. Useful when the original webhook fetch raced asset upload. Set `force: true` to re-hash assets that already have a sha256. Authenticated plugin owners only; rate-limited to 1/min per plugin.',
        operationId: 'authorRehashRelease',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String() }),
      body: t.Object({
        version: t.Optional(t.String()),
        force: t.Optional(t.Boolean()),
      }),
      response: {
        200: t.Object({
          ok: t.Boolean(),
          slug: t.String(),
          version: t.String(),
          results: t.Record(
            t.String(),
            t.Object({
              sha256: t.Optional(t.String()),
              size: t.Optional(t.Number()),
              reason: t.Optional(t.String()),
            }),
          ),
        }),
        400: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        412: t.Object({ error: t.String() }),
        422: t.Object({ error: t.String() }),
      },
    },
  )
