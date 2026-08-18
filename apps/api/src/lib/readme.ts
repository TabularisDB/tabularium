// README storage is either plain markdown or a JSON locale map (written when
// the manifest declares `readmes`). Both the plugin column and the per-release
// column use that shape, so one reader serves both.
export function pickReadme(
  raw: string | null,
  preferredLocale: string | undefined,
): { markdown: string | null; locale: string | null; available: string[] } {
  if (!raw) return { markdown: null, locale: null, available: [] }
  if (!raw.startsWith('{')) return { markdown: raw, locale: null, available: [] }
  try {
    const map = JSON.parse(raw) as Record<string, unknown>
    const available = Object.keys(map).filter((k) => typeof map[k] === 'string')
    if (available.length === 0) return { markdown: null, locale: null, available: [] }
    const pick = (locale: string | undefined): string | null => {
      if (locale && typeof map[locale] === 'string') return locale
      return null
    }
    const baseLocale = preferredLocale?.split('-')[0]
    const chosen = pick(preferredLocale) ?? pick(baseLocale) ?? pick('en') ?? available[0]
    return { markdown: map[chosen] as string, locale: chosen, available }
  } catch {
    return { markdown: raw, locale: null, available: [] }
  }
}

export const README_TTL = 600
