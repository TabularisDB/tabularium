import { Elysia } from 'elysia'
import { authMiddleware } from '../../../../middleware/auth'
import { db } from '../../../../db'
import { pluginRequests, pluginRequestVotes } from '../../../../db/schema'
import { eq, and, sql } from 'drizzle-orm'

export default new Elysia()
  .use(authMiddleware)
  .post('/', async ({ user, params, set }) => {
    const request = await db.query.pluginRequests.findFirst({
      where: eq(pluginRequests.id, params.id),
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

    if (existing.length > 0) {
      await db.delete(pluginRequestVotes).where(
        and(
          eq(pluginRequestVotes.requestId, params.id),
          eq(pluginRequestVotes.userId, user.sub),
        ),
      )
      await db
        .update(pluginRequests)
        .set({ upvotes: sql`${pluginRequests.upvotes} - 1` })
        .where(eq(pluginRequests.id, params.id))

      const updated = await db.query.pluginRequests.findFirst({
        where: eq(pluginRequests.id, params.id),
      })
      return { upvotes: updated!.upvotes, voted: false }
    } else {
      await db.insert(pluginRequestVotes).values({
        requestId: params.id,
        userId: user.sub,
      })
      await db
        .update(pluginRequests)
        .set({ upvotes: sql`${pluginRequests.upvotes} + 1` })
        .where(eq(pluginRequests.id, params.id))

      const updated = await db.query.pluginRequests.findFirst({
        where: eq(pluginRequests.id, params.id),
      })
      return { upvotes: updated!.upvotes, voted: true }
    }
  }, {
    detail: { tags: ['Requests'] },
  })
