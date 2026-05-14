import { Elysia, t } from 'elysia'
import { desc } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { users } from '$db/schema'

const userSchema = t.Object({
  id: t.String(),
  displayName: t.String(),
  email: t.Nullable(t.String()),
  role: t.Union([t.Literal('user'), t.Literal('admin')]),
  createdAt: t.Number(),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async ({ query }) => {
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200)
    const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit)
    return {
      users: rows.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      })),
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'List users (most recent first)',
      operationId: 'listUsers',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    query: t.Object({ limit: t.Optional(t.String()) }),
    response: { 200: t.Object({ users: t.Array(userSchema) }) },
  })
