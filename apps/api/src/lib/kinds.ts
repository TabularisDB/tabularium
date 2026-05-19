import { getSetting, setSetting } from './settings'
import { validateExtensionsDelta, type ExtensionsDelta } from './manifest-schema'

export type KindPublicPageCopy = {
  hero: string | null
  intro: string | null
}

export type KindDef = {
  key: string
  label: string
  description: string | null
  extensionsSchema?: ExtensionsDelta | null
  /**
   * When true the registry serves a dedicated catalogue page at /c/:key
   * pre-filtered to plugins of this kind. Defaults to false.
   */
  publicPageEnabled?: boolean
  publicPageCopy?: KindPublicPageCopy | null
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

// Kind keys that would shadow an existing top-level public route.
// /:key is mounted under /c/ so this list is short — only the immediate
// children of /c (none yet) would collide.
const RESERVED_KIND_KEYS = new Set<string>([])

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

  if (RESERVED_KIND_KEYS.has(key)) {
    throw new KindError('invalid', `"${key}" is a reserved route — pick a different key`)
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
      publicPageCopy = hero || intro ? { hero, intro } : null
    }
  }

  return {
    key,
    label,
    description,
    ...(extensionsSchema !== undefined ? { extensionsSchema } : {}),
    ...(publicPageEnabled ? { publicPageEnabled } : {}),
    ...(publicPageCopy !== undefined ? { publicPageCopy } : {}),
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
