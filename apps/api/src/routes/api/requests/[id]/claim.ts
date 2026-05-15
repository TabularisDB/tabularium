import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { claimRequest, unclaimRequest, claimCount, hasClaimedRequest } from '$lib/claims'

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'claim', limit: 30, windowSeconds: 60 }))
  .post('/', async ({ params, user, set }) => {
    const request = await db.query.pluginRequests.findFirst({
      where: { id: params.id },
      columns: { id: true },
    })
    if (!request) {
      set.status = 404
      return { error: 'Request not found' }
    }
    const had = await hasClaimedRequest(params.id, user.sub)
    if (had) {
      await unclaimRequest(params.id, user.sub)
    } else {
      await claimRequest(params.id, user.sub)
    }
    return { claimed: !had, claims: await claimCount(params.id) }
  }, {
    detail: {
      tags: ['Requests'],
      summary: 'Toggle a claim on a plugin request',
      description:
        'Adds or removes the current user\'s claim on the request. Claims are non-exclusive — multiple users can claim the same request. They do not block plugin submission.',
      operationId: 'toggleRequestClaim',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ claimed: t.Boolean(), claims: t.Number() }),
      404: t.Object({ error: t.String() }),
    },
  })
