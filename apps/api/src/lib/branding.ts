import { getSetting } from './settings'
import { SUPPORTED_LOCALES, getI18nConfig, type Locale } from './i18n'

export const THEMES = ['default', 'tabularis'] as const
export type Theme = (typeof THEMES)[number]

export type ThemePalette = {
  primaryHex: string
  accentHex: string
  successHex: string
}

// Brand colours each theme falls back to when the admin hasn't picked their own.
export const THEME_PALETTES: Record<Theme, ThemePalette> = {
  default: { primaryHex: '#3b82f6', accentHex: '#8b5cf6', successHex: '#10b981' },
  tabularis: { primaryHex: '#2563eb', accentHex: '#35d0c0', successHex: '#10b981' },
}

export const SOCIAL_PLATFORMS = ['github', 'discord', 'bluesky', 'x', 'mastodon', 'linkedin'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export type SocialLinks = Record<SocialPlatform, string | null>

function readSocialLinks(): SocialLinks {
  return Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, getSetting(`branding.social.${p}`) ?? null])) as SocialLinks
}

export const LOGO_STYLES = ['mark', 'wordmark'] as const
export type LogoStyle = (typeof LOGO_STYLES)[number]

function isLogoStyle(value: unknown): value is LogoStyle {
  return typeof value === 'string' && (LOGO_STYLES as readonly string[]).includes(value)
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

export type Branding = {
  name: string
  theme: Theme
  tagline: string
  primaryHex: string
  accentHex: string
  successHex: string
  logoUrl: string | null
  // Optional variant shown in light mode (e.g. dark text on a light background).
  logoLightUrl: string | null
  // `mark`: square icon next to the instance name. `wordmark`: a horizontal
  // logo that already contains the name, rendered alone.
  logoStyle: LogoStyle
  faviconUrl: string | null
  footerText: string | null
  analyticsScript: string | null
  allowIndexing: boolean
  // Profile URLs shown as icons in the footer; null = hidden.
  socialLinks: SocialLinks
}

export type LocalizedBranding = Branding & {
  taglineTranslations: Partial<Record<Locale, string>>
  footerTextTranslations: Partial<Record<Locale, string>>
}

const DEFAULTS: Branding = {
  name: 'Tabularium',
  theme: 'default',
  tagline: 'Discover, submit, ship plugins.',
  ...THEME_PALETTES.default,
  logoUrl: null,
  logoLightUrl: null,
  logoStyle: 'mark',
  faviconUrl: null,
  footerText: null,
  analyticsScript: null,
  allowIndexing: true,
  socialLinks: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, null])) as SocialLinks,
}

function readBool(key: string, fallback: boolean): boolean {
  const v = getSetting(key)
  if (v === undefined) return fallback
  return v === '1' || v === 'true'
}

function readLocalizedString(
  baseKey: string,
  locale: Locale,
  fallback: Locale,
  defaultValue: string | null,
): string | null {
  return (
    getSetting(`${baseKey}.${locale}`) ?? getSetting(`${baseKey}.${fallback}`) ?? getSetting(baseKey) ?? defaultValue
  )
}

function readTranslations(baseKey: string): Partial<Record<Locale, string>> {
  const out: Partial<Record<Locale, string>> = {}
  for (const l of SUPPORTED_LOCALES) {
    const v = getSetting(`${baseKey}.${l}`)
    if (v !== undefined) out[l] = v
  }
  return out
}

export function getBranding(locale?: Locale): Branding {
  const fallback = getI18nConfig().defaultLocale
  const requested: Locale = locale ?? fallback
  const storedTheme = getSetting('branding.theme')
  const theme = isTheme(storedTheme) ? storedTheme : DEFAULTS.theme
  const palette = THEME_PALETTES[theme]
  const storedLogoStyle = getSetting('branding.logo_style')
  return {
    name: getSetting('branding.name') ?? DEFAULTS.name,
    theme,
    tagline: readLocalizedString('branding.tagline', requested, fallback, DEFAULTS.tagline) ?? DEFAULTS.tagline,
    primaryHex: getSetting('branding.primary_hex') ?? palette.primaryHex,
    accentHex: getSetting('branding.accent_hex') ?? palette.accentHex,
    successHex: getSetting('branding.success_hex') ?? palette.successHex,
    logoUrl: getSetting('branding.logo_url') ?? DEFAULTS.logoUrl,
    logoLightUrl: getSetting('branding.logo_light_url') ?? DEFAULTS.logoLightUrl,
    logoStyle: isLogoStyle(storedLogoStyle) ? storedLogoStyle : DEFAULTS.logoStyle,
    faviconUrl: getSetting('branding.favicon_url') ?? DEFAULTS.faviconUrl,
    footerText: readLocalizedString('branding.footer_text', requested, fallback, DEFAULTS.footerText),
    analyticsScript: getSetting('branding.analytics_script') ?? DEFAULTS.analyticsScript,
    allowIndexing: readBool('branding.allow_indexing', DEFAULTS.allowIndexing),
    socialLinks: readSocialLinks(),
  }
}

export function getLocalizedBranding(): LocalizedBranding {
  const base = getBranding()
  return {
    ...base,
    taglineTranslations: readTranslations('branding.tagline'),
    footerTextTranslations: readTranslations('branding.footer_text'),
  }
}

export function defaultBranding(theme: Theme = DEFAULTS.theme): Branding {
  return { ...DEFAULTS, theme, ...THEME_PALETTES[theme], socialLinks: { ...DEFAULTS.socialLinks } }
}
