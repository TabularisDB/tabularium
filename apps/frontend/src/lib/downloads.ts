export type VersionDownloadStatistics = {
  version: string
  total: number
  platforms: Record<string, number>
}

export type DownloadStatistics = {
  total: number
  versions: VersionDownloadStatistics[]
}

export type DownloadStatisticsResult = { status: 'ready'; data: DownloadStatistics } | { status: 'unavailable' }

export type DownloadStatisticsState = DownloadStatisticsResult | { status: 'loading' }

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseDownloadStatistics(value: unknown): DownloadStatistics | null {
  if (!isRecord(value) || !isCount(value.total) || !Array.isArray(value.versions)) return null
  const versions: VersionDownloadStatistics[] = []
  for (const entry of value.versions) {
    if (
      !isRecord(entry) ||
      typeof entry.version !== 'string' ||
      !entry.version ||
      !isCount(entry.total) ||
      !isRecord(entry.platforms)
    ) {
      return null
    }
    const platforms: Record<string, number> = {}
    for (const [platform, count] of Object.entries(entry.platforms)) {
      if (!isCount(count)) return null
      // Preserve keys as own data properties, including unexpected API keys.
      Object.defineProperty(platforms, platform, { value: count, enumerable: true })
    }
    versions.push({ version: entry.version, total: entry.total, platforms })
  }
  return { total: value.total, versions }
}

/** Inject the read-only statistics request; never resolve a tracked download here. */
export async function fetchDownloadStatistics(
  request: () => Promise<{ data?: unknown; error?: unknown }>,
): Promise<DownloadStatisticsResult> {
  try {
    const response = await request()
    if (response.error != null) return { status: 'unavailable' }
    const data = parseDownloadStatistics(response.data)
    return data ? { status: 'ready', data } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/** Missing/invalid counters are not zero; compact output remains locale-aware. */
export function formatDownloadCount(count: number | null | undefined, locale = 'en', compact = true): string {
  if (!isCount(count)) return '—'
  return new Intl.NumberFormat(locale, {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(count)
}
