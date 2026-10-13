import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { claimRequest, unclaimRequest, hasClaimedRequest } from '$lib/claims'
import { claimerSchema, loadClaimers } from '$lib/request-view'
import { emitEvent } from '$lib/webhooks/events'

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'claim', limit: 30, windowSeconds: 60 }))
  .post(
    '/',
    async ({ params, user, set }) => {
      const request = await db.query.pluginRequests.findFirst({ where: { id: params.id } })
      if (!request) {
        set.status = 404
        return { error: 'Request not found' }
      }
      const had = await hasClaimedRequest(params.id, user.sub)
      // Releasing stays possible whatever the status; new claims only make
      // sense on an open bounty.
      if (!had && request.status !== 'approved') {
        set.status = 409
        return {
          error:
            request.status === 'fulfilled'
              ? 'This request has already shipped.'
              : 'Only approved requests can be claimed.',
        }
      }
      if (had) {
        await unclaimRequest(params.id, user.sub)
      } else {
        await claimRequest(params.id, user.sub)
      }
      const claimers = (await loadClaimers([params.id])).get(params.id) ?? []
      await emitEvent(had ? 'request.unclaimed' : 'request.claimed', {
        actor: { id: user.sub, name: user.username ?? null },
        request: { ...request, claims: claimers.length },
      })
      return { claimed: !had, claims: claimers.length, claimers }
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'Toggle a claim on a plugin request',
        description:
          "Adds or removes the current user's claim on the request. Claims are non-exclusive — multiple users can claim the same request, and a claimed request shows as in progress until a plugin with its slug is approved. Only `approved` requests can be claimed; a claim can always be released.",
        operationId: 'toggleRequestClaim',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ claimed: t.Boolean(), claims: t.Number(), claimers: t.Array(claimerSchema) }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
    },
  )
