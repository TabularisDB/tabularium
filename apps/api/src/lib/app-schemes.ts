import { getSetting, setSetting } from './settings'
import { logger } from './logger'

const log = logger.child({ module: 'app-schemes' })

const KEY = 'registry.app_url_schemes'

export type AppUrlScheme = {
  /** Display name shown on the plugin detail page CTA (e.g. "Tabularis Desktop"). */
  name: string
  /** URL scheme registered by the desktop app (without "://" — e.g. "tabularis"). */
  scheme: string
  /** Optional kind filter — if set, this scheme only handles plugins of these kinds. */
  kinds?: string[]
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/

export function getAppUrlSchemes(): AppUrlScheme[] {
  const raw = getSetting(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidScheme)
  } catch (err) {
    log.warn({ err }, 'failed to parse app_url_schemes setting; returning empty list')
    return []
  }
}

function isValidScheme(value: unknown): value is AppUrlScheme {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.name !== 'string' || v.name.length === 0) return false
  if (typeof v.scheme !== 'string' || !SCHEME_PATTERN.test(v.scheme)) return false
  if (v.kinds !== undefined) {
    if (!Array.isArray(v.kinds)) return false
    if (!v.kinds.every((k) => typeof k === 'string' && k.length > 0)) return false
  }
  return true
}

export async function setAppUrlSchemes(schemes: AppUrlScheme[]): Promise<void> {
  const cleaned = schemes.filter(isValidScheme)
  await setSetting(KEY, JSON.stringify(cleaned))
}

/**
 * Pick the scheme that should handle a given plugin kind. Returns the first
 * scheme whose `kinds` includes the kind, OR the first scheme without a
 * `kinds` filter (a wildcard). Returns null if no scheme matches.
 */
export function pickSchemeForKind(schemes: AppUrlScheme[], kind: string): AppUrlScheme | null {
  for (const s of schemes) {
    if (s.kinds && s.kinds.includes(kind)) return s
  }
  for (const s of schemes) {
    if (!s.kinds) return s
  }
  return null
}
