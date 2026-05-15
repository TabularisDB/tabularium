import { Elysia, t } from 'elysia'
import { eq, count } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { users, rootCredentials } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'

async function readUser(id: string) {
  const row = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
      email: rootCredentials.email,
    })
    .from(users)
    .leftJoin(rootCredentials, eq(rootCredentials.userId, users.id))
    .where(eq(users.id, id))
    .limit(1)
  return row[0] ?? null
}

const userSchema = t.Object({
  id: t.String(),
  displayName: t.String(),
  email: t.Nullable(t.String()),
  role: t.Union([t.Literal('user'), t.Literal('admin')]),
  createdAt: t.Number(),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async ({ params, set }) => {
    const row = await readUser(params.id)
    if (!row) {
      set.status = 404
      return { error: 'User not found' }
    }
    return {
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Get a single user',
      operationId: 'getUser',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    response: {
      200: userSchema,
      404: t.Object({ error: t.String() }),
    },
  })
  .patch('/', async ({ admin, params, body, set, request }) => {
    const target = await db.query.users.findFirst({ where: { id: params.id } })
    if (!target) {
      set.status = 404
      return { error: 'User not found' }
    }

    if (body.role && body.role === 'user' && target.role === 'admin') {
      if (target.id === admin.id) {
        set.status = 409
        return { error: 'Cannot demote yourself' }
      }
      const [{ adminCount }] = await db
        .select({ adminCount: count() })
        .from(users)
        .where(eq(users.role, 'admin'))
      if (adminCount <= 1) {
        set.status = 409
        return { error: 'Cannot demote the last admin' }
      }
    }

    const patch: Record<string, unknown> = {}
    if (body.role !== undefined) patch.role = body.role
    if (body.displayName !== undefined) patch.displayName = body.displayName

    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, params.id))
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'user.update',
        target: `user:${params.id}`,
        meta: { fields: Object.keys(patch), previousRole: target.role, newRole: body.role ?? target.role },
      })
    }

    const updated = await readUser(params.id)
    return {
      id: updated!.id,
      displayName: updated!.displayName,
      email: updated!.email,
      role: updated!.role,
      createdAt: updated!.createdAt,
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update a user (role or displayName)',
      operationId: 'patchUser',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      role: t.Optional(t.Union([t.Literal('user'), t.Literal('admin')])),
      displayName: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
    }),
    response: {
      200: userSchema,
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
