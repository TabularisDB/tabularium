import { logger } from './logger'
import { getSetting } from './settings'
import { isPublicHttpUrl } from './url'

const log = logger.child({ module: 'asset' })

const DEFAULT_ASSET_SIZE_CAP_BYTES = 500 * 1024 * 1024

export function getAssetSizeCap(): number {
  const raw = getSetting('registry.asset_size_cap_bytes')
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ASSET_SIZE_CAP_BYTES
}

export type AssetEntry = {
  url: string
  size?: number
  sha256?: string
}

export type AssetMap = Record<string, AssetEntry>

export function parseAssets(raw: string): AssetMap {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!json || typeof json !== 'object') return {}
  const out: AssetMap = {}
  for (const [platform, value] of Object.entries(json as Record<string, unknown>)) {
    if (typeof value === 'string') {
      out[platform] = { url: value }
      continue
    }
    if (value && typeof value === 'object' && typeof (value as AssetEntry).url === 'string') {
      out[platform] = value as AssetEntry
    }
  }
  return out
}

export function serializeAssets(map: AssetMap): string {
  return JSON.stringify(map)
}

const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 30_000

async function fetchWithGuards(initialUrl: string): Promise<Response> {
  let url = initialUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpUrl(url)) throw new Error(`blocked URL: ${url}`)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('redirect without location')
      url = new URL(loc, url).toString()
      continue
    }
    return res
  }
  throw new Error(`too many redirects (>${MAX_REDIRECTS})`)
}

export async function hashAsset(url: string): Promise<{ sha256?: string; size?: number; reason?: string }> {
  try {
    const res = await fetchWithGuards(url)
    if (!res.ok) return { reason: `HTTP ${res.status}` }
    const body = res.body
    if (!body) return { reason: 'no body' }

    const hasher = new Bun.CryptoHasher('sha256')
    let total = 0
    const cap = getAssetSizeCap()
    const reader = body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > cap) return { reason: `asset exceeds ${cap}-byte hash budget — release ingests without an integrity entry for this asset` }
      hasher.update(value)
    }
    return { sha256: hasher.digest('hex'), size: total }
  } catch (err) {
    log.warn({ url, err }, 'asset hash failed')
    return { reason: err instanceof Error ? err.message : 'fetch failed' }
  }
}
