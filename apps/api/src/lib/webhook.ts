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

const MIN_WEBHOOK_SECRET_LEN = 32

export async function verifyGithubSignature(
  secret: string,
  body: Buffer,
  signature: string,
): Promise<boolean> {
  if (!secret || secret.length < MIN_WEBHOOK_SECRET_LEN) return false
  if (!signature?.startsWith('sha256=')) return false
  const hasher = new Bun.CryptoHasher('sha256', secret)
  hasher.update(body)
  const expected = 'sha256=' + hasher.digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function verifyGitlabToken(secret: string, headerToken: string): boolean {
  if (!secret || secret.length < MIN_WEBHOOK_SECRET_LEN) return false
  if (!headerToken) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(headerToken)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type NormalizedRelease = {
  repoUrl: string
  published: boolean
  tag: string
  assets: Array<{ name: string; url: string }>
}

type GithubPayload = {
  action: string
  release: { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }
  repository: { html_url: string }
}

type GitlabPayload = {
  object_kind: string
  action?: string
  tag?: string
  ref?: string
  assets?: { links?: Array<{ name: string; url: string }> }
  project: { web_url: string }
}

export function parseGithubPayload(p: unknown): NormalizedRelease | null {
  const payload = p as GithubPayload
  if (!payload?.repository?.html_url || !payload.release?.tag_name) return null
  return {
    repoUrl: payload.repository.html_url,
    published: payload.action === 'published',
    tag: payload.release.tag_name,
    assets: (payload.release.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })),
  }
}

export function parseGitlabPayload(p: unknown): NormalizedRelease | null {
  const payload = p as GitlabPayload
  if (payload?.object_kind !== 'release' || !payload.project?.web_url) return null
  const tag = payload.tag ?? payload.ref?.replace(/^refs\/tags\//, '')
  if (!tag) return null
  return {
    repoUrl: payload.project.web_url,
    published: payload.action === 'create' || payload.action === 'update' || !payload.action,
    tag,
    assets: (payload.assets?.links ?? []).map((a) => ({ name: a.name, url: a.url })),
  }
}
