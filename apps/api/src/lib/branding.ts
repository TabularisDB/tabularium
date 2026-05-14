import { getSetting } from './settings'
import { SUPPORTED_LOCALES, getI18nConfig, type Locale } from './i18n'

export type Branding = {
  name: string
  tagline: string
  primaryHex: string
  accentHex: string
  successHex: string
  logoUrl: string | null
  faviconUrl: string | null
  footerText: string | null
  analyticsScript: string | null
  allowIndexing: boolean
}

export type LocalizedBranding = Branding & {
  taglineTranslations: Partial<Record<Locale, string>>
  footerTextTranslations: Partial<Record<Locale, string>>
}

const DEFAULTS: Branding = {
  name: 'Tabularium',
  tagline: 'Discover, submit, ship plugins.',
  primaryHex: '#3b82f6',
  accentHex: '#8b5cf6',
  successHex: '#10b981',
  logoUrl: null,
  faviconUrl: null,
  footerText: null,
  analyticsScript: null,
  allowIndexing: true,
}

function readBool(key: string, fallback: boolean): boolean {
  const v = getSetting(key)
  if (v === undefined) return fallback
  return v === '1' || v === 'true'
}

function readLocalizedString(baseKey: string, locale: Locale, fallback: Locale, defaultValue: string | null): string | null {
  return (
    getSetting(`${baseKey}.${locale}`) ??
    getSetting(`${baseKey}.${fallback}`) ??
    getSetting(baseKey) ??
    defaultValue
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
  return {
    name: getSetting('branding.name') ?? DEFAULTS.name,
    tagline: readLocalizedString('branding.tagline', requested, fallback, DEFAULTS.tagline) ?? DEFAULTS.tagline,
    primaryHex: getSetting('branding.primary_hex') ?? DEFAULTS.primaryHex,
    accentHex: getSetting('branding.accent_hex') ?? DEFAULTS.accentHex,
    successHex: getSetting('branding.success_hex') ?? DEFAULTS.successHex,
    logoUrl: getSetting('branding.logo_url') ?? DEFAULTS.logoUrl,
    faviconUrl: getSetting('branding.favicon_url') ?? DEFAULTS.faviconUrl,
    footerText: readLocalizedString('branding.footer_text', requested, fallback, DEFAULTS.footerText),
    analyticsScript: getSetting('branding.analytics_script') ?? DEFAULTS.analyticsScript,
    allowIndexing: readBool('branding.allow_indexing', DEFAULTS.allowIndexing),
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

export function defaultBranding(): Branding {
  return { ...DEFAULTS }
}
