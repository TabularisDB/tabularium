import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { renderMarkdown } from '$lib/markdown'

export default new Elysia()
  .use(adminMiddleware)
  .post(
    '/',
    ({ body }) => ({ html: renderMarkdown(body.content, body.format ?? 'markdown') }),
    {
      detail: {
        tags: ['Admin'],
        summary: 'Render markdown/HTML to sanitized HTML (admin live preview)',
        operationId: 'previewPage',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        content: t.String({ maxLength: 200_000 }),
        format: t.Optional(t.Union([t.Literal('markdown'), t.Literal('html')])),
      }),
      response: { 200: t.Object({ html: t.String() }) },
    },
  )
