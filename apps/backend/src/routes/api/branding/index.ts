import { Elysia, t } from 'elysia'
import { getBranding } from '$lib/branding'
import { SUPPORTED_LOCALES, type Locale } from '$lib/i18n'

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

const brandingSchema = t.Object({
  name: t.String(),
  tagline: t.String(),
  primaryHex: t.String(),
  accentHex: t.String(),
  successHex: t.String(),
  logoUrl: t.Nullable(t.String()),
  faviconUrl: t.Nullable(t.String()),
  footerText: t.Nullable(t.String()),
  analyticsScript: t.Nullable(t.String()),
  allowIndexing: t.Boolean(),
})

export default new Elysia()
  .get('/', ({ query }) => {
    const locale = (typeof query.locale === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(query.locale))
      ? (query.locale as Locale)
      : undefined
    return getBranding(locale)
  }, {
    detail: {
      tags: ['Plugins'],
      summary: 'Get instance branding (whitelabel)',
      description: 'Public read-only endpoint. Pass `?locale=` to fetch the tagline/footer in a specific language (falls back to default locale).',
      operationId: 'getBranding',
    },
    query: t.Object({ locale: t.Optional(localeSchema) }),
    response: { 200: brandingSchema },
  })
