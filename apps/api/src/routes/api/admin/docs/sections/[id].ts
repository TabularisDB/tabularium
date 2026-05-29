import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { updateCustomSection, removeCustomSection, DocsCustomError } from '$lib/docs-custom'
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
  .put(
    '/',
    async ({ params, body, set, admin, request }) => {
      try {
        const updated = await updateCustomSection(params.id, body)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'docs.section_update',
          target: `docs_section:${updated.id}`,
          meta: { id: updated.id },
        })
        return { section: updated }
      } catch (err) {
        if (err instanceof DocsCustomError) {
          set.status = err.code === 'not_found' ? 404 : 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Update a custom docs section',
        operationId: 'adminUpdateDocsSection',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      body: sectionBodySchema,
      response: {
        200: t.Object({ section: t.Any() }),
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
  .delete(
    '/',
    async ({ params, set, admin, request }) => {
      try {
        await removeCustomSection(params.id)
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'docs.section_delete',
          target: `docs_section:${params.id}`,
          meta: { id: params.id },
        })
        set.status = 204
        return null
      } catch (err) {
        if (err instanceof DocsCustomError) {
          set.status = err.code === 'not_found' ? 404 : 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete a custom docs section',
        operationId: 'adminDeleteDocsSection',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      response: {
        204: t.Null(),
        404: t.Object({ error: t.String() }),
      },
    },
  )
