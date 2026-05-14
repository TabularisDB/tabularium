import { Elysia, t } from 'elysia'
import { asc } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { validatePath } from '$lib/page-path'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

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
  .get('/', async () => {
    const rows = await db.select().from(markdownPages).orderBy(asc(markdownPages.navOrder))
    return {
      pages: rows.map((r) => ({
        slug: r.slug,
        path: r.path,
        title: r.title,
        content: r.content,
        published: r.published === 1,
        navOrder: r.navOrder,
        showInFooter: r.showInFooter === 1,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'List all markdown pages (incl. unpublished)',
      operationId: 'adminListPages',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ pages: t.Array(pageSchema) }) },
  })
  .post('/', async ({ body, set, admin, request }) => {
    if (!SLUG_RE.test(body.slug)) {
      set.status = 400
      return { error: 'slug must be lowercase letters/digits/hyphens (a-z 0-9 -)' }
    }
    const pathInput = body.path ?? `/pages/${body.slug}`
    const pathCheck = validatePath(pathInput)
    if (!pathCheck.ok) {
      set.status = 400
      return { error: pathCheck.error }
    }
    try {
      await db.insert(markdownPages).values({
        slug: body.slug,
        path: pathCheck.path,
        title: body.title,
        content: body.content,
        published: body.published ?? false ? 1 : 0,
        navOrder: body.navOrder ?? null,
        showInFooter: body.showInFooter ? 1 : 0,
      })
    } catch {
      set.status = 409
      return { error: 'A page with that slug or path already exists' }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'page.create',
      target: `page:${body.slug}`,
      meta: { path: pathCheck.path },
    })
    return { ok: true, slug: body.slug, path: pathCheck.path }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Create a markdown page',
      description: 'Pass `path` to mount at any non-reserved URL (eg. `/about`, `/`, `/docs/welcome`). Default: `/pages/<slug>`.',
      operationId: 'createPage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      slug: t.String(),
      path: t.Optional(t.String()),
      title: t.String({ minLength: 1, maxLength: 120 }),
      content: t.String({ maxLength: 200_000 }),
      published: t.Optional(t.Boolean()),
      navOrder: t.Optional(t.Nullable(t.Number())),
      showInFooter: t.Optional(t.Boolean()),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), slug: t.String(), path: t.String() }),
      400: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
