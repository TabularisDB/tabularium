import { Elysia, t } from 'elysia'
import { db } from '$db'
import { renderMarkdown } from '$lib/markdown'
import { cache } from '$lib/cache'

const RENDER_TTL = 600

export default new Elysia()
  .get('/', async ({ params, set }) => {
    const row = await db.query.markdownPages.findFirst({
      where: { slug: params.slug, published: 1 },
    })
    if (!row) {
      set.status = 404
      return { error: 'Page not found' }
    }
    const cacheKey = `page:html:${row.slug}:${row.updatedAt}`
    let html = await cache().get<string>(cacheKey)
    if (!html) {
      html = renderMarkdown(row.content)
      await cache().set(cacheKey, html, RENDER_TTL)
    }
    return {
      slug: row.slug,
      title: row.title,
      html,
      updatedAt: row.updatedAt,
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Render a published markdown page',
      description: 'Returns the sanitized HTML of an admin-managed markdown page (`/pages/:slug`). Renderer is GFM + DOMPurify, cached 10 min.',
      operationId: 'getPage',
    },
    params: t.Object({ slug: t.String() }),
    response: {
      200: t.Object({ slug: t.String(), title: t.String(), html: t.String(), updatedAt: t.Number() }),
      404: t.Object({ error: t.String() }),
    },
  })
