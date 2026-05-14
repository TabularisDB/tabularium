import { Elysia, t } from 'elysia'
import { asc } from 'drizzle-orm'
import { adminMiddleware } from '$middleware/admin'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { recordAudit, actorFromAdmin } from '$lib/audit'
import { validatePath } from '$lib/page-path'
import { getI18nConfig, SUPPORTED_LOCALES, type Locale } from '$lib/i18n'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

const formatSchema = t.Union([t.Literal('markdown'), t.Literal('html')])

const pageSchema = t.Object({
  slug: t.String(),
  locale: localeSchema,
  format: formatSchema,
  path: t.String(),
  title: t.String(),
  content: t.String(),
  published: t.Boolean(),
  navOrder: t.Nullable(t.Number()),
  showInFooter: t.Boolean(),
  translations: t.Array(localeSchema),
  createdAt: t.Number(),
  updatedAt: t.Number(),
})

export default new Elysia()
  .use(adminMiddleware)
  .get('/', async () => {
    const rows = await db.select().from(markdownPages).orderBy(asc(markdownPages.navOrder))
    const cfg = getI18nConfig()
    const bySlug = new Map<string, typeof rows>()
    for (const r of rows) {
      const list = bySlug.get(r.slug) ?? []
      list.push(r)
      bySlug.set(r.slug, list)
    }
    const pages = Array.from(bySlug.values()).map((group) => {
      const canonical = group.find((r) => r.locale === cfg.defaultLocale) ?? group[0]
      const translations = group.map((r) => r.locale as Locale)
      return {
        slug: canonical.slug,
        locale: canonical.locale as Locale,
        format: (canonical.format ?? 'markdown') as 'markdown' | 'html',
        path: canonical.path,
        title: canonical.title,
        content: canonical.content,
        published: canonical.published === 1,
        navOrder: canonical.navOrder,
        showInFooter: canonical.showInFooter === 1,
        translations,
        createdAt: Number(canonical.createdAt),
        updatedAt: Number(canonical.updatedAt),
      }
    })
    return { pages }
  }, {
    detail: { tags: ['Admin'], summary: 'List all markdown pages (grouped by slug)', operationId: 'adminListPages', security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
    response: { 200: t.Object({ pages: t.Array(pageSchema) }) },
  })
  .post('/', async ({ body, set, admin, request }) => {
    if (!SLUG_RE.test(body.slug)) {
      set.status = 400
      return { error: 'slug must be lowercase letters/digits/hyphens (a-z 0-9 -)' }
    }
    const locale = (body.locale ?? getI18nConfig().defaultLocale) as Locale
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
      set.status = 400
      return { error: `Unsupported locale '${locale}'` }
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
        locale,
        format: body.format ?? 'markdown',
        path: pathCheck.path,
        title: body.title,
        content: body.content,
        published: body.published ?? false ? 1 : 0,
        navOrder: body.navOrder ?? null,
        showInFooter: body.showInFooter ? 1 : 0,
      })
    } catch {
      set.status = 409
      return { error: 'A page with that slug/locale or path already exists' }
    }
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'page.create',
      target: `page:${body.slug}:${locale}`,
      meta: { path: pathCheck.path, locale },
    })
    return { ok: true, slug: body.slug, path: pathCheck.path, locale }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Create a markdown page',
      description: 'Creates the default-locale row unless `locale` is given. Pass `path` to mount at any non-reserved URL.',
      operationId: 'createPage',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      slug: t.String(),
      locale: t.Optional(localeSchema),
      format: t.Optional(formatSchema),
      path: t.Optional(t.String()),
      title: t.String({ minLength: 1, maxLength: 120 }),
      content: t.String({ maxLength: 200_000 }),
      published: t.Optional(t.Boolean()),
      navOrder: t.Optional(t.Nullable(t.Number())),
      showInFooter: t.Optional(t.Boolean()),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), slug: t.String(), path: t.String(), locale: localeSchema }),
      400: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
  })
