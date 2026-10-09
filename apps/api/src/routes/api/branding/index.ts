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

const socialLinksSchema = t.Object({
  github: t.Nullable(t.String()),
  discord: t.Nullable(t.String()),
  bluesky: t.Nullable(t.String()),
  x: t.Nullable(t.String()),
  mastodon: t.Nullable(t.String()),
  linkedin: t.Nullable(t.String()),
})

const brandingSchema = t.Object({
  name: t.String(),
  theme: t.Union([t.Literal('default'), t.Literal('tabularis')]),
  tagline: t.String(),
  primaryHex: t.String(),
  accentHex: t.String(),
  successHex: t.String(),
  logoUrl: t.Nullable(t.String()),
  logoLightUrl: t.Nullable(t.String()),
  logoStyle: t.Union([t.Literal('mark'), t.Literal('wordmark')]),
  faviconUrl: t.Nullable(t.String()),
  footerText: t.Nullable(t.String()),
  analyticsScript: t.Nullable(t.String()),
  allowIndexing: t.Boolean(),
  socialLinks: socialLinksSchema,
})

export default new Elysia().get(
  '/',
  ({ query }) => {
    const locale =
      typeof query.locale === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(query.locale)
        ? (query.locale as Locale)
        : undefined
    return getBranding(locale)
  },
  {
    detail: {
      tags: ['Plugins'],
      summary: 'Get instance branding (whitelabel)',
      description:
        'Public read-only endpoint. Pass `?locale=` to fetch the tagline/footer in a specific language (falls back to default locale).',
      operationId: 'getBranding',
    },
    query: t.Object({ locale: t.Optional(localeSchema) }),
    response: { 200: brandingSchema },
  },
)
