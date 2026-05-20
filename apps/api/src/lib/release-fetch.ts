import type { NormalizedRelease } from './webhook'
import type { RepoRef } from './providers'
import { UpstreamUnauthorizedError } from './oauth-tokens'

/**
 * Pull the latest release directly from the provider API as if it had just arrived
 * via webhook. Used by the admin "replay" button when the webhook didn't fire / failed.
 */
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
  const res = await fetch(`${apiBase}/repos/${ref.owner}/${ref.repo}/releases/latest`, { headers })
  if (res.status === 404) return null
  if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, 'releases/latest')
  if (!res.ok) throw new Error(`Provider API ${res.status}`)
  const data = (await res.json()) as {
    tag_name?: string
    draft?: boolean
    prerelease?: boolean
    html_url?: string
    assets?: Array<{ name: string; browser_download_url: string }>
  }
  if (!data.tag_name) return null
  return {
    repoUrl: data.html_url?.replace(/\/releases\/.*$/, '') ?? `${ref.instance.baseUrl}/${ref.owner}/${ref.repo}`,
    published: !data.draft,
    tag: data.tag_name,
    assets: (data.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })),
  }
}

async function fetchGitlab(baseUrl: string, accessToken: string, ref: RepoRef): Promise<NormalizedRelease | null> {
  const projectId = encodeURIComponent(ref.fullName)
  const res = await fetch(`${baseUrl}/api/v4/projects/${projectId}/releases?per_page=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) throw new UpstreamUnauthorizedError(ref.instance.id, 'releases')
  if (!res.ok) throw new Error(`GitLab API ${res.status}`)
  const list = (await res.json()) as Array<{
    tag_name?: string
    upcoming_release?: boolean
    assets?: { links?: Array<{ name: string; url: string }> }
  }>
  const latest = list[0]
  if (!latest?.tag_name) return null
  return {
    repoUrl: `${baseUrl}/${ref.fullName}`,
    published: !latest.upcoming_release,
    tag: latest.tag_name,
    assets: (latest.assets?.links ?? []).map((l) => ({ name: l.name, url: l.url })),
  }
}
