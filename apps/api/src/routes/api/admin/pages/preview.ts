import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { renderMarkdown } from '$lib/markdown'

export default new Elysia().use(adminMiddleware).post('/', ({ body }) => ({ html: renderMarkdown(body.content) }), {
  detail: {
    tags: ['Admin'],
    summary: 'Render markdown to sanitized HTML (admin live preview)',
    operationId: 'previewPage',
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  },
  body: t.Object({
    content: t.String({ maxLength: 200_000 }),
  }),
  response: { 200: t.Object({ html: t.String() }) },
})
