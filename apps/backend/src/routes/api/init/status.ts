import { Elysia, t } from 'elysia'
import { count, eq } from 'drizzle-orm'
import { db } from '$db'
import { users, rootCredentials } from '$db/schema'
import { listEnabledInstances } from '$lib/provider-instance'
import { getSetting } from '$lib/settings'

export default new Elysia()
  .get('/', async () => {
    const [{ adminCount }] = await db
      .select({ adminCount: count() })
      .from(users)
      .where(eq(users.role, 'admin'))

    const [{ recoveryCount }] = await db.select({ recoveryCount: count() }).from(rootCredentials)
    const setupCompletedAt = getSetting('setup.completed_at')

    return {
      requiresInit: adminCount === 0,
      hasAdmin: adminCount > 0,
      enabledProviders: listEnabledInstances().length,
      emailRecoveryAvailable: recoveryCount > 0,
      setupCompleted: Boolean(setupCompletedAt),
    }
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Check whether the registry needs first-time setup',
      operationId: 'initStatus',
    },
    response: {
      200: t.Object({
        requiresInit: t.Boolean(),
        hasAdmin: t.Boolean(),
        enabledProviders: t.Number(),
        emailRecoveryAvailable: t.Boolean(),
        setupCompleted: t.Boolean(),
      }),
    },
  })
