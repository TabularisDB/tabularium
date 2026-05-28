import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getKinds, createKind, KindError } from '$lib/kinds'
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

const kindBodySchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 40 }),
  label: t.String({ minLength: 1, maxLength: 60 }),
  labelTranslations: translationMapSchema,
  description: t.Optional(t.Nullable(t.String({ maxLength: 280 }))),
  descriptionTranslations: translationMapSchema,
  publicPageEnabled: t.Optional(t.Boolean()),
  publicPageCopy: t.Optional(t.Nullable(publicPageCopySchema)),
  prosePre: t.Optional(t.Nullable(t.String({ maxLength: 8000 }))),
  prosePreTranslations: translationMapSchema,
  prosePost: t.Optional(t.Nullable(t.String({ maxLength: 8000 }))),
  prosePostTranslations: translationMapSchema,
  customExample: customExampleSchema,
})

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
  .post(
    '/',
    async ({ body, set, admin, request }) => {
      try {
        const created = await createKind({
          key: body.key,
          label: body.label,
          ...(body.labelTranslations !== undefined ? { labelTranslations: body.labelTranslations } : {}),
          description: body.description ?? null,
          ...(body.descriptionTranslations !== undefined
            ? { descriptionTranslations: body.descriptionTranslations }
            : {}),
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
    },
    {
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
    },
  )
