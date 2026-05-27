import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { recordAudit, actorFromUser } from '$lib/audit'
import { parseRepoUrl } from '$lib/providers'
import { fetchLatestRelease } from '$lib/release-fetch'
import { persistRelease, hashReleaseAssetsAsync } from '$lib/release-ingest'
import { getValidAccessToken, OAuthExpiredError, UpstreamUnauthorizedError, reauthErrorBody } from '$lib/oauth-tokens'
import { rehashRelease } from '$lib/rehash'

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
        let fetched
        try {
          fetched = await fetchLatestRelease(token, ref)
        } catch (e) {
          if (e instanceof UpstreamUnauthorizedError) {
            set.status = 401
            return reauthErrorBody(e)
          }
          fetched = null
        }
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
      const result = await rehashRelease(plugin.id, version, { force: body.force })
      if (!result.ok) {
        set.status = result.status
        return { error: result.error }
      }
      await recordAudit({
        ...actorFromUser(user, request),
        action: 'plugin.rehash',
        target: `plugin:${plugin.id}`,
        meta: { version, force: Boolean(body.force), by: 'author' },
      })
      return { ok: true, slug: plugin.id, version, results: result.results }
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
        401: t.Object({ error: t.String(), reauthFor: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        412: t.Object({ error: t.String() }),
        422: t.Object({ error: t.String() }),
      },
    },
  )
