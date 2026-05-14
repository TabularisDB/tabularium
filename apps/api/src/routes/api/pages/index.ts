import { Elysia, t } from 'elysia'
import { eq, asc, and } from 'drizzle-orm'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { renderMarkdown } from '$lib/markdown'
import { cache } from '$lib/cache'
import { normalizePath } from '$lib/page-path'
import { getI18nConfig, SUPPORTED_LOCALES, type Locale } from '$lib/i18n'

const RENDER_TTL = 600

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

function pickLocale(input: unknown): Locale {
  if (typeof input === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(input)) {
    return input as Locale
  }
  return getI18nConfig().defaultLocale
}

export default new Elysia()
  .get('/', async ({ query }) => {
    const requested = pickLocale(query.locale)
    const fallback = getI18nConfig().defaultLocale
    const rows = await db
      .select({
        slug: markdownPages.slug,
        locale: markdownPages.locale,
        path: markdownPages.path,
        title: markdownPages.title,
        navOrder: markdownPages.navOrder,
        showInFooter: markdownPages.showInFooter,
        updatedAt: markdownPages.updatedAt,
      })
      .from(markdownPages)
      .where(eq(markdownPages.published, 1))
      .orderBy(asc(markdownPages.navOrder))
    const bySlug = new Map<string, typeof rows>()
    for (const r of rows) {
      const list = bySlug.get(r.slug) ?? []
      list.push(r)
      bySlug.set(r.slug, list)
    }
    const pages = Array.from(bySlug.values()).map((group) => {
      const pick =
        group.find((r) => r.locale === requested) ??
        group.find((r) => r.locale === fallback) ??
        group[0]
      return {
        slug: pick.slug,
        locale: pick.locale as Locale,
        path: pick.path,
        title: pick.title,
        navOrder: pick.navOrder,
        showInFooter: pick.showInFooter === 1,
        updatedAt: Number(pick.updatedAt),
      }
    })
    return { pages }
  }, {
    detail: { tags: ['Plugins'], summary: 'List published markdown pages', operationId: 'listPages' },
    query: t.Object({ locale: t.Optional(localeSchema) }),
    response: {
      200: t.Object({
        pages: t.Array(t.Object({
          slug: t.String(),
          locale: localeSchema,
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
    const requested = pickLocale(query.locale)
    const fallback = getI18nConfig().defaultLocale
    let row = await db.query.markdownPages.findFirst({
      where: { path, locale: requested, published: 1 },
    })
    if (!row && requested !== fallback) {
      const slugMatch = await db
        .select({ slug: markdownPages.slug })
        .from(markdownPages)
        .where(and(eq(markdownPages.path, path), eq(markdownPages.locale, requested)))
        .limit(1)
      const slug = slugMatch[0]?.slug
      if (slug) {
        row = await db.query.markdownPages.findFirst({
          where: { slug, locale: fallback, published: 1 },
        })
      }
      if (!row) {
        row = await db.query.markdownPages.findFirst({
          where: { path, locale: fallback, published: 1 },
        })
      }
    }
    if (!row) {
      row = await db.query.markdownPages.findFirst({ where: { path, published: 1 } })
    }
    if (!row) {
      set.status = 404
      return { error: 'No page at that path' }
    }
    const cacheKey = `page:html:${row.slug}:${row.locale}:${row.updatedAt}`
    let html = await cache().get<string>(cacheKey)
    if (!html) {
      html = renderMarkdown(row.content)
      await cache().set(cacheKey, html, RENDER_TTL)
    }
    return {
      slug: row.slug,
      locale: row.locale as Locale,
      path: row.path,
      title: row.title,
      html,
      updatedAt: Number(row.updatedAt),
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Resolve a published page by its public path',
      description: 'Returns sanitized HTML in the requested locale, with fallback to the default locale.',
      operationId: 'getPageByPath',
    },
    query: t.Object({
      path: t.Optional(t.String()),
      locale: t.Optional(localeSchema),
    }),
    response: {
      200: t.Object({
        slug: t.String(),
        locale: localeSchema,
        path: t.String(),
        title: t.String(),
        html: t.String(),
        updatedAt: t.Number(),
      }),
      404: t.Object({ error: t.String() }),
    },
  })
