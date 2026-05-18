import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { getExtensionsDelta, setExtensionsDelta, buildMergedSchema, type ExtensionsDelta } from '$lib/manifest-schema'

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    () => ({
      extensions: getExtensionsDelta() as Record<string, unknown>,
      mergedSchema: buildMergedSchema(),
    }),
    {
      detail: {
        tags: ['Admin'],
        summary: 'Read the current manifest extensions delta + merged schema',
        operationId: 'getManifestExtensions',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: t.Object({
          extensions: t.Record(t.String(), t.Any()),
          mergedSchema: t.Any(),
        }),
      },
    },
  )
  .put(
    '/',
    async ({ body, set, admin, request }) => {
      try {
        await setExtensionsDelta((body.extensions ?? null) as ExtensionsDelta | null)
      } catch (err) {
        set.status = 400
        return { error: err instanceof Error ? err.message : 'invalid extensions schema' }
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'manifest.extensions.update',
        target: 'manifest',
        meta: { keys: Object.keys(body.extensions ?? {}) },
      })
      return { ok: true }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Replace the manifest extensions delta',
        description:
          'The delta is a flat record of `{ propertyName: JSONSchemaNode }`. The registry wraps it into an object schema and merges it with the locked core. Pass `null` or `{}` to clear.',
        operationId: 'updateManifestExtensions',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        extensions: t.Nullable(t.Record(t.String(), t.Any())),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
