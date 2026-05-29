import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { revokeAdminToken, AdminTokenError } from '$lib/admin-tokens'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia().use(adminMiddleware).delete(
  '/',
  async ({ params, set, admin, request }) => {
    try {
      await revokeAdminToken(admin.id, params.id)
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'admin_token.revoke',
        target: `admin_token:${params.id}`,
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof AdminTokenError) {
        set.status = err.code === 'not_found' ? 404 : err.code === 'forbidden' ? 403 : 400
        return { error: err.message }
      }
      throw err
    }
  },
  {
    detail: {
      tags: ['Admin'],
      summary: 'Revoke an admin API token',
      operationId: 'revokeAdminToken',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ ok: t.Literal(true) }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      400: t.Object({ error: t.String() }),
    },
  },
)
