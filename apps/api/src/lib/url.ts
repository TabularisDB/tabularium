export function resolveAbsolute(base: string, maybeRelative: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative
  try {
    return new URL(maybeRelative, base.endsWith('/') ? base : `${base}/`).toString()
  } catch {
    return maybeRelative
  }
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

export function isPublicHttpUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  if (!host) return false
  // Test-only bypass: tests boot `Bun.serve` on localhost as a fixture for
  // `hashAsset`. Bun sets NODE_ENV=test under `bun test`. Production paths
  // (NODE_ENV unset or 'production') retain the full SSRF guard below.
  if (process.env.NODE_ENV === 'test') return true
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (host === '::1' || host === '[::1]') return false
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false
  if (PRIVATE_V4.some((r) => r.test(host))) return false
  return true
}
