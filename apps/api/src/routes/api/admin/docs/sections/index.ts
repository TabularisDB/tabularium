import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getDocsConfig, addCustomSection, DocsCustomError } from '$lib/docs-custom'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const positionSchema = t.Union([
  t.Literal('page_top'),
  t.Literal('page_bottom'),
  t.Literal('before_core'),
  t.Literal('after_core'),
  t.Literal('before_extensions'),
  t.Literal('after_extensions'),
  t.Literal('before_kinds'),
  t.Literal('after_kinds'),
  t.Literal('before_api'),
  t.Literal('after_api'),
  t.Object({
    kind: t.String({ minLength: 1, maxLength: 40 }),
    slot: t.Union([t.Literal('before'), t.Literal('after')]),
  }),
])

const translationMapSchema = t.Optional(t.Record(t.String(), t.String()))

const sectionBodySchema = t.Object({
  id: t.String({ minLength: 1, maxLength: 60 }),
  title: t.Nullable(t.String({ maxLength: 200 })),
  titleTranslations: translationMapSchema,
  body: t.String({ minLength: 1 }),
  bodyTranslations: translationMapSchema,
  position: positionSchema,
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({ sections: getDocsConfig().customSections }), {
    detail: {
      tags: ['Admin'],
      summary: 'List custom docs sections',
      operationId: 'adminListDocsSections',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ sections: t.Array(t.Any()) }) },
  })
  .post(
    '/',
    async ({ body, set, admin, request }) => {
      try {
        const created = await addCustomSection(body)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'docs.section_create',
          target: `docs_section:${created.id}`,
          meta: { id: created.id },
        })
        set.status = 201
        return { section: created }
      } catch (err) {
        if (err instanceof DocsCustomError) {
          set.status = err.code === 'duplicate' ? 409 : 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Create a custom docs section',
        operationId: 'adminCreateDocsSection',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: sectionBodySchema,
      response: {
        201: t.Object({ section: t.Any() }),
        400: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
    },
  )
