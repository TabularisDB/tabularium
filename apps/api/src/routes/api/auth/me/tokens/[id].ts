import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { revokePublisherToken, PublisherTokenError } from '$lib/publisher-tokens'
import { recordAudit } from '$lib/audit'
import { db } from '$db'

export default new Elysia().use(authMiddleware).delete(
  '/',
  async ({ params, set, user, request }) => {
    try {
      await revokePublisherToken(user.sub, params.id)
      const actor = await db.query.users.findFirst({ where: { id: user.sub }, columns: { displayName: true } })
      await recordAudit({
        actorId: user.sub,
        actorName: actor?.displayName ?? null,
        action: 'publisher_token.revoke',
        target: `publisher_token:${params.id}`,
        ip: request.headers.get('x-forwarded-for') ?? null,
      })
      set.status = 204
      return null
    } catch (err) {
      if (err instanceof PublisherTokenError) {
        if (err.code === 'not_found') {
          set.status = 404
          return { error: err.message }
        }
        if (err.code === 'forbidden') {
          set.status = 403
          return { error: err.message }
        }
        set.status = 400
        return { error: err.message }
      }
      throw err
    }
  },
  {
    detail: {
      tags: ['Publisher tokens'],
      summary: 'Revoke a publisher token',
      operationId: 'revokeMyPublisherToken',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
  },
)
