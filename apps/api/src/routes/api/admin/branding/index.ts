import { Elysia, t } from 'elysia'
import { adminMiddleware } from '$middleware/admin'
import { getLocalizedBranding, defaultBranding } from '$lib/branding'
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
  { input: 'tagline', setting: 'branding.tagline' },
  { input: 'primaryHex', setting: 'branding.primary_hex' },
  { input: 'accentHex', setting: 'branding.accent_hex' },
  { input: 'successHex', setting: 'branding.success_hex' },
  { input: 'logoUrl', setting: 'branding.logo_url' },
  { input: 'faviconUrl', setting: 'branding.favicon_url' },
  { input: 'footerText', setting: 'branding.footer_text' },
  { input: 'analyticsScript', setting: 'branding.analytics_script' },
] as const

type BrandingPatch = {
  name?: string
  tagline?: string
  primaryHex?: string
  accentHex?: string
  successHex?: string
  logoUrl?: string | null
  faviconUrl?: string | null
  footerText?: string | null
  analyticsScript?: string | null
  allowIndexing?: boolean
  taglineTranslations?: Partial<Record<Locale, string | null>>
  footerTextTranslations?: Partial<Record<Locale, string | null>>
}

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
  .get('/', () => ({ current: getLocalizedBranding(), defaults: defaultBranding() }), {
    detail: { tags: ['Admin'], summary: 'Get current + default branding (with translation maps)', operationId: 'getAdminBranding', security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
    response: { 200: t.Object({ current: localizedBrandingSchema, defaults: brandingSchema }) },
  })
  .put('/', async ({ body, set, admin, request }) => {
    for (const hex of ['primaryHex', 'accentHex', 'successHex'] as const) {
      const value = body[hex]
      if (value !== undefined && !HEX_RE.test(value)) {
        set.status = 400
        return { error: `${hex} must be #RRGGBB` }
      }
    }
    const patch = body as BrandingPatch
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
    await recordAudit({
      ...actorFromAdmin(admin, request),
      action: 'branding.update',
      target: 'branding',
      meta: { fields: Object.keys(body) },
    })
    return { ok: true, branding: getLocalizedBranding() }
  }, {
    detail: {
      tags: ['Admin'],
      summary: 'Update branding (whitelabel)',
      description: 'Partial update. `tagline` and `footerText` set the default-locale value; `taglineTranslations` / `footerTextTranslations` set per-locale overrides (pass null/empty to clear).',
      operationId: 'updateBranding',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
      tagline: t.Optional(t.String({ maxLength: 200 })),
      primaryHex: t.Optional(t.String()),
      accentHex: t.Optional(t.String()),
      successHex: t.Optional(t.String()),
      logoUrl: t.Optional(t.Nullable(t.String())),
      faviconUrl: t.Optional(t.Nullable(t.String())),
      footerText: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
      analyticsScript: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))),
      allowIndexing: t.Optional(t.Boolean()),
      taglineTranslations: t.Optional(translationMapSchema),
      footerTextTranslations: t.Optional(translationMapSchema),
    }),
    response: {
      200: t.Object({ ok: t.Boolean(), branding: localizedBrandingSchema }),
      400: t.Object({ error: t.String() }),
    },
  })
