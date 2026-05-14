import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getSetting, setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { storage, reconfigureStorage } from '$lib/storage'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const DriverSchema = t.Union([t.Literal('off'), t.Literal('disk'), t.Literal('s3')])

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({
    driver: storage().driver,
    configuredDriver: getSetting('infra.storage.driver') ?? null,
    s3: {
      bucket: getSetting('infra.storage.s3_bucket') ?? null,
      region: getSetting('infra.storage.s3_region') ?? null,
      endpoint: getSetting('infra.storage.s3_endpoint') ?? null,
      publicBaseUrl: getSetting('infra.storage.s3_public_base_url') ?? null,
      accessKeyConfigured: hasSetting('infra.storage.s3_access_key'),
      secretKeyConfigured: hasSetting('infra.storage.s3_secret_key'),
    },
  }), {
    detail: {
      tags: ['Admin'],
      summary: 'Get storage driver state',
      operationId: 'getInfraStorage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: {
      200: t.Object({
        driver: DriverSchema,
        configuredDriver: t.Nullable(t.String()),
        s3: t.Object({
          bucket: t.Nullable(t.String()),
          region: t.Nullable(t.String()),
          endpoint: t.Nullable(t.String()),
          publicBaseUrl: t.Nullable(t.String()),
          accessKeyConfigured: t.Boolean(),
          secretKeyConfigured: t.Boolean(),
        }),
      }),
    },
  })
  .put('/', async ({ body, set, admin, request }) => {
    if (body.driver === 's3') {
      const bucket = body.s3?.bucket ?? getSetting('infra.storage.s3_bucket')
      const accessKey = body.s3?.accessKey ?? (hasSetting('infra.storage.s3_access_key') ? '__keep__' : undefined)
      const secretKey = body.s3?.secretKey ?? (hasSetting('infra.storage.s3_secret_key') ? '__keep__' : undefined)
      if (!bucket || !accessKey || !secretKey) {
        set.status = 400
        return { error: 'driver=s3 requires s3.bucket, s3.accessKey, s3.secretKey' }
      }
    }

    const s3 = body.s3
    if (s3) {
      const updates: [string, string | undefined, boolean][] = [
        ['infra.storage.s3_bucket', s3.bucket, false],
        ['infra.storage.s3_region', s3.region, false],
        ['infra.storage.s3_endpoint', s3.endpoint, false],
        ['infra.storage.s3_public_base_url', s3.publicBaseUrl, false],
        ['infra.storage.s3_access_key', s3.accessKey, true],
        ['infra.storage.s3_secret_key', s3.secretKey, true],
      ]
      for (const [key, value, encrypted] of updates) {
        if (value === undefined) continue
        if (value === '') {
          if (hasSetting(key)) await deleteSetting(key)
          continue
        }
        await setSetting(key, value, { encrypted })
      }
    }

    await setSetting('infra.storage.driver', body.driver)
    try {
      await reconfigureStorage()
    } catch (err) {
      set.status = 500
      return { error: err instanceof Error ? err.message : 'Failed to reconfigure storage' }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'infra.storage.update',
      target: 'infra:storage',
      meta: { driver: body.driver, s3FieldsChanged: body.s3 ? Object.keys(body.s3) : [] },
    })
    return { ok: true, driver: storage().driver }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update storage driver (hot-swap)',
      description:
        'Pass an empty string for any s3 field to clear it. Access / secret keys are stored encrypted. ' +
        '`disk` writes under `data/uploads/` and serves via `/uploads/`. `s3` uses `Bun.S3Client` (compatible with AWS, MinIO, R2).',
      operationId: 'updateInfraStorage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      driver: DriverSchema,
      s3: t.Optional(t.Object({
        bucket: t.Optional(t.String()),
        region: t.Optional(t.String()),
        endpoint: t.Optional(t.String()),
        publicBaseUrl: t.Optional(t.String()),
        accessKey: t.Optional(t.String()),
        secretKey: t.Optional(t.String()),
      })),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), driver: DriverSchema }),
      400: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }),
    },
  })
