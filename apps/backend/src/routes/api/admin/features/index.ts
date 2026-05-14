import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { setSetting } from '$lib/settings'
import { getFeatures } from '$lib/features'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => getFeatures(), {
    detail: { tags: ['Admin'], summary: 'Get feature flags', operationId: 'adminGetFeatures', security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
    response: { 200: t.Object({ submissionsEnabled: t.Boolean(), requestsEnabled: t.Boolean() }) },
  })
  .patch(
    '/',
    async ({ body, admin, request }) => {
      if (body.submissionsEnabled !== undefined) {
        await setSetting('features.submissions_enabled', body.submissionsEnabled ? 'true' : 'false')
      }
      if (body.requestsEnabled !== undefined) {
        await setSetting('features.requests_enabled', body.requestsEnabled ? 'true' : 'false')
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'features.update',
        target: 'features',
        meta: body,
      })
      return getFeatures()
    },
    {
      detail: { tags: ['Admin'], summary: 'Toggle feature flags', operationId: 'adminUpdateFeatures', security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
      body: t.Object({
        submissionsEnabled: t.Optional(t.Boolean()),
        requestsEnabled: t.Optional(t.Boolean()),
      }),
      response: { 200: t.Object({ submissionsEnabled: t.Boolean(), requestsEnabled: t.Boolean() }) },
    },
  )
