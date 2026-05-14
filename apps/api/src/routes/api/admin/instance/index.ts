import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const BUCKETS = [
  { id: 'submit', defaultLimit: 10, defaultWindow: 3600 },
  { id: 'requests-create', defaultLimit: 5, defaultWindow: 3600 },
  { id: 'upvote', defaultLimit: 30, defaultWindow: 60 },
  { id: 'auth-email-login', defaultLimit: 5, defaultWindow: 900 },
  { id: 'auth-email-register', defaultLimit: 3, defaultWindow: 3600 },
] as const

type BucketState = {
  id: string
  limit: number
  windowSeconds: number
  defaultLimit: number
  defaultWindowSeconds: number
}

function bucketStates(): BucketState[] {
  return BUCKETS.map((b) => {
    const limit = Number(getSetting(`ratelimit.${b.id}.limit`) ?? b.defaultLimit)
    const window = Number(getSetting(`ratelimit.${b.id}.window`) ?? b.defaultWindow)
    return {
      id: b.id,
      limit: Number.isFinite(limit) && limit > 0 ? limit : b.defaultLimit,
      windowSeconds: Number.isFinite(window) && window > 0 ? window : b.defaultWindow,
      defaultLimit: b.defaultLimit,
      defaultWindowSeconds: b.defaultWindow,
    }
  })
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({
    requireApproval: getSetting('instance.require_approval') === '1',
    rateLimits: bucketStates(),
  }), {
    detail: {
      tags: ['Admin'],
      summary: 'Get instance-wide settings',
      operationId: 'getInstanceSettings',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({
        requireApproval: t.Boolean(),
        rateLimits: t.Array(t.Object({
          id: t.String(),
          limit: t.Number(),
          windowSeconds: t.Number(),
          defaultLimit: t.Number(),
          defaultWindowSeconds: t.Number(),
        })),
      }),
    },
  })
  .put('/', async ({ body, set, admin, request }) => {
    if (body.requireApproval !== undefined) {
      await setSetting('instance.require_approval', body.requireApproval ? '1' : '0')
    }
    if (body.rateLimits) {
      const valid = new Set(BUCKETS.map((b) => b.id))
      for (const r of body.rateLimits) {
        if (!valid.has(r.id)) {
          set.status = 400
          return { error: `Unknown bucket '${r.id}'` }
        }
        if (r.limit <= 0 || r.windowSeconds <= 0) {
          set.status = 400
          return { error: `Bucket '${r.id}': limit and windowSeconds must be > 0` }
        }
        if (r.reset) {
          if (hasSetting(`ratelimit.${r.id}.limit`)) await deleteSetting(`ratelimit.${r.id}.limit`)
          if (hasSetting(`ratelimit.${r.id}.window`)) await deleteSetting(`ratelimit.${r.id}.window`)
          continue
        }
        await setSetting(`ratelimit.${r.id}.limit`, String(r.limit))
        await setSetting(`ratelimit.${r.id}.window`, String(r.windowSeconds))
      }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'instance.update',
      target: 'instance',
      meta: body as Record<string, unknown>,
    })
    return { ok: true }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update instance-wide settings',
      description:
        'Toggle approval mode and adjust per-bucket rate limits. Pass `reset: true` to clear an override back to the compiled default.',
      operationId: 'updateInstanceSettings',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      requireApproval: t.Optional(t.Boolean()),
      rateLimits: t.Optional(t.Array(t.Object({
        id: t.String(),
        limit: t.Number(),
        windowSeconds: t.Number(),
        reset: t.Optional(t.Boolean()),
      }))),
    }),
    response: {
      200: t.Object({ ok: t.Boolean() }),
      400: t.Object({ error: t.String() }),
    },
  })
