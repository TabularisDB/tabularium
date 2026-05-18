import { Elysia, t } from 'elysia'
import { count } from 'drizzle-orm'
import { getConfig } from '$lib/config-file'
import { db, isDBConnected } from '$db'
import { rootCredentials } from '$db/schema'
import { getServerMode } from '$lib/server-mode'

export default new Elysia().get(
  '/',
  async () => {
    const config = getConfig()
    const mode = getServerMode()
    if (!config.installed) {
      return { requiresInit: true, setupCompleted: false, emailRecoveryAvailable: false, mode }
    }
    let emailRecoveryAvailable = false
    if (isDBConnected()) {
      const rows = await db.select({ n: count() }).from(rootCredentials)
      emailRecoveryAvailable = (rows[0]?.n ?? 0) > 0
    }
    return { requiresInit: false, setupCompleted: true, emailRecoveryAvailable, mode }
  },
  {
    detail: { tags: ['Auth'], summary: 'Check whether the registry needs first-time setup', operationId: 'initStatus' },
    response: {
      200: t.Object({
        requiresInit: t.Boolean(),
        setupCompleted: t.Boolean(),
        emailRecoveryAvailable: t.Boolean(),
        mode: t.Union([t.Literal('setup'), t.Literal('normal')]),
      }),
    },
  },
)
