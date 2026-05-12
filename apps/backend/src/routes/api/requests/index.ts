import { Elysia, t } from 'elysia'
import { authMiddleware } from '../../../middleware/auth'
import { db } from '../../../db'
import { pluginRequests } from '../../../db/schema'
import { desc, count, eq } from 'drizzle-orm'

export default new Elysia()
  .get('/', async ({ query }) => {
    const page = Number(query.page ?? 1)
    const limit = Math.min(Number(query.limit ?? 20), 100)
    const offset = (page - 1) * limit
    const sort = query.sort === 'recent' ? pluginRequests.createdAt : pluginRequests.upvotes

    const [{ total }] = await db.select({ total: count() }).from(pluginRequests)

    const rows = await db
      .select()
      .from(pluginRequests)
      .orderBy(desc(sort))
      .limit(limit)
      .offset(offset)

    return { total, page, limit, requests: rows }
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      sort: t.Optional(t.Union([t.Literal('upvotes'), t.Literal('recent')])),
    }),
  })
  .use(authMiddleware)
  .post('/', async ({ user, body, set }) => {
    const existing = await db.query.pluginRequests.findFirst({
      where: eq(pluginRequests.slug, body.slug),
    })
    if (existing) {
      set.status = 409
      return { error: `A request for '${body.slug}' already exists` }
    }

    const request = {
      id: crypto.randomUUID(),
      slug: body.slug,
      name: body.name,
      description: body.description,
      requesterId: user.sub,
    }
    await db.insert(pluginRequests).values(request)
    return request
  }, {
    body: t.Object({
      slug: t.String({ pattern: '^[a-z0-9-]+$' }),
      name: t.String(),
      description: t.String(),
    }),
  })
