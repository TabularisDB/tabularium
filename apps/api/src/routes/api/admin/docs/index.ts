import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getDocsConfig, setIntroMarkdown, setOutroMarkdown, DocsCustomError } from '$lib/docs-custom'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const translationMapSchema = t.Optional(t.Record(t.String(), t.String({ maxLength: 16000 })))

const docsConfigSchema = t.Object({
  introMarkdown: t.Nullable(t.String()),
  introMarkdownTranslations: t.Record(t.String(), t.String()),
  outroMarkdown: t.Nullable(t.String()),
  outroMarkdownTranslations: t.Record(t.String(), t.String()),
  customSections: t.Array(t.Any()),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', () => ({ config: getDocsConfig() }), {
    detail: {
      tags: ['Admin'],
      summary: 'Read docs config (intro/outro/sections)',
      operationId: 'adminGetDocsConfig',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ config: docsConfigSchema }) },
  })
  .put(
    '/',
    async ({ body, set, admin, request }) => {
      try {
        if (body.intro !== undefined) {
          await setIntroMarkdown(body.intro.body ?? null, body.intro.translations ?? {})
        }
        if (body.outro !== undefined) {
          await setOutroMarkdown(body.outro.body ?? null, body.outro.translations ?? {})
        }
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'docs.config_update',
          target: 'docs:config',
          meta: { fields: Object.keys(body) },
        })
        return { config: getDocsConfig() }
      } catch (err) {
        if (err instanceof DocsCustomError) {
          set.status = 400
          return { error: err.message }
        }
        throw err
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Update intro / outro markdown',
        operationId: 'adminUpdateDocsConfig',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        intro: t.Optional(
          t.Object({
            body: t.Nullable(t.String({ maxLength: 16000 })),
            translations: t.Optional(translationMapSchema),
          }),
        ),
        outro: t.Optional(
          t.Object({
            body: t.Nullable(t.String({ maxLength: 16000 })),
            translations: t.Optional(translationMapSchema),
          }),
        ),
      }),
      response: {
        200: t.Object({ config: docsConfigSchema }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
