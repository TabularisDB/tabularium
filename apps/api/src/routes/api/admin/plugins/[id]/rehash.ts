import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { rehashRelease } from '$lib/rehash'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, body, set, admin, request }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const version = body.version ?? plugin.latestVersion
    if (!version) {
      set.status = 400
      return { error: 'No version available — plugin has no releases' }
    }
    const result = await rehashRelease(plugin.id, version, { force: body.force })
    if (!result.ok) {
      set.status = result.status
      return { error: result.error }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'plugin.rehash',
      target: `plugin:${plugin.id}`,
      meta: { version, force: Boolean(body.force) },
    })
    return { ok: true, slug: plugin.id, version, results: result.results }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Re-hash release assets',
      description:
        'Re-fetches every asset of the given (or latest) release and updates `sha256` + `size`. Useful when the original ' +
        'webhook fetch failed. Set `force: true` to re-hash assets that already have a sha256.',
      operationId: 'rehashRelease',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
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
      404: t.Object({ error: t.String() }),
    },
  },
)
