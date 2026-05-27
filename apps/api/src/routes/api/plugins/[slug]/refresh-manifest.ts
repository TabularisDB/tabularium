import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { refreshManifestForPlugin } from '$lib/refresh-manifest'
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
      const result = await refreshManifestForPlugin(plugin, { branch: body?.ref })
      if (!('ok' in result)) {
        set.status = result.status
        return result.body
      }
      await recordAudit({
        ...actorFromUser(user, request),
        action: 'plugin.refresh_manifest',
        target: `plugin:${plugin.id}`,
        meta: { ref: result.ref, source: result.source, by: 'author' },
      })
      return result
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
