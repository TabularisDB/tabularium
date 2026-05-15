import { Elysia, t } from 'elysia'
import { db } from '$db'
import { renderMarkdown } from '$lib/markdown'
import { cache, isString } from '$lib/cache'
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
  .get('/', async ({ params, query, set }) => {
    const requested = pickLocale(query.locale)
    const fallback = getI18nConfig().defaultLocale
    let row = await db.query.markdownPages.findFirst({
      where: { slug: params.slug, locale: requested, published: 1 },
    })
    if (!row && requested !== fallback) {
      row = await db.query.markdownPages.findFirst({
        where: { slug: params.slug, locale: fallback, published: 1 },
      })
    }
    if (!row) {
      row = await db.query.markdownPages.findFirst({
        where: { slug: params.slug, published: 1 },
      })
    }
    if (!row) {
      set.status = 404
      return { error: 'Page not found' }
    }
    const cacheKey = `page:html:${row.slug}:${row.locale}:${row.updatedAt}`
    let html = await cache().get<string>(cacheKey, isString)
    if (!html) {
      html = renderMarkdown(row.content)
      await cache().set(cacheKey, html, RENDER_TTL)
    }
    return {
      slug: row.slug,
      locale: row.locale as Locale,
      title: row.title,
      html,
      updatedAt: Number(row.updatedAt),
    }
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Render a published markdown page',
      description: 'Returns sanitized HTML for a page in the requested locale, falling back to the default locale if missing.',
      operationId: 'getPage',
    },
    params: t.Object({ slug: t.String() }),
    query: t.Object({ locale: t.Optional(localeSchema) }),
    response: {
      200: t.Object({ slug: t.String(), locale: localeSchema, title: t.String(), html: t.String(), updatedAt: t.Number() }),
      404: t.Object({ error: t.String() }),
    },
  })
