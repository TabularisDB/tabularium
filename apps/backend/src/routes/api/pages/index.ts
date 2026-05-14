import { Elysia, t } from 'elysia'
import { eq, asc } from 'drizzle-orm'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { renderMarkdown } from '$lib/markdown'
import { cache } from '$lib/cache'
import { normalizePath } from '$lib/page-path'

const RENDER_TTL = 600

export default new Elysia()
  .get('/', async () => {
    const rows = await db
      .select({
        slug: markdownPages.slug,
        path: markdownPages.path,
        title: markdownPages.title,
        navOrder: markdownPages.navOrder,
        showInFooter: markdownPages.showInFooter,
        updatedAt: markdownPages.updatedAt,
      })
      .from(markdownPages)
      .where(eq(markdownPages.published, 1))
      .orderBy(asc(markdownPages.navOrder))
    return {
      pages: rows.map((r) => ({
        slug: r.slug,
        path: r.path,
        title: r.title,
        navOrder: r.navOrder,
        showInFooter: r.showInFooter === 1,
        updatedAt: r.updatedAt,
      })),
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'List published markdown pages',
      operationId: 'listPages',
    },
    response: {
      200: t.Object({
        pages: t.Array(t.Object({
          slug: t.String(),
          path: t.String(),
          title: t.String(),
          navOrder: t.Nullable(t.Number()),
          showInFooter: t.Boolean(),
          updatedAt: t.Number(),
        })),
      }),
    },
  })
  .get('/by-path', async ({ query, set }) => {
    const path = normalizePath(query.path ?? '/')
    const row = await db.query.markdownPages.findFirst({
      where: { path, published: 1 },
    })
    if (!row) {
      set.status = 404
      return { error: 'No page at that path' }
    }
    const cacheKey = `page:html:${row.slug}:${row.updatedAt}`
    let html = await cache().get<string>(cacheKey)
    if (!html) {
      html = renderMarkdown(row.content)
      await cache().set(cacheKey, html, RENDER_TTL)
    }
    return {
      slug: row.slug,
      path: row.path,
      title: row.title,
      html,
      updatedAt: row.updatedAt,
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Resolve a published page by its public path',
      description:
        'Used by the SvelteKit catch-all route + the homepage to render admin-managed pages. ' +
        'Returns sanitized HTML (DOMPurify, 10-min cached). Look up `path=/` for the homepage override.',
      operationId: 'getPageByPath',
    },
    query: t.Object({ path: t.Optional(t.String()) }),
    response: {
      200: t.Object({
        slug: t.String(),
        path: t.String(),
        title: t.String(),
        html: t.String(),
        updatedAt: t.Number(),
      }),
      404: t.Object({ error: t.String() }),
    },
  })
