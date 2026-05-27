import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { refreshManifestForPlugin } from '$lib/refresh-manifest'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, body, set, admin, request }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }
    const result = await refreshManifestForPlugin(plugin, { branch: body?.ref })
    if (!('ok' in result)) {
      set.status = result.status
      return result.body
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'plugin.refresh_manifest',
      target: `plugin:${plugin.id}`,
      meta: { ref: result.ref, source: result.source },
    })
    return result
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Re-fetch the .tabularium manifest from the repo',
      description:
        'Pulls `.tabularium` (and the README) from the repo at the given ref (defaults to the latest released tag or HEAD).',
      operationId: 'refreshPluginManifest',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    body: t.Optional(t.Object({ ref: t.Optional(t.String()) })),
    response: {
      200: t.Object({ ok: t.Boolean(), slug: t.String(), source: t.String(), ref: t.String() }),
      401: t.Object({ error: t.String(), reauthFor: t.String() }),
      404: t.Object({ error: t.String() }),
      412: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
