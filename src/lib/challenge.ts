import { timingSafeEqual } from 'node:crypto'

export function generateChallengeToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('hex')
}

type FetchResult =
  | { ok: true; token: string }
  | { ok: false; error: string }

export async function fetchChallengeToken(repoUrl: string): Promise<FetchResult> {
  const normalized = repoUrl.replace(/\/$/, '')
  const paths = [
    `${normalized}/raw/main/.tabularis`,
    `${normalized}/raw/main/tabularis.json`,
    `${normalized}/raw/master/.tabularis`,
    `${normalized}/raw/master/tabularis.json`,
  ]

  for (const path of paths) {
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const text = (await res.text()).trim()

      if (path.endsWith('tabularis.json')) {
        try {
          const json = JSON.parse(text)
          if (typeof json.tabularis_token === 'string') {
            return { ok: true, token: json.tabularis_token }
          }
        } catch {
          continue
        }
      } else {
        return { ok: true, token: text }
      }
    } catch {
      continue
    }
  }

  return { ok: false, error: 'Could not fetch .tabularis or tabularis.json from repo' }
}

export function tokensMatch(stored: string, fetched: string): boolean {
  const norm = fetched.trim()
  if (stored.length !== norm.length) return false
  return timingSafeEqual(Buffer.from(stored), Buffer.from(norm))
}
