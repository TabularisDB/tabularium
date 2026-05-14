import { logger } from './logger'

const log = logger.child({ module: 'asset' })

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

const MAX_BYTES = 200 * 1024 * 1024 // 200 MB upper bound for streaming hash

export async function hashAsset(url: string): Promise<{ sha256?: string; size?: number; reason?: string }> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return { reason: `HTTP ${res.status}` }
    const body = res.body
    if (!body) return { reason: 'no body' }

    const hasher = new Bun.CryptoHasher('sha256')
    let total = 0
    const reader = body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_BYTES) return { reason: 'asset exceeds 200MB cap' }
      hasher.update(value)
    }
    return { sha256: hasher.digest('hex'), size: total }
  } catch (err) {
    log.warn({ url, err }, 'asset hash failed')
    return { reason: err instanceof Error ? err.message : 'fetch failed' }
  }
}
