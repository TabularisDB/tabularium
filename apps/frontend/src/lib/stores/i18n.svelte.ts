import { eden } from '$lib/eden'
import { setLocale, getLocale, locales, localStorageKey } from '$lib/paraglide/runtime'

export type Locale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'zh-CN'

export type I18nConfig = {
  defaultLocale: Locale
  enabledLocales: Locale[]
  availableLocales: Locale[]
}

const DEFAULTS: I18nConfig = {
  defaultLocale: 'en',
  enabledLocales: ['en'],
  availableLocales: [...locales] as Locale[],
}

function createI18nStore() {
  let state = $state<I18nConfig>({ ...DEFAULTS })
  let loaded = $state(false)
  let current = $state<Locale>('en')

  function readStored(): Locale | null {
    if (typeof localStorage === 'undefined') return null
    const v = localStorage.getItem(localStorageKey)
    if (!v) return null
    return (locales as readonly string[]).includes(v) ? (v as Locale) : null
  }

  function applyLocale(locale: Locale, opts: { reload: boolean }) {
    current = locale
    setLocale(locale, { reload: opts.reload })
  }

  async function refresh() {
    try {
      const { data, error } = await eden.api.i18n.get()
      if (error) throw error
      state = data as I18nConfig
    } catch {
      // keep defaults
    } finally {
      const stored = readStored()
      const initial = stored && state.enabledLocales.includes(stored) ? stored : state.defaultLocale
      applyLocale(initial, { reload: false })
      loaded = true
    }
  }

  function set(locale: Locale) {
    if (!state.enabledLocales.includes(locale)) return
    if (locale === current) return
    applyLocale(locale, { reload: true })
  }

  return {
    get defaultLocale() {
      return state.defaultLocale
    },
    get enabledLocales() {
      return state.enabledLocales
    },
    get availableLocales() {
      return state.availableLocales
    },
    get current() {
      return current
    },
    get loaded() {
      return loaded
    },
    refresh,
    set,
    sync() {
      current = getLocale() as Locale
    },
  }
}

export const i18n = createI18nStore()

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  'zh-CN': '中文',
}
