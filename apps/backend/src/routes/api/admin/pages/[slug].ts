import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { validatePath } from '$lib/page-path'

const pageSchema = t.Object({
  slug: t.String(),
  path: t.String(),
  title: t.String(),
  content: t.String(),
  published: t.Boolean(),
  navOrder: t.Nullable(t.Number()),
  showInFooter: t.Boolean(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async ({ params, set }) => {
    const row = await db.query.markdownPages.findFirst({ where: { slug: params.slug } })
    if (!row) {
      set.status = 404
      return { error: 'Page not found' }
    }
    return {
      slug: row.slug,
      path: row.path,
      title: row.title,
      content: row.content,
      published: row.published === 1,
      navOrder: row.navOrder,
      showInFooter: row.showInFooter === 1,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Get a markdown page (raw)',
      operationId: 'adminGetPage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ slug: t.String() }),
    response: {
      200: pageSchema,
      404: t.Object({ error: t.String() }),
    },
  })
  .patch('/', async ({ params, body, set, admin, request }) => {
    const existing = await db.query.markdownPages.findFirst({ where: { slug: params.slug } })
    if (!existing) {
      set.status = 404
      return { error: 'Page not found' }
    }
    const patch: Partial<typeof markdownPages.$inferInsert> = { updatedAt: Date.now() }
    if (body.title !== undefined) patch.title = body.title
    if (body.content !== undefined) patch.content = body.content
    if (body.published !== undefined) patch.published = body.published ? 1 : 0
    if (body.navOrder !== undefined) patch.navOrder = body.navOrder
    if (body.showInFooter !== undefined) patch.showInFooter = body.showInFooter ? 1 : 0
    if (body.path !== undefined) {
      const check = validatePath(body.path)
      if (!check.ok) {
        set.status = 400
        return { error: check.error }
      }
      patch.path = check.path
    }
    try {
      await db.update(markdownPages).set(patch).where(eq(markdownPages.slug, params.slug))
    } catch {
      set.status = 409
      return { error: 'Another page already uses that path' }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'page.update',
      target: `page:${params.slug}`,
      meta: { fields: Object.keys(body) },
    })
    return { ok: true }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update a markdown page',
      operationId: 'updatePage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ slug: t.String() }),
    body: t.Object({
      title: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
      content: t.Optional(t.String({ maxLength: 200_000 })),
      published: t.Optional(t.Boolean()),
      path: t.Optional(t.String()),
      navOrder: t.Optional(t.Nullable(t.Number())),
      showInFooter: t.Optional(t.Boolean()),
    }),
    response: {
      200: t.Object({ ok: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
  .delete('/', async ({ params, set, admin, request }) => {
    const existing = await db.query.markdownPages.findFirst({ where: { slug: params.slug } })
    if (!existing) {
      set.status = 404
      return { error: 'Page not found' }
    }
    await db.delete(markdownPages).where(eq(markdownPages.slug, params.slug))
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'page.delete',
      target: `page:${params.slug}`,
    })
    set.status = 204
    return null
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Delete a markdown page',
      operationId: 'deletePage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    params: t.Object({ slug: t.String() }),
  })
