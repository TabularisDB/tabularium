import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { parseRepoUrl } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError, UpstreamUnauthorizedError, reauthErrorBody } from '$lib/oauth-tokens'
import { resolveManifest, rawContentBase } from '$lib/manifest'
import { manifestPatch, applyManifestToPlugin } from '$lib/manifest-apply'
import { cache } from '$lib/cache'
import { latestCacheKey } from '$routes/api/plugins/[slug]/latest'
import { recordAudit, actorFromUser } from '$lib/audit'

export default new Elysia()
  .use(authMiddleware)
  .use(
    rateLimit({
      bucket: 'plugin.author.refresh-manifest',
      limit: 1,
      windowSeconds: 60,
      keyFn: ({ user, request }) => {
        const url = new URL(request.url)
        // /api/plugins/<slug>/refresh-manifest → segment [3] is the slug
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
        return { error: 'Only the plugin owner can refresh this manifest' }
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
        return { error: 'No stored access token — re-link your provider account' }
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
      const branch = body?.ref ?? plugin.latestVersion ?? 'HEAD'
      let manifest
      try {
        manifest = await resolveManifest(token, ref, { ref: branch })
      } catch (e) {
        if (e instanceof UpstreamUnauthorizedError) {
          set.status = 401
          return reauthErrorBody(e)
        }
        throw e
      }
      if (!manifest) {
        set.status = 404
        return { error: `No .tabularium file found in ${plugin.repoUrl} @ ${branch}` }
      }
      const patch = manifestPatch(manifest, {
        repoBase: rawContentBase(ref, branch),
        version: branch,
      })
      await applyManifestToPlugin(plugin.id, patch)
      await cache().del(latestCacheKey(plugin.id))
      await recordAudit({
        ...actorFromUser(user, request),
        action: 'plugin.refresh_manifest',
        target: `plugin:${plugin.id}`,
        meta: { ref: branch, source: manifest.source, by: 'author' },
      })
      return { ok: true, slug: plugin.id, source: manifest.source, ref: branch }
    },
    {
      detail: {
        tags: ['Plugins'],
        summary: 'Re-fetch the .tabularium manifest (plugin owner)',
        description:
          'Pulls `.tabularium` (and the README) from the repo at the given ref (defaults to the latest released tag or HEAD). Authenticated plugin owners only; rate-limited to 1/min per plugin.',
        operationId: 'authorRefreshPluginManifest',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String() }),
      body: t.Optional(t.Object({ ref: t.Optional(t.String()) })),
      response: {
        200: t.Object({ ok: t.Boolean(), slug: t.String(), source: t.String(), ref: t.String() }),
        401: t.Object({ error: t.String(), reauthFor: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        412: t.Object({ error: t.String() }),
        422: t.Object({ error: t.String() }),
      },
    },
  )
