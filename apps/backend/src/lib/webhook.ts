import { timingSafeEqual } from 'node:crypto'

const PLATFORM_PATTERNS: Array<[RegExp, string]> = [
  [/linux[_-]arm64|arm64[_-]linux/i, 'linux-arm64'],
  [/linux[_-](x64|amd64)|amd64[_-]linux/i, 'linux-x64'],
  [/(darwin|macos)[_-]arm64|arm64[_-](darwin|macos)/i, 'darwin-arm64'],
  [/(darwin|macos)[_-](x64|amd64)/i, 'darwin-x64'],
  [/(win(dows)?)[_-](x64|amd64)/i, 'win-x64'],
  [/universal/i, 'universal'],
]

export function inferPlatformKey(filename: string): string | null {
  for (const [pattern, key] of PLATFORM_PATTERNS) {
    if (pattern.test(filename)) return key
  }
  return null
}

export async function verifyWebhookSignature(
  secret: string,
  body: Buffer,
  signature: string,
): Promise<boolean> {
  const hasher = new Bun.CryptoHasher('sha256', secret)
  hasher.update(body)
  const expected = 'sha256=' + hasher.digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
