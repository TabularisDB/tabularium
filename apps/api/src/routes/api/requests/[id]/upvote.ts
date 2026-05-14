import { Elysia } from 'elysia'
import { authMiddleware } from '../../../../middleware/auth'
import { rateLimit } from '../../../../middleware/rate-limit'
import { db } from '../../../../db'
import { pluginRequests, pluginRequestVotes } from '../../../../db/schema'
import { eq, and, sql } from 'drizzle-orm'

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'upvote', limit: 30, windowSeconds: 60 }))
  .post('/', async ({ user, params, set }) => {
    const request = await db.query.pluginRequests.findFirst({
      where: { id: params.id },
    })
    if (!request) {
      set.status = 404
      return { error: 'Request not found' }
    }

    const existing = await db
      .select()
      .from(pluginRequestVotes)
      .where(
        and(
          eq(pluginRequestVotes.requestId, params.id),
          eq(pluginRequestVotes.userId, user.sub),
        ),
      )
      .limit(1)

    const hadVote = existing.length > 0

    if (hadVote) {
      await db.delete(pluginRequestVotes).where(
        and(
          eq(pluginRequestVotes.requestId, params.id),
          eq(pluginRequestVotes.userId, user.sub),
        ),
      )
      await db
        .update(pluginRequests)
        .set({ upvotes: sql`max(0, ${pluginRequests.upvotes} - 1)` })
        .where(eq(pluginRequests.id, params.id))
    }

    if (!hadVote) {
      await db.insert(pluginRequestVotes).values({
        requestId: params.id,
        userId: user.sub,
      })
      await db
        .update(pluginRequests)
        .set({ upvotes: sql`${pluginRequests.upvotes} + 1` })
        .where(eq(pluginRequests.id, params.id))
    }

    const updated = await db.query.pluginRequests.findFirst({
      where: { id: params.id },
    })
    return { upvotes: updated!.upvotes, voted: !hadVote }
  }, {
    detail: {
      tags: ['Requests'],
      summary: 'Toggle upvote on a request',
      description:
        'Toggles the current user\'s vote on the request: if not yet voted, adds a vote; if already voted, removes it. ' +
        'Returns the new total and the user\'s new vote state. Requires auth.',
      operationId: 'toggleUpvote',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  })
