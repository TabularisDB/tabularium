import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { runAllChecks } from '$lib/health-checks'
import { getServerMode } from '$lib/server-mode'

const startedAt = Date.now()

const checkSchema = t.Object({ ok: t.Boolean(), detail: t.Optional(t.String()) })

export default new Elysia().use(adminMiddleware).get(
  '/',
  async () => {
    const { ok, checks } = await runAllChecks()
    return {
      ok,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      mode: getServerMode(),
      checks,
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'System diagnostics',
      description:
        'Admin-only deep health/diagnostics. Returns driver names, mode, uptime, and per-check failure detail. The public `/healthz` returns only `{ ok }` to avoid leaking infrastructure details.',
      operationId: 'adminDiagnostics',
    },
    response: {
      200: t.Object({
        ok: t.Boolean(),
        uptimeSeconds: t.Number(),
        mode: t.String(),
        checks: t.Object({ db: checkSchema, cache: checkSchema, storage: checkSchema }),
      }),
    },
  },
)
