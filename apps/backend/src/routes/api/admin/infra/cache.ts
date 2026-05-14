import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { cache, reconfigureCache } from '$lib/cache'
import { env } from '$lib/env'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const DriverSchema = t.Union([t.Literal('off'), t.Literal('memory'), t.Literal('redis')])

function maskUrl(url: string | undefined | null): string | null {
  if (!url) return null
  return url.replace(/:[^:@/]+@/, ':***@')
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => {
    const current = cache().driver
    const setting = getSetting('infra.cache.driver') ?? null
    const redisFromSetting = getSetting('infra.cache.redis_url') ?? null
    return {
      driver: current,
      configuredDriver: setting,
      defaultDriver: env.CACHE_DRIVER,
      redisUrlConfigured: Boolean(redisFromSetting),
      redisUrlMasked: maskUrl(redisFromSetting ?? env.REDIS_URL ?? null),
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Get current cache driver state',
      operationId: 'getInfraCache',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({
        driver: DriverSchema,
        configuredDriver: t.Nullable(t.String()),
        defaultDriver: DriverSchema,
        redisUrlConfigured: t.Boolean(),
        redisUrlMasked: t.Nullable(t.String()),
      }),
    },
  })
  .put('/', async ({ body, set, admin, request }) => {
    if (body.driver === 'redis' && !body.redisUrl && !getSetting('infra.cache.redis_url') && !env.REDIS_URL) {
      set.status = 400
      return { error: 'driver=redis requires redisUrl' }
    }
    if (body.redisUrl !== undefined) {
      if (body.redisUrl === '') {
        if (hasSetting('infra.cache.redis_url')) await deleteSetting('infra.cache.redis_url')
      }
      if (body.redisUrl !== '') {
        if (!/^rediss?:\/\/.+/.test(body.redisUrl)) {
          set.status = 400
          return { error: 'redisUrl must start with redis:// or rediss://' }
        }
        await setSetting('infra.cache.redis_url', body.redisUrl, { encrypted: true })
      }
    }
    await setSetting('infra.cache.driver', body.driver)
    try {
      await reconfigureCache()
    } catch (err) {
      set.status = 500
      return { error: err instanceof Error ? err.message : 'Failed to reconfigure cache' }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'infra.cache.update',
      target: 'infra:cache',
      meta: { driver: body.driver, redisUrlChanged: body.redisUrl !== undefined },
    })
    return { ok: true, driver: cache().driver }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update cache driver (hot-swap, no restart)',
      description:
        'Persists the driver choice (and optional redisUrl) and immediately reconfigures the running cache. ' +
        'redisUrl is stored encrypted. Pass empty string to clear the override.',
      operationId: 'updateInfraCache',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      driver: DriverSchema,
      redisUrl: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), driver: DriverSchema }),
      400: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
  })
