import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { pluginRequests, pluginRequestVotes } from '$db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'requests-upvote' })

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'upvote', limit: 30, windowSeconds: 60 }))
  .post(
    '/',
    async ({ user, params, set }) => {
      const request = await db.query.pluginRequests.findFirst({
        where: { id: params.id },
      })
      if (!request) {
        set.status = 404
        return { error: 'Request not found' }
      }

      try {
        return await toggleVote(user.sub, params.id)
      } catch (err) {
        log.error({ err: String(err), requestId: params.id, userId: user.sub }, 'upvote toggle failed')
        set.status = 500
        return { error: 'Upvote failed — please try again.' }
      }
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'Toggle upvote on a request',
        description:
          "Toggles the current user's vote on the request: if not yet voted, adds a vote; if already voted, removes it. " +
          "Returns the new total and the user's new vote state. Requires auth.",
        operationId: 'toggleUpvote',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
    },
  )

async function toggleVote(userId: string, requestId: string): Promise<{ upvotes: number; voted: boolean }> {
  const existing = await db
    .select()
    .from(pluginRequestVotes)
    .where(and(eq(pluginRequestVotes.requestId, requestId), eq(pluginRequestVotes.userId, userId)))
    .limit(1)

  const hadVote = existing.length > 0

  if (hadVote) {
    await db
      .delete(pluginRequestVotes)
      .where(and(eq(pluginRequestVotes.requestId, requestId), eq(pluginRequestVotes.userId, userId)))
    // Cross-dialect clamp at zero: sqlite has scalar `max()`, Postgres
    // and MySQL only have `GREATEST`. `CASE WHEN` is portable.
    await db
      .update(pluginRequests)
      .set({
        upvotes: sql`CASE WHEN ${pluginRequests.upvotes} > 0 THEN ${pluginRequests.upvotes} - 1 ELSE 0 END`,
      })
      .where(eq(pluginRequests.id, requestId))
  } else {
    await db.insert(pluginRequestVotes).values({ requestId, userId })
    await db
      .update(pluginRequests)
      .set({ upvotes: sql`${pluginRequests.upvotes} + 1` })
      .where(eq(pluginRequests.id, requestId))
  }

  const updated = await db.query.pluginRequests.findFirst({ where: { id: requestId } })
  return { upvotes: updated?.upvotes ?? 0, voted: !hadVote }
}
