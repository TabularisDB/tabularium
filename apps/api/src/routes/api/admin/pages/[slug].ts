import { Elysia, t } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { validatePath, isSeededPath } from '$lib/page-path'
import { getI18nConfig, SUPPORTED_LOCALES, type Locale } from '$lib/i18n'

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

const pageSchema = t.Object({
  slug: t.String(),
  locale: localeSchema,
  path: t.String(),
  title: t.String(),
  content: t.String(),
  published: t.Boolean(),
  navOrder: t.Nullable(t.Number()),
  showInFooter: t.Boolean(),
  createdAt: t.Number(),
  updatedAt: t.Number(),
})

const translationSummarySchema = t.Object({
  locale: localeSchema,
  title: t.String(),
  updatedAt: t.Number(),
})

function resolveLocale(input: unknown): Locale {
  if (typeof input === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(input)) {
    return input as Locale
  }
  return getI18nConfig().defaultLocale
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    async ({ params, query, set }) => {
      const locale = resolveLocale(query.locale)
      const row = await db.query.markdownPages.findFirst({
        where: { slug: params.slug, locale },
      })
      if (!row) {
        set.status = 404
        return { error: 'Page not found' }
      }
      return {
        slug: row.slug,
        locale: row.locale as Locale,
        path: row.path,
        title: row.title,
        content: row.content,
        published: row.published === 1,
        navOrder: row.navOrder,
        showInFooter: row.showInFooter === 1,
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Get a markdown page (raw)',
        operationId: 'adminGetPage',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String() }),
      query: t.Object({ locale: t.Optional(localeSchema) }),
      response: { 200: pageSchema, 404: t.Object({ error: t.String() }) },
    },
  )
  .get(
    '/translations',
    async ({ params }) => {
      const rows = await db
        .select({
          locale: markdownPages.locale,
          title: markdownPages.title,
          updatedAt: markdownPages.updatedAt,
        })
        .from(markdownPages)
        .where(eq(markdownPages.slug, params.slug))
      return {
        translations: rows.map((r) => ({
          locale: r.locale as Locale,
          title: r.title,
          updatedAt: Number(r.updatedAt),
        })),
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'List existing translations for a page',
        operationId: 'adminListPageTranslations',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String() }),
      response: { 200: t.Object({ translations: t.Array(translationSummarySchema) }) },
    },
  )
  .patch(
    '/',
    async ({ params, query, body, set, admin, request }) => {
      const locale = resolveLocale(query.locale)
      const existing = await db.query.markdownPages.findFirst({ where: { slug: params.slug, locale } })
      if (!existing) {
        const canonical = await db.query.markdownPages.findFirst({ where: { slug: params.slug } })
        if (!canonical) {
          set.status = 404
          return { error: 'Page not found' }
        }
        if (body.path !== undefined && body.path !== canonical.path) {
          set.status = 400
          return {
            error: 'translation rows inherit the canonical path; omit `path` or call PATCH on the default locale',
          }
        }
        try {
          await db.insert(markdownPages).values({
            slug: params.slug,
            locale,
            path: canonical.path,
            title: body.title ?? canonical.title,
            content: body.content ?? canonical.content,
            published: body.published === undefined ? canonical.published : body.published ? 1 : 0,
            navOrder: body.navOrder !== undefined ? body.navOrder : canonical.navOrder,
            showInFooter: body.showInFooter === undefined ? canonical.showInFooter : body.showInFooter ? 1 : 0,
          })
        } catch {
          set.status = 409
          return { error: 'Another page already uses that path' }
        }
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'page.translate',
          target: `page:${params.slug}:${locale}`,
          meta: { locale, fields: Object.keys(body) },
        })
        return { ok: true }
      }
      const patch: Partial<typeof markdownPages.$inferInsert> = { updatedAt: Date.now() }
      if (body.title !== undefined) patch.title = body.title
      if (body.content !== undefined) patch.content = body.content
      if (body.published !== undefined) patch.published = body.published ? 1 : 0
      if (body.navOrder !== undefined) patch.navOrder = body.navOrder
      if (body.showInFooter !== undefined) patch.showInFooter = body.showInFooter ? 1 : 0
      if (body.path !== undefined && body.path !== existing.path) {
        if (isSeededPath(existing.path)) {
          set.status = 400
          return { error: 'cannot change the path of a built-in page (about/privacy/terms)' }
        }
        const check = validatePath(body.path)
        if (!check.ok) {
          set.status = 400
          return { error: check.error }
        }
        patch.path = check.path
      }
      try {
        await db
          .update(markdownPages)
          .set(patch)
          .where(and(eq(markdownPages.slug, params.slug), eq(markdownPages.locale, locale)))
      } catch {
        set.status = 409
        return { error: 'Another page already uses that path' }
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'page.update',
        target: `page:${params.slug}:${locale}`,
        meta: { locale, fields: Object.keys(body) },
      })
      return { ok: true }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Update a markdown page (creates the translation row if absent)',
        operationId: 'updatePage',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String() }),
      query: t.Object({ locale: t.Optional(localeSchema) }),
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
    },
  )
  .delete(
    '/',
    async ({ params, query, set, admin, request }) => {
      const locale = query.locale ? resolveLocale(query.locale) : null
      if (locale) {
        const existing = await db.query.markdownPages.findFirst({ where: { slug: params.slug, locale } })
        if (!existing) {
          set.status = 404
          return { error: 'Page not found' }
        }
        await db.delete(markdownPages).where(and(eq(markdownPages.slug, params.slug), eq(markdownPages.locale, locale)))
        await recordAudit({
          ...actorFromAdmin(admin, request),
          action: 'page.delete-translation',
          target: `page:${params.slug}:${locale}`,
          meta: { locale },
        })
        set.status = 204
        return null
      }
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
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Delete a markdown page (all locales) or one translation when `locale` is given',
        operationId: 'deletePage',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ slug: t.String() }),
      query: t.Object({ locale: t.Optional(localeSchema) }),
    },
  )
