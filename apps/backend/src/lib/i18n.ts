import { getSetting } from './settings'

export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'it', 'zh-CN'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export type I18nConfig = {
  defaultLocale: Locale
  enabledLocales: Locale[]
  availableLocales: Locale[]
}

function parseEnabled(raw: string | undefined): Locale[] {
  if (!raw) return [...SUPPORTED_LOCALES]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...SUPPORTED_LOCALES]
    const filtered = parsed.filter((l): l is Locale => SUPPORTED_LOCALES.includes(l))
    return filtered.length > 0 ? filtered : [...SUPPORTED_LOCALES]
  } catch {
    return [...SUPPORTED_LOCALES]
  }
}

function parseDefault(raw: string | undefined, enabled: Locale[]): Locale {
  if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw) && enabled.includes(raw as Locale)) {
    return raw as Locale
  }
  return enabled.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : enabled[0] ?? DEFAULT_LOCALE
}

export function getI18nConfig(): I18nConfig {
  const enabledLocales = parseEnabled(getSetting('i18n.enabled_locales'))
  const defaultLocale = parseDefault(getSetting('i18n.default_locale'), enabledLocales)
  return {
    defaultLocale,
    enabledLocales,
    availableLocales: [...SUPPORTED_LOCALES],
  }
}

export function isLocaleEnabled(locale: string): boolean {
  return getI18nConfig().enabledLocales.includes(locale as Locale)
}
