import { Elysia, t } from 'elysia'
import { eq, count } from 'drizzle-orm'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import { users, identities, plugins, rootCredentials } from '$db/schema'
import { getInstance } from '$lib/provider-instance'
import { isProd } from '$lib/env'

const identitySchema = t.Object({
  id: t.String(),
  providerInstanceId: t.String(),
  providerKind: t.String(),
  providerDisplayName: t.String(),
  username: t.String(),
})

const meSchema = t.Object({
  id: t.String(),
  username: t.String(),
  displayName: t.String(),
  role: t.Union([t.Literal('user'), t.Literal('admin')]),
  identities: t.Array(identitySchema),
})

export default new Elysia()
  .use(authMiddleware)
  .get('/', async ({ user, set }) => {
    const userRow = await db.query.users.findFirst({ where: { id: user.sub } })
    if (!userRow) {
      set.status = 401
      return { error: 'User not found' } as never
    }

    const userIdentities = await db.query.identities.findMany({ where: { userId: user.sub } })

    return {
      id: user.sub,
      username: user.username,
      displayName: userRow.displayName,
      role: userRow.role,
      identities: userIdentities.map((i) => {
        const inst = getInstance(i.providerInstanceId)
        return {
          id: i.id,
          providerInstanceId: i.providerInstanceId,
          providerKind: inst?.kind ?? 'github',
          providerDisplayName: inst?.displayName ?? i.providerInstanceId,
          username: i.username,
        }
      }),
    }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Get current user with linked identities',
      operationId: 'getMe',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: meSchema },
  })
  .delete('/', async ({ user, set, cookie }) => {
    const [{ owned }] = await db.select({ owned: count() }).from(plugins).where(eq(plugins.ownerId, user.sub))
    if (owned > 0) {
      set.status = 409
      return { error: `Cannot delete account — you still own ${owned} plugin(s). Transfer or delete them first.` }
    }
    await db.delete(rootCredentials).where(eq(rootCredentials.userId, user.sub))
    await db.delete(identities).where(eq(identities.userId, user.sub))
    await db.delete(users).where(eq(users.id, user.sub))
    cookie.auth.set({ value: '', httpOnly: true, secure: isProd(), maxAge: 0, sameSite: 'lax', path: '/' })
    return { ok: true }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Delete your account',
      description:
        'Cascade-deletes identities + root credentials and clears the session cookie. ' +
        'Refuses with 409 if you still own plugins — transfer or delete them first.',
      operationId: 'deleteMe',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({ ok: t.Boolean() }),
      409: t.Object({ error: t.String() }),
    },
  })
  .delete('/identities/:id', async ({ user, params, set }) => {
    const target = await db.query.identities.findFirst({ where: { id: params.id } })
    if (!target || target.userId !== user.sub) {
      set.status = 404
      return { error: 'Identity not found' }
    }

    const all = await db.query.identities.findMany({ where: { userId: user.sub } })
    if (all.length <= 1) {
      set.status = 409
      return { error: 'Cannot unlink your only identity — link another first' }
    }

    await db.delete(identities).where(eq(identities.id, params.id))
    return { ok: true }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Unlink an identity',
      operationId: 'unlinkIdentity',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ id: t.String() }),
  })
