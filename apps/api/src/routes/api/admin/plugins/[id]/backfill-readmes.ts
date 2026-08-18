import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { backfillReleaseReadmes } from '$lib/release-ingest'
import { OAuthExpiredError, UpstreamUnauthorizedError, reauthErrorBody } from '$lib/oauth-tokens'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'readme-backfill' })

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ params, set, admin, request }) => {
    const plugin = await db.query.plugins.findFirst({ where: { id: params.id } })
    if (!plugin) {
      set.status = 404
      return { error: 'Plugin not found' }
    }

    let result: Awaited<ReturnType<typeof backfillReleaseReadmes>>
    try {
      result = await backfillReleaseReadmes(plugin)
    } catch (e) {
      if (e instanceof OAuthExpiredError || e instanceof UpstreamUnauthorizedError) {
        set.status = 401
        return reauthErrorBody(e)
      }
      log.warn({ err: e, slug: plugin.id }, 'readme backfill failed')
      set.status = 422
      return { error: e instanceof Error ? e.message : 'Backfill failed' }
    }

    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'plugin.backfill_readmes',
      target: `plugin:${plugin.id}`,
      meta: result,
    })

    return { ok: true, ...result }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Backfill per-release READMEs from each release tag',
      description:
        'Releases ingested before READMEs were captured per release have none stored. This reads the README at ' +
        "each such release's tag using the owner's stored OAuth token and fills it in. Tags are immutable, so the " +
        'recovered README is what that version actually shipped with. Already-populated releases are left alone.',
      operationId: 'backfillReleaseReadmes',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({
        ok: t.Boolean(),
        scanned: t.Number(),
        filled: t.Number(),
        skipped: t.Number(),
      }),
      401: t.Object({ error: t.String(), reauthFor: t.String() }),
      404: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String() }),
    },
  },
)
