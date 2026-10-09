import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getLocalizedBranding, defaultBranding, THEME_PALETTES, SOCIAL_PLATFORMS } from '$lib/branding'
import { setSetting, deleteSetting, hasSetting } from '$lib/settings'
import { SUPPORTED_LOCALES, type Locale } from '$lib/i18n'
import { recordAudit, actorFromAdmin } from '$lib/audit'

const localeSchema = t.Union([
  t.Literal('en'),
  t.Literal('de'),
  t.Literal('es'),
  t.Literal('fr'),
  t.Literal('it'),
  t.Literal('zh-CN'),
])

const translationMapSchema = t.Object({
  en: t.Optional(t.Nullable(t.String())),
  de: t.Optional(t.Nullable(t.String())),
  es: t.Optional(t.Nullable(t.String())),
  fr: t.Optional(t.Nullable(t.String())),
  it: t.Optional(t.Nullable(t.String())),
  'zh-CN': t.Optional(t.Nullable(t.String())),
})

const themeSchema = t.Union([t.Literal('default'), t.Literal('tabularis')])

const paletteSchema = t.Object({
  primaryHex: t.String(),
  accentHex: t.String(),
  successHex: t.String(),
})

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
  theme: themeSchema,
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

const localizedBrandingSchema = t.Intersect([
  brandingSchema,
  t.Object({
    taglineTranslations: translationMapSchema,
    footerTextTranslations: translationMapSchema,
  }),
])

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const STRING_FIELDS = [
  { input: 'name', setting: 'branding.name' },
  { input: 'theme', setting: 'branding.theme' },
  { input: 'tagline', setting: 'branding.tagline' },
  { input: 'primaryHex', setting: 'branding.primary_hex' },
  { input: 'accentHex', setting: 'branding.accent_hex' },
  { input: 'successHex', setting: 'branding.success_hex' },
  { input: 'logoUrl', setting: 'branding.logo_url' },
  { input: 'logoLightUrl', setting: 'branding.logo_light_url' },
  { input: 'logoStyle', setting: 'branding.logo_style' },
  { input: 'faviconUrl', setting: 'branding.favicon_url' },
  { input: 'footerText', setting: 'branding.footer_text' },
  { input: 'analyticsScript', setting: 'branding.analytics_script' },
] as const

type BrandingPatch = {
  name?: string
  theme?: string
  tagline?: string
  primaryHex?: string
  accentHex?: string
  successHex?: string
  logoUrl?: string | null
  logoLightUrl?: string | null
  logoStyle?: string
  faviconUrl?: string | null
  footerText?: string | null
  analyticsScript?: string | null
  allowIndexing?: boolean
  taglineTranslations?: Partial<Record<Locale, string | null>>
  footerTextTranslations?: Partial<Record<Locale, string | null>>
  socialLinks?: Partial<Record<(typeof SOCIAL_PLATFORMS)[number], string | null>>
}

const HTTP_URL_RE = /^https?:\/\/[^\s]+$/

async function writeTranslations(baseKey: string, map: Partial<Record<Locale, string | null>>) {
  for (const locale of SUPPORTED_LOCALES) {
    if (!(locale in map)) continue
    const key = `${baseKey}.${locale}`
    const value = map[locale]
    if (value === null || value === undefined || value === '') {
      if (hasSetting(key)) await deleteSetting(key)
    } else {
      await setSetting(key, String(value))
    }
  }
}

export default new Elysia()
  .use(adminMiddleware)
  .get(
    '/',
    () => {
      const current = getLocalizedBranding()
      return { current, defaults: defaultBranding(current.theme), themePalettes: THEME_PALETTES }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Get current + default branding (with translation maps)',
        description:
          '`defaults` reflects the currently selected theme; `themePalettes` lists the fallback brand colours of every theme.',
        operationId: 'getAdminBranding',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      response: {
        200: t.Object({
          current: localizedBrandingSchema,
          defaults: brandingSchema,
          themePalettes: t.Object({ default: paletteSchema, tabularis: paletteSchema }),
        }),
      },
    },
  )
  .put(
    '/',
    async ({ body, set, admin, request }) => {
      for (const hex of ['primaryHex', 'accentHex', 'successHex'] as const) {
        const value = body[hex]
        if (value !== undefined && !HEX_RE.test(value)) {
          set.status = 400
          return { error: `${hex} must be #RRGGBB` }
        }
      }
      const patch = body as BrandingPatch
      for (const platform of SOCIAL_PLATFORMS) {
        const url = patch.socialLinks?.[platform]
        if (url && !HTTP_URL_RE.test(url)) {
          set.status = 400
          return { error: `socialLinks.${platform} must be an http(s) URL` }
        }
      }
      for (const { input, setting } of STRING_FIELDS) {
        const value = patch[input as keyof BrandingPatch]
        if (value === undefined || typeof value === 'object') continue
        if (value === null || value === '') {
          if (hasSetting(setting)) await deleteSetting(setting)
          continue
        }
        await setSetting(setting, String(value))
      }
      if (body.allowIndexing !== undefined) {
        await setSetting('branding.allow_indexing', body.allowIndexing ? '1' : '0')
      }
      if (patch.taglineTranslations) await writeTranslations('branding.tagline', patch.taglineTranslations)
      if (patch.footerTextTranslations) await writeTranslations('branding.footer_text', patch.footerTextTranslations)
      if (patch.socialLinks) {
        for (const platform of SOCIAL_PLATFORMS) {
          if (!(platform in patch.socialLinks)) continue
          const key = `branding.social.${platform}`
          const url = patch.socialLinks[platform]
          if (url) await setSetting(key, url)
          else if (hasSetting(key)) await deleteSetting(key)
        }
      }
      await recordAudit({
        ...actorFromAdmin(admin, request),
        action: 'branding.update',
        target: 'branding',
        meta: { fields: Object.keys(body) },
      })
      return { ok: true, branding: getLocalizedBranding() }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Update branding (whitelabel): theme, colours, logo, tagline, footer',
        description:
          'Partial update. `theme` picks the visual preset (`default` | `tabularis`). `logoStyle` is `mark` (square icon beside the name) or `wordmark` (horizontal logo shown alone); `logoLightUrl` is an optional logo variant for light mode. `socialLinks` sets footer profile URLs per platform (github, discord, bluesky, x, mastodon, linkedin; null clears). `tagline` and `footerText` set the default-locale value; `taglineTranslations` / `footerTextTranslations` set per-locale overrides (pass null/empty to clear).',
        operationId: 'updateBranding',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
        theme: t.Optional(themeSchema),
        tagline: t.Optional(t.String({ maxLength: 200 })),
        primaryHex: t.Optional(t.String()),
        accentHex: t.Optional(t.String()),
        successHex: t.Optional(t.String()),
        logoUrl: t.Optional(t.Nullable(t.String())),
        logoLightUrl: t.Optional(t.Nullable(t.String())),
        logoStyle: t.Optional(t.Union([t.Literal('mark'), t.Literal('wordmark')])),
        faviconUrl: t.Optional(t.Nullable(t.String())),
        footerText: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
        analyticsScript: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))),
        allowIndexing: t.Optional(t.Boolean()),
        taglineTranslations: t.Optional(translationMapSchema),
        footerTextTranslations: t.Optional(translationMapSchema),
        socialLinks: t.Optional(t.Partial(socialLinksSchema)),
      }),
      response: {
        200: t.Object({ ok: t.Boolean(), branding: localizedBrandingSchema }),
        400: t.Object({ error: t.String() }),
      },
    },
  )
