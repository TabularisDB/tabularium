import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getKind, updateKind, deleteKind, KindError } from '$lib/kinds'
import { recordAudit, actorFromAdmin } from '$lib/audit'

// Loose schema: the lib's validateKindDef enforces the locale whitelist and
// per-field length caps. The Elysia layer just admits the field shape so
// admins can submit translations.
const translationMapSchema = t.Optional(t.Record(t.String(), t.String({ maxLength: 600 })))

const publicPageCopySchema = t.Object({
  hero: t.Nullable(t.String({ maxLength: 80 })),
  heroTranslations: translationMapSchema,
  intro: t.Nullable(t.String({ maxLength: 600 })),
  introTranslations: translationMapSchema,
})

const customExampleSchema = t.Optional(
  t.Nullable(
    t.Object({
      yaml: t.Optional(t.String({ maxLength: 16000 })),
      json: t.Optional(t.String({ maxLength: 16000 })),
    }),
  ),
)

const kindSchema = t.Object({
  key: t.String(),
  label: t.String(),
  labelTranslations: translationMapSchema,
  description: t.Nullable(t.String()),
  descriptionTranslations: translationMapSchema,
  extensionsSchema: t.Optional(t.Nullable(t.Record(t.String(), t.Any()))),
  publicPageEnabled: t.Optional(t.Boolean()),
  publicPageCopy: t.Optional(t.Nullable(publicPageCopySchema)),
  prosePre: t.Optional(t.Nullable(t.String())),
  prosePreTranslations: translationMapSchema,
  prosePost: t.Optional(t.Nullable(t.String())),
  prosePostTranslations: translationMapSchema,
  customExample: customExampleSchema,
})

const putBodySchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 40 }),
  label: t.String({ minLength: 1, maxLength: 60 }),
  labelTranslations: translationMapSchema,
  description: t.Optional(t.Nullable(t.String({ maxLength: 280 }))),
  descriptionTranslations: translationMapSchema,
  extensionsSchema: t.Optional(t.Nullable(t.Record(t.String(), t.Any()))),
  publicPageEnabled: t.Optional(t.Boolean()),
  publicPageCopy: t.Optional(t.Nullable(publicPageCopySchema)),
  prosePre: t.Optional(t.Nullable(t.String({ maxLength: 8000 }))),
  prosePreTranslations: translationMapSchema,
  prosePost: t.Optional(t.Nullable(t.String({ maxLength: 8000 }))),
  prosePostTranslations: translationMapSchema,
  customExample: customExampleSchema,
})

function statusFor(err: KindError, body?: { key: string }, path?: string): number {
  if (err.code === 'duplicate') return 409
  if (err.code === 'not_found') return 404
  if (err.code === 'invalid' && body && path && body.key !== path) return 409
  return 400
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    ({ params, set }) => {
      const kind = getKind(params.key)
      if (!kind) {
        set.status = 404
        return { error: `kind "${params.key}" not found` }
      }
      return { kind }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Read one plugin kind',
        operationId: 'adminGetKind',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ key: t.String() }),
      response: {
        200: t.Object({ kind: kindSchema }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
  .put(
    '/',
    async ({ params, body, set, admin, request }) => {
      try {
        const updated = await updateKind(params.key, {
          key: body.key,
          label: body.label,
          ...(body.labelTranslations !== undefined ? { labelTranslations: body.labelTranslations } : {}),
          description: body.description ?? null,
          ...(body.descriptionTranslations !== undefined
            ? { descriptionTranslations: body.descriptionTranslations }
            : {}),
          ...(body.extensionsSchema !== undefined ? { extensionsSchema: body.extensionsSchema } : {}),
          ...(body.publicPageEnabled !== undefined ? { publicPageEnabled: body.publicPageEnabled } : {}),
          ...(body.publicPageCopy !== undefined ? { publicPageCopy: body.publicPageCopy } : {}),
          ...(body.prosePre !== undefined ? { prosePre: body.prosePre } : {}),
          ...(body.prosePreTranslations !== undefined ? { prosePreTranslations: body.prosePreTranslations } : {}),
          ...(body.prosePost !== undefined ? { prosePost: body.prosePost } : {}),
          ...(body.prosePostTranslations !== undefined ? { prosePostTranslations: body.prosePostTranslations } : {}),
          ...(body.customExample !== undefined ? { customExample: body.customExample } : {}),
        })
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'kind.update',
          target: `kind:${updated.key}`,
          meta: { key: updated.key },
        })
        return { kind: updated }
      } catch (err) {
        if (err instanceof KindError) {
          set.status = statusFor(err, body, params.key)
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Replace one plugin kind',
        operationId: 'adminUpdateKind',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ key: t.String() }),
      body: putBodySchema,
      response: {
        200: t.Object({ kind: kindSchema }),
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
    },
  )
  .delete(
    '/',
    async ({ params, set, admin, request }) => {
      try {
        await deleteKind(params.key)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'kind.delete',
          target: `kind:${params.key}`,
          meta: { key: params.key },
        })
        set.status = 204
        return null
      } catch (err) {
        if (err instanceof KindError) {
          set.status = err.code === 'not_found' ? 404 : 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete one plugin kind',
        operationId: 'adminDeleteKind',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ key: t.String() }),
      response: {
        204: t.Null(),
        404: t.Object({ error: t.String() }),
      },
    },
  )
