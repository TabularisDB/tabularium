import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getKinds, createKind, KindError } from '$lib/kinds'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const kindBodySchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 40 }),
  label: t.String({ minLength: 1, maxLength: 60 }),
  description: t.Optional(t.Nullable(t.String({ maxLength: 280 }))),
})

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
  extensionsSchema: t.Optional(t.Nullable(t.Record(t.String(), t.Any()))),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({ kinds: getKinds() }), {
    detail: {
      tags: ['Admin'],
      summary: 'List all plugin kinds',
      operationId: 'adminListKinds',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ kinds: t.Array(kindSchema) }) },
  })
  .post('/', async ({ body, set, admin, request }) => {
    try {
      const created = await createKind({
        key: body.key,
        label: body.label,
        description: body.description ?? null,
      })
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'kind.create',
        target: `kind:${created.key}`,
        meta: { key: created.key },
      })
      set.status = 201
      set.headers['Location'] = `/api/admin/kinds/${created.key}`
      return { kind: created }
    } catch (err) {
      if (err instanceof KindError) {
        set.status = err.code === 'duplicate' ? 409 : 400
        return { error: err.message }
      }
      throw err
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Create a plugin kind',
      operationId: 'adminCreateKind',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: kindBodySchema,
    response: {
      201: t.Object({ kind: kindSchema }),
      400: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
