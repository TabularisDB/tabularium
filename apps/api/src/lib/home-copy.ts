import { getSetting, setSetting } from './settings'
import { SUPPORTED_LOCALES, type Locale } from './i18n'

export type Translations = Partial<Record<Locale, string>>

export type HomeCopy = {
  eyebrow: { enabled: boolean; text: Translations }
  features: {
    enabled: boolean
    dropin: { title: Translations; body: Translations }
    providers: { title: Translations; body: Translations }
    release: { title: Translations; body: Translations }
  }
}

export const HOME_COPY_KEY = 'home_copy'
export const MAX_TEXT_LEN = 280

function defaults(): HomeCopy {
  return {
    eyebrow: { enabled: true, text: {} },
    features: {
      enabled: true,
      dropin: { title: {}, body: {} },
      providers: { title: {}, body: {} },
      release: { title: {}, body: {} },
    },
  }
}

export function defaultHomeCopy(): HomeCopy {
  return defaults()
}

function sanitizeTranslations(raw: unknown): Translations {
  const out: Translations = {}
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>
  for (const locale of SUPPORTED_LOCALES) {
    const v = obj[locale]
    if (typeof v === 'string') {
      const trimmed = v
      if (trimmed.length > 0) out[locale] = trimmed
    }
  }
  return out
}

function sanitizePair(raw: unknown): { title: Translations; body: Translations } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { title: sanitizeTranslations(r.title), body: sanitizeTranslations(r.body) }
}

function mergeWithDefaults(raw: unknown): HomeCopy {
  const base = defaults()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  const eyebrowRaw = (obj.eyebrow && typeof obj.eyebrow === 'object' ? obj.eyebrow : {}) as Record<string, unknown>
  const featuresRaw = (obj.features && typeof obj.features === 'object' ? obj.features : {}) as Record<string, unknown>
  return {
    eyebrow: {
      enabled: typeof eyebrowRaw.enabled === 'boolean' ? eyebrowRaw.enabled : base.eyebrow.enabled,
      text: sanitizeTranslations(eyebrowRaw.text),
    },
    features: {
      enabled: typeof featuresRaw.enabled === 'boolean' ? featuresRaw.enabled : base.features.enabled,
      dropin: sanitizePair(featuresRaw.dropin),
      providers: sanitizePair(featuresRaw.providers),
      release: sanitizePair(featuresRaw.release),
    },
  }
}

export function getHomeCopy(): HomeCopy {
  const raw = getSetting(HOME_COPY_KEY)
  if (!raw) return defaults()
  try {
    return mergeWithDefaults(JSON.parse(raw))
  } catch {
    return defaults()
  }
}

export class HomeCopyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HomeCopyValidationError'
  }
}

function validateTranslations(map: Translations, path: string): Translations {
  const out: Translations = {}
  for (const [locale, value] of Object.entries(map)) {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
      throw new HomeCopyValidationError(`${path}: unsupported locale '${locale}'`)
    }
    if (typeof value !== 'string') {
      throw new HomeCopyValidationError(`${path}.${locale}: must be a string`)
    }
    if (value.length > MAX_TEXT_LEN) {
      throw new HomeCopyValidationError(`${path}.${locale}: exceeds ${MAX_TEXT_LEN} characters`)
    }
    if (value.trim().length > 0) out[locale as Locale] = value
  }
  return out
}

export function validateHomeCopy(input: unknown): HomeCopy {
  const base = defaults()
  if (!input || typeof input !== 'object') {
    throw new HomeCopyValidationError('home_copy: must be an object')
  }
  const obj = input as Record<string, unknown>
  const eyebrowRaw = (obj.eyebrow && typeof obj.eyebrow === 'object' ? obj.eyebrow : {}) as Record<string, unknown>
  const featuresRaw = (obj.features && typeof obj.features === 'object' ? obj.features : {}) as Record<string, unknown>
  if (eyebrowRaw.enabled !== undefined && typeof eyebrowRaw.enabled !== 'boolean') {
    throw new HomeCopyValidationError('eyebrow.enabled: must be boolean')
  }
  if (featuresRaw.enabled !== undefined && typeof featuresRaw.enabled !== 'boolean') {
    throw new HomeCopyValidationError('features.enabled: must be boolean')
  }
  const sectionPair = (raw: unknown, name: string) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return {
      title: validateTranslations((r.title ?? {}) as Translations, `features.${name}.title`),
      body: validateTranslations((r.body ?? {}) as Translations, `features.${name}.body`),
    }
  }
  return {
    eyebrow: {
      enabled: typeof eyebrowRaw.enabled === 'boolean' ? eyebrowRaw.enabled : base.eyebrow.enabled,
      text: validateTranslations((eyebrowRaw.text ?? {}) as Translations, 'eyebrow.text'),
    },
    features: {
      enabled: typeof featuresRaw.enabled === 'boolean' ? featuresRaw.enabled : base.features.enabled,
      dropin: sectionPair(featuresRaw.dropin, 'dropin'),
      providers: sectionPair(featuresRaw.providers, 'providers'),
      release: sectionPair(featuresRaw.release, 'release'),
    },
  }
}

export async function setHomeCopy(next: unknown): Promise<HomeCopy> {
  const validated = validateHomeCopy(next)
  await setSetting(HOME_COPY_KEY, JSON.stringify(validated))
  return validated
}
