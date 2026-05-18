import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { rootCredentials } from '$db/schema'
import { hashPassword } from '$lib/password'
import { getSetting, setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const SETTING_KEY = 'auth.email_recovery_persist'

async function state(adminId: string) {
  const row = await db.query.rootCredentials.findFirst({ where: { userId: adminId } })
  return {
    persist: getSetting(SETTING_KEY) === '1',
    hasCredentials: row !== undefined,
    email: row?.email ?? null,
  }
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async ({ admin }) => state(admin.id), {
    detail: {
      tags: ['Admin'],
      summary: 'Read email-recovery state for the current admin',
      operationId: 'getAdminEmailRecovery',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({
        persist: t.Boolean(),
        hasCredentials: t.Boolean(),
        email: t.Nullable(t.String()),
      }),
    },
  })
  .put(
    '/',
    async ({ body, set, admin, request }) => {
      if (body.persist !== undefined) {
        if (body.persist) {
          await setSetting(SETTING_KEY, '1')
        } else if (hasSetting(SETTING_KEY)) {
          await deleteSetting(SETTING_KEY)
        }
      }
      const wantsCredentialUpdate = body.email !== undefined || body.password !== undefined
      if (wantsCredentialUpdate) {
        if (!body.email || !body.password) {
          set.status = 400
          return { error: 'email and password must both be provided to set credentials' }
        }
        if (body.password.length < 8) {
          set.status = 400
          return { error: 'password must be at least 8 characters' }
        }
        const passwordHash = await hashPassword(body.password)
        const email = body.email.toLowerCase()
        const existing = await db.query.rootCredentials.findFirst({ where: { userId: admin.id } })
        if (existing) {
          await db.update(rootCredentials).set({ email, passwordHash }).where(eq(rootCredentials.userId, admin.id))
        } else {
          await db.insert(rootCredentials).values({ userId: admin.id, email, passwordHash })
        }
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'admin.email_recovery.update',
        target: `user:${admin.id}`,
        meta: {
          persist: body.persist ?? null,
          rotatedCredentials: wantsCredentialUpdate,
        },
      })
      return state(admin.id)
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Update email-recovery state',
        description:
          'Toggle whether rootCredentials survives the first OAuth link, and/or rotate the bootstrap email + password for the calling admin.',
        operationId: 'updateAdminEmailRecovery',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        persist: t.Optional(t.Boolean()),
        email: t.Optional(t.String({ minLength: 1, maxLength: 254 })),
        password: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
      }),
      response: {
        200: t.Object({
          persist: t.Boolean(),
          hasCredentials: t.Boolean(),
          email: t.Nullable(t.String()),
        }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
  .delete(
    '/',
    async ({ admin, request }) => {
      await db.delete(rootCredentials).where(eq(rootCredentials.userId, admin.id))
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'admin.email_recovery.delete',
        target: `user:${admin.id}`,
        meta: {},
      })
      return state(admin.id)
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete the rootCredentials row for the current admin',
        operationId: 'deleteAdminEmailRecovery',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: t.Object({
          persist: t.Boolean(),
          hasCredentials: t.Boolean(),
          email: t.Nullable(t.String()),
        }),
      },
    },
  )
