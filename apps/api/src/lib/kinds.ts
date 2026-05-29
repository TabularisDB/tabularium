import { parse as yamlParse } from 'yaml'
import { getSetting, setSetting } from './settings'
import { validateExtensionsDelta, type ExtensionsDelta } from './extensions-schema'
import { SUPPORTED_LOCALES, getI18nConfig, type Locale } from './i18n'

type LocalizedString = Partial<Record<Locale, string>>

export type KindPublicPageCopy = {
  hero: string | null
  heroTranslations?: LocalizedString
  intro: string | null
  introTranslations?: LocalizedString
}

export type KindDef = {
  key: string
  label: string
  labelTranslations?: LocalizedString
  description: string | null
  descriptionTranslations?: LocalizedString
  extensionsSchema?: ExtensionsDelta | null
  /**
   * When true the registry serves a dedicated catalogue page at /c/:key
   * pre-filtered to plugins of this kind. Defaults to false.
   */
  publicPageEnabled?: boolean
  publicPageCopy?: KindPublicPageCopy | null
  prosePre?: string | null
  prosePreTranslations?: LocalizedString
  prosePost?: string | null
  prosePostTranslations?: LocalizedString
  customExample?: { yaml?: string; json?: string } | null
}

export type KindErrorCode = 'invalid' | 'duplicate' | 'not_found'

export class KindError extends Error {
  constructor(
    public code: KindErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'KindError'
  }
}

const SETTINGS_KEY = 'plugin_kinds'
const MAX_ENTRIES = 64
const KEY_RE = /^[a-z0-9][a-z0-9-]*$/
const KEY_MAX = 40
const LABEL_MAX = 60
const DESC_MAX = 280
const HERO_MAX = 80
const INTRO_MAX = 600
const PROSE_MAX = Number.MAX_SAFE_INTEGER
const EXAMPLE_MAX = Number.MAX_SAFE_INTEGER

function validateTranslationMap(value: unknown, max: number, field: string): LocalizedString | undefined {
  if (value === undefined) return undefined
  if (value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new KindError('invalid', `${field} must be an object of locale→string`)
  }
  const out: LocalizedString = {}
  for (const [locale, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
      throw new KindError('invalid', `${field}: unsupported locale "${locale}"`)
    }
    if (raw === undefined || raw === null || raw === '') continue
    if (typeof raw !== 'string') {
      throw new KindError('invalid', `${field}.${locale} must be a string`)
    }
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue
    if (trimmed.length > max) {
      throw new KindError('invalid', `${field}.${locale} max ${max} chars`)
    }
    out[locale as Locale] = trimmed
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function validateCustomExample(value: unknown): { yaml?: string; json?: string } | undefined {
  if (value === undefined) return undefined
  if (value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new KindError('invalid', 'customExample must be an object with optional yaml + json strings')
  }
  const obj = value as Record<string, unknown>
  const out: { yaml?: string; json?: string } = {}

  if (obj.yaml !== undefined && obj.yaml !== null) {
    if (typeof obj.yaml !== 'string') {
      throw new KindError('invalid', 'customExample.yaml must be a string')
    }
    const trimmed = obj.yaml.trim()
    if (trimmed.length > 0) {
      if (trimmed.length > EXAMPLE_MAX) {
        throw new KindError('invalid', `customExample.yaml max ${EXAMPLE_MAX} chars`)
      }
      try {
        yamlParse(trimmed)
      } catch (err) {
        throw new KindError('invalid', `customExample.yaml: invalid YAML — ${(err as Error).message}`)
      }
      out.yaml = obj.yaml
    }
  }

  if (obj.json !== undefined && obj.json !== null) {
    if (typeof obj.json !== 'string') {
      throw new KindError('invalid', 'customExample.json must be a string')
    }
    const trimmed = obj.json.trim()
    if (trimmed.length > 0) {
      if (trimmed.length > EXAMPLE_MAX) {
        throw new KindError('invalid', `customExample.json max ${EXAMPLE_MAX} chars`)
      }
      try {
        JSON.parse(trimmed)
      } catch (err) {
        throw new KindError('invalid', `customExample.json: invalid JSON — ${(err as Error).message}`)
      }
      out.json = obj.json
    }
  }

  if (out.yaml === undefined && out.json === undefined) return undefined
  return out
}

export function validateKindDef(input: unknown): KindDef {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new KindError('invalid', 'kind definition must be an object')
  }
  const o = input as Record<string, unknown>
  const key = typeof o.key === 'string' ? o.key.trim() : ''
  const label = typeof o.label === 'string' ? o.label.trim() : ''
  const descRaw = o.description
  if (!key || key.length > KEY_MAX || !KEY_RE.test(key)) {
    throw new KindError('invalid', `key must match ${KEY_RE} (max ${KEY_MAX} chars)`)
  }
  if (!label || label.length > LABEL_MAX) {
    throw new KindError('invalid', `label must be 1..${LABEL_MAX} chars`)
  }
  let description: string | null
  if (descRaw === undefined || descRaw === null || descRaw === '') {
    description = null
  } else if (typeof descRaw !== 'string') {
    throw new KindError('invalid', 'description must be string or null')
  } else if (descRaw.length > DESC_MAX) {
    throw new KindError('invalid', `description max ${DESC_MAX} chars`)
  } else {
    description = descRaw
  }
  const labelTranslations = validateTranslationMap(o.labelTranslations, LABEL_MAX, 'labelTranslations')
  const descriptionTranslations = validateTranslationMap(o.descriptionTranslations, DESC_MAX, 'descriptionTranslations')
  let extensionsSchema: ExtensionsDelta | null | undefined
  if (o.extensionsSchema !== undefined) {
    if (o.extensionsSchema === null) {
      extensionsSchema = null
    } else {
      try {
        const cleaned = validateExtensionsDelta(o.extensionsSchema)
        extensionsSchema = Object.keys(cleaned).length > 0 ? cleaned : null
      } catch (err) {
        throw new KindError('invalid', err instanceof Error ? err.message : 'invalid extensionsSchema')
      }
    }
  }

  const publicPageEnabled = o.publicPageEnabled === true

  let publicPageCopy: KindPublicPageCopy | null | undefined
  if (o.publicPageCopy !== undefined) {
    if (o.publicPageCopy === null) {
      publicPageCopy = null
    } else if (!o.publicPageCopy || typeof o.publicPageCopy !== 'object' || Array.isArray(o.publicPageCopy)) {
      throw new KindError('invalid', 'publicPageCopy must be object or null')
    } else {
      const copy = o.publicPageCopy as Record<string, unknown>
      const hero = trimOrNull(copy.hero, HERO_MAX, 'publicPageCopy.hero')
      const intro = trimOrNull(copy.intro, INTRO_MAX, 'publicPageCopy.intro')
      const heroTranslations = validateTranslationMap(
        copy.heroTranslations,
        HERO_MAX,
        'publicPageCopy.heroTranslations',
      )
      const introTranslations = validateTranslationMap(
        copy.introTranslations,
        INTRO_MAX,
        'publicPageCopy.introTranslations',
      )
      publicPageCopy =
        hero || intro || heroTranslations || introTranslations
          ? {
              hero,
              intro,
              ...(heroTranslations ? { heroTranslations } : {}),
              ...(introTranslations ? { introTranslations } : {}),
            }
          : null
    }
  }

  const prosePre = trimOrNull(o.prosePre, PROSE_MAX, 'prosePre')
  const prosePreTranslations = validateTranslationMap(o.prosePreTranslations, PROSE_MAX, 'prosePreTranslations')
  const prosePost = trimOrNull(o.prosePost, PROSE_MAX, 'prosePost')
  const prosePostTranslations = validateTranslationMap(o.prosePostTranslations, PROSE_MAX, 'prosePostTranslations')
  const customExample = validateCustomExample(o.customExample)

  return {
    key,
    label,
    ...(labelTranslations ? { labelTranslations } : {}),
    description,
    ...(descriptionTranslations ? { descriptionTranslations } : {}),
    ...(extensionsSchema !== undefined ? { extensionsSchema } : {}),
    ...(publicPageEnabled ? { publicPageEnabled } : {}),
    ...(publicPageCopy !== undefined ? { publicPageCopy } : {}),
    ...(prosePre !== null ? { prosePre } : {}),
    ...(prosePreTranslations ? { prosePreTranslations } : {}),
    ...(prosePost !== null ? { prosePost } : {}),
    ...(prosePostTranslations ? { prosePostTranslations } : {}),
    ...(customExample !== undefined ? { customExample } : {}),
  }
}

function trimOrNull(value: unknown, max: number, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    throw new KindError('invalid', `${field} must be string or null`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > max) {
    throw new KindError('invalid', `${field} max ${max} chars`)
  }
  return trimmed
}

export function getKinds(): KindDef[] {
  const raw = getSetting(SETTINGS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        try {
          return validateKindDef(item)
        } catch {
          return null
        }
      })
      .filter((x): x is KindDef => x !== null)
  } catch {
    return []
  }
}

export function getKind(key: string): KindDef | null {
  return getKinds().find((k) => k.key === key) ?? null
}

export function isKindKey(key: string): boolean {
  return getKinds().some((k) => k.key === key)
}

async function writeKinds(next: KindDef[]): Promise<void> {
  if (next.length > MAX_ENTRIES) {
    throw new KindError('invalid', `at most ${MAX_ENTRIES} kinds allowed`)
  }
  await setSetting(SETTINGS_KEY, JSON.stringify(next))
}

export async function createKind(def: KindDef): Promise<KindDef> {
  const v = validateKindDef(def)
  const current = getKinds()
  if (current.some((k) => k.key === v.key)) {
    throw new KindError('duplicate', `kind "${v.key}" already exists`)
  }
  await writeKinds([...current, v])
  return v
}

export async function updateKind(key: string, def: KindDef): Promise<KindDef> {
  const v = validateKindDef(def)
  if (v.key !== key) {
    throw new KindError('invalid', 'body key must match path key')
  }
  const current = getKinds()
  const idx = current.findIndex((k) => k.key === key)
  if (idx === -1) throw new KindError('not_found', `kind "${key}" not found`)
  const next = current.slice()
  next[idx] = v
  await writeKinds(next)
  return v
}

export async function deleteKind(key: string): Promise<void> {
  const current = getKinds()
  if (!current.some((k) => k.key === key)) {
    throw new KindError('not_found', `kind "${key}" not found`)
  }
  await writeKinds(current.filter((k) => k.key !== key))
}

export type LocalizedKindView = {
  key: string
  label: string
  description: string | null
  publicPageEnabled: boolean
  publicPageCopy: { hero: string | null; intro: string | null } | null
  extensionsSchema: ExtensionsDelta | null
  prosePre: string | null
  prosePost: string | null
  customExample: { yaml?: string; json?: string } | null
}

function pickLocalized<T extends string | null>(base: T, map: LocalizedString | undefined, locale: Locale): T | string {
  const defaultLocale = getI18nConfig().defaultLocale
  const v = map?.[locale] ?? (locale !== defaultLocale ? map?.[defaultLocale] : undefined)
  return typeof v === 'string' && v.length > 0 ? v : base
}

function resolveKind(def: KindDef, locale: Locale): LocalizedKindView {
  return {
    key: def.key,
    label: pickLocalized(def.label, def.labelTranslations, locale),
    description: pickLocalized(def.description, def.descriptionTranslations, locale),
    publicPageEnabled: def.publicPageEnabled ?? false,
    publicPageCopy: def.publicPageCopy
      ? {
          hero: pickLocalized(def.publicPageCopy.hero, def.publicPageCopy.heroTranslations, locale),
          intro: pickLocalized(def.publicPageCopy.intro, def.publicPageCopy.introTranslations, locale),
        }
      : null,
    extensionsSchema: def.extensionsSchema ?? null,
    prosePre: pickLocalized(def.prosePre ?? null, def.prosePreTranslations, locale),
    prosePost: pickLocalized(def.prosePost ?? null, def.prosePostTranslations, locale),
    customExample: def.customExample ?? null,
  }
}

export function getLocalizedKind(key: string, locale: Locale): LocalizedKindView | null {
  const def = getKind(key)
  return def ? resolveKind(def, locale) : null
}

export function listLocalizedKinds(locale: Locale): LocalizedKindView[] {
  return getKinds().map((def) => resolveKind(def, locale))
}
