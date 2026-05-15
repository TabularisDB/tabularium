import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { pluginRequests, pluginRequestVotes, pluginRequestClaims } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'

export default new Elysia()
  .use(adminMiddleware)
  .delete('/', async ({ params, set, admin, request }) => {
    const row = await db.query.pluginRequests.findFirst({
      where: { id: params.id },
      columns: { id: true, slug: true },
    })
    if (!row) {
      set.status = 404
      return { error: 'Request not found' }
    }
    await db.delete(pluginRequestVotes).where(eq(pluginRequestVotes.requestId, params.id))
    await db.delete(pluginRequestClaims).where(eq(pluginRequestClaims.requestId, params.id))
    await db.delete(pluginRequests).where(eq(pluginRequests.id, params.id))
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'request.delete',
      target: `request:${row.slug}`,
      meta: { id: row.id, slug: row.slug },
    })
    set.status = 204
    return null
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Delete a plugin request',
      operationId: 'adminDeleteRequest',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      204: t.Null(),
      404: t.Object({ error: t.String() }),
    },
  })
