import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { setSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia().use(adminMiddleware).post(
  '/',
  async ({ admin, request }) => {
    await setSetting('setup.completed_at', String(Date.now()))
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'setup.complete',
      target: 'setup',
    })
    return { ok: true }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Mark the setup wizard as completed',
      description: 'Sets `setup.completed_at` in settings. Frontend stops redirecting to /welcome after this.',
      operationId: 'completeSetup',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ ok: t.Boolean() }) },
  },
)
