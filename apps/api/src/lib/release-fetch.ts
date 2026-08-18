import type { NormalizedRelease } from './webhook'
import type { RepoRef } from './providers'
import { UpstreamUnauthorizedError } from './oauth-tokens'
import { compareSemver } from './semver'

// Pulls the newest release straight from the provider API, in the same shape
// the webhook handler would have ingested. Used wherever we need to materialize
// a release without an incoming hook (submit, preview, rehash, admin replay).
export async function fetchLatestRelease(accessToken: string, ref: RepoRef): Promise<NormalizedRelease | null> {
  const { instance } = ref
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
    return fetchGithubFlavored(apiBase, accessToken, ref, 'tabularium/1.0')
  }
  if (instance.kind === 'gitea') {
    return fetchGithubFlavored(`${instance.baseUrl}/api/v1`, accessToken, ref, null)
  }
  return fetchGitlab(instance.baseUrl, accessToken, ref)
}

type GithubRelease = {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
  html_url?: string
  assets?: Array<{ name: string; browser_download_url: string }>
}

// Lists releases instead of asking for /releases/latest: that endpoint skips
// every prerelease, so a plugin that only ships betas looks like it has no
// releases at all. Listing also keeps this in step with persistRelease, which
// ranks releases by semver — /releases/latest would pin a stable 1.0.0 as
// "latest" even after 1.1.0-beta.1 shipped, and the two would disagree about
// which version the registry considers current.
async function fetchGithubFlavored(
  apiBase: string,
  accessToken: string,
  ref: RepoRef,
  userAgent: string | null,
): Promise<NormalizedRelease | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
  }
  if (userAgent) headers['User-Agent'] = userAgent
  const res = await fetch(`${apiBase}/repos/${ref.owner}/${ref.repo}/releases?per_page=100`, { headers })
  if (res.status === 404) return null
  if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, 'releases')
  if (!res.ok) throw new Error(`Provider API ${res.status}`)
  const body = await res.json()
  const list: GithubRelease[] = Array.isArray(body) ? body : []
  const candidates = list.filter((r) => r.tag_name && !r.draft)
  if (candidates.length === 0) return null
  // Highest semver wins; equal or unparseable tags keep the provider's own
  // ordering, which is newest-first.
  const newest = candidates.reduce((best, r) =>
    compareSemver(stripV(r.tag_name as string), stripV(best.tag_name as string)) > 0 ? r : best,
  )
  return {
    repoUrl: newest.html_url?.replace(/\/releases\/.*$/, '') ?? `${ref.instance.baseUrl}/${ref.owner}/${ref.repo}`,
    published: !newest.draft,
    tag: newest.tag_name as string,
    assets: (newest.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })),
  }
}

function stripV(tag: string): string {
  return tag.replace(/^v/, '')
}

async function fetchGitlab(baseUrl: string, accessToken: string, ref: RepoRef): Promise<NormalizedRelease | null> {
  const projectId = encodeURIComponent(ref.fullName)
  const res = await fetch(`${baseUrl}/api/v4/projects/${projectId}/releases?per_page=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, 'releases')
  if (!res.ok) throw new Error(`GitLab API ${res.status}`)
  const body = await res.json()
  const list = (Array.isArray(body) ? body : []) as Array<{
    tag_name?: string
    upcoming_release?: boolean
    assets?: { links?: Array<{ name: string; url: string }> }
  }>
  const tagged = list.filter((r) => r.tag_name)
  if (tagged.length === 0) return null
  // Same semver ranking as the GitHub-flavored path above.
  const latest = tagged.reduce((best, r) =>
    compareSemver(stripV(r.tag_name as string), stripV(best.tag_name as string)) > 0 ? r : best,
  )
  return {
    repoUrl: `${baseUrl}/${ref.fullName}`,
    published: !latest.upcoming_release,
    tag: latest.tag_name as string,
    assets: (latest.assets?.links ?? []).map((l) => ({ name: l.name, url: l.url })),
  }
}
