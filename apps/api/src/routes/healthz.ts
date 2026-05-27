import { Elysia, t } from 'elysia'
import { runAllChecks } from '$lib/health-checks'

export default new Elysia().get(
  '/',
  async ({ set }) => {
    const { ok } = await runAllChecks()
    if (!ok) set.status = 503
    return { ok }
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Health check',
      description:
        'Liveness/readiness probe. Returns `{ ok: true }` (200) when DB + cache + storage are reachable, ' +
        '`{ ok: false }` (503) otherwise. Intentionally terse to avoid leaking driver / setup-mode details ' +
        'to unauthenticated callers — admins should hit `/api/admin/diagnostics` for the full breakdown.',
      operationId: 'healthz',
    },
    response: {
      200: t.Object({ ok: t.Boolean() }),
      503: t.Object({ ok: t.Boolean() }),
    },
  },
)
