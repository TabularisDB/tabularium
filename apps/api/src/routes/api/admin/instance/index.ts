import { Elysia, t } from 'elysia'
import { count, eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { users } from '$db/schema'
import { getSetting, setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { getAssetSizeCap } from '$lib/asset'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { getManifestConfig, validateAllowedFiles, validateSchemaUrl, MANIFEST_DEFAULTS } from '$lib/manifest-config'
import { getKinds } from '$lib/kinds'

const ASSET_SIZE_CAP_MAX_BYTES = 16 * 1024 * 1024 * 1024

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

// Both email buckets gate routes that close themselves once bootstrap is
// done or recovery credentials are removed. Hiding the unreachable ones
// keeps OAuth-only instances from showing tunables that do nothing.
async function bucketStates(): Promise<BucketState[]> {
  const [{ adminCount }] = await db.select({ adminCount: count() }).from(users).where(eq(users.role, 'admin'))
  const hasRootCreds = (await db.query.rootCredentials.findFirst()) !== undefined

  return BUCKETS.filter((b) => {
    if (b.id === 'auth-email-register') return adminCount === 0
    if (b.id === 'auth-email-login') return hasRootCreds
    return true
  }).map((b) => {
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
  const kinds = getKinds()
  return {
    allowedFiles: cfg.files,
    defaultFiles: [...MANIFEST_DEFAULTS.files],
    schemaUrl: cfg.schemaUrl,
    filesOverridden: getSetting('manifest.allowed_files') !== undefined,
    schemaUrlOverridden: getSetting('manifest.schema_url') !== undefined,
    requireKind: getSetting('manifest.require_kind') === '1',
    requireKindAvailable: kinds.length > 0,
    configuredKindKeys: kinds.map((k) => k.key),
  }
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async () => ({
      requireApproval: getSetting('instance.require_approval') === '1',
      rateLimits: await bucketStates(),
      manifest: manifestState(),
      assetSizeCapBytes: getAssetSizeCap(),
    }),
    {
      detail: {
        tags: ['Admin'],
        summary: 'Get instance-wide settings',
        operationId: 'getInstanceSettings',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: t.Object({
          requireApproval: t.Boolean(),
          rateLimits: t.Array(
            t.Object({
              id: t.String(),
              limit: t.Number(),
              windowSeconds: t.Number(),
              defaultLimit: t.Number(),
              defaultWindowSeconds: t.Number(),
            }),
          ),
          manifest: t.Object({
            allowedFiles: t.Array(t.String()),
            defaultFiles: t.Array(t.String()),
            schemaUrl: t.String(),
            filesOverridden: t.Boolean(),
            schemaUrlOverridden: t.Boolean(),
            requireKind: t.Boolean(),
            requireKindAvailable: t.Boolean(),
            configuredKindKeys: t.Array(t.String()),
          }),
          assetSizeCapBytes: t.Number(),
        }),
      },
    },
  )
  .put(
    '/',
    async ({ body, set, admin, request }) => {
      if (body.requireApproval !== undefined) {
        await setSetting('instance.require_approval', body.requireApproval ? '1' : '0')
      }
      if (body.rateLimits) {
        const valid: Set<string> = new Set(BUCKETS.map((b) => b.id))
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
      if (body.assetSizeCapBytes !== undefined) {
        const cap = body.assetSizeCapBytes
        if (!Number.isInteger(cap) || cap <= 0 || cap > ASSET_SIZE_CAP_MAX_BYTES) {
          set.status = 400
          return { error: 'assetSizeCapBytes must be a positive integer ≤ 16 GiB' }
        }
        await setSetting('registry.asset_size_cap_bytes', String(cap))
      }
      let manifestTouched = false
      if (body.manifestAllowedFiles !== undefined) {
        if (body.manifestAllowedFiles === null) {
          if (hasSetting('manifest.allowed_files')) await deleteSetting('manifest.allowed_files')
        } else {
          try {
            const cleaned = validateAllowedFiles(body.manifestAllowedFiles)
            await setSetting('manifest.allowed_files', JSON.stringify(cleaned))
          } catch (err) {
            set.status = 400
            return { error: err instanceof Error ? err.message : 'invalid manifest allowed_files' }
          }
        }
        manifestTouched = true
      }
      if (body.manifestRequireKind !== undefined) {
        if (body.manifestRequireKind && getKinds().length === 0) {
          set.status = 400
          return { error: 'configure at least one kind before enabling kind enforcement' }
        }
        await setSetting('manifest.require_kind', body.manifestRequireKind ? '1' : '0')
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
            allowedFiles: body.manifestAllowedFiles ?? null,
            schemaUrl: body.manifestSchemaUrl ?? null,
          },
        })
      }
      return { ok: true }
    },
    {
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
        rateLimits: t.Optional(
          t.Array(
            t.Object({
              id: t.String(),
              limit: t.Number(),
              windowSeconds: t.Number(),
              reset: t.Optional(t.Boolean()),
            }),
          ),
        ),
        manifestAllowedFiles: t.Optional(t.Nullable(t.Array(t.String({ maxLength: 60 }), { maxItems: 12 }))),
        manifestSchemaUrl: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
        manifestRequireKind: t.Optional(t.Boolean()),
        assetSizeCapBytes: t.Optional(t.Number()),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
