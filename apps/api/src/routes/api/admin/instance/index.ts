import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import {
  getManifestConfig,
  validateManifestFilename,
  validateSchemaUrl,
} from '$lib/manifest-config'

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

function manifestState() {
  const cfg = getManifestConfig()
  return {
    filename: cfg.filename,
    schemaUrl: cfg.schemaUrl,
    filenameOverridden: getSetting('manifest.filename') !== undefined,
    schemaUrlOverridden: getSetting('manifest.schema_url') !== undefined,
  }
}

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({
    requireApproval: getSetting('instance.require_approval') === '1',
    rateLimits: bucketStates(),
    manifest: manifestState(),
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
        manifest: t.Object({
          filename: t.String(),
          schemaUrl: t.String(),
          filenameOverridden: t.Boolean(),
          schemaUrlOverridden: t.Boolean(),
        }),
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
    let manifestTouched = false
    if (body.manifestFilename !== undefined) {
      if (body.manifestFilename === null || body.manifestFilename === '') {
        if (hasSetting('manifest.filename')) await deleteSetting('manifest.filename')
      } else {
        try {
          validateManifestFilename(body.manifestFilename)
        } catch (err) {
          set.status = 400
          return { error: err instanceof Error ? err.message : 'invalid manifest filename' }
        }
        await setSetting('manifest.filename', body.manifestFilename)
      }
      manifestTouched = true
    }
    if (body.manifestSchemaUrl !== undefined) {
      if (body.manifestSchemaUrl === null || body.manifestSchemaUrl === '') {
        if (hasSetting('manifest.schema_url')) await deleteSetting('manifest.schema_url')
      } else {
        try {
          validateSchemaUrl(body.manifestSchemaUrl)
        } catch (err) {
          set.status = 400
          return { error: err instanceof Error ? err.message : 'invalid manifest schema URL' }
        }
        await setSetting('manifest.schema_url', body.manifestSchemaUrl)
      }
      manifestTouched = true
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'instance.update',
      target: 'instance',
      meta: body as Record<string, unknown>,
    })
    if (manifestTouched) {
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'manifest.update',
        target: 'manifest',
        meta: {
          filename: body.manifestFilename ?? null,
          schemaUrl: body.manifestSchemaUrl ?? null,
        },
      })
    }
    return { ok: true }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update instance-wide settings',
      description:
        'Toggle approval mode, adjust per-bucket rate limits, and configure the manifest filename + schema URL. Pass `reset: true` to clear a rate-limit override; pass `null` or an empty string for the manifest fields to revert to defaults.',
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
      manifestFilename: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
      manifestSchemaUrl: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
    }),
    response: {
      200: t.Object({ ok: t.Boolean() }),
      400: t.Object({ error: t.String() }),
    },
  })
