import { findInstanceByBaseUrl, type ProviderInstance } from './provider-instance'

export type RepoRef = {
  instance: ProviderInstance
  owner: string
  repo: string
  fullName: string
}

export function parseRepoUrl(repoUrl: string): RepoRef | null {
  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const instance = findInstanceByBaseUrl(url.origin)
  if (!instance || !instance.enabled) return null

  const parts = url.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)
  if (parts.length < 2) return null

  // GitLab supports nested groups; the last segment is the project, everything
  // before it is the namespace path.
  const repo = parts[parts.length - 1]
  const owner = instance.kind === 'gitlab' ? parts.slice(0, -1).join('/') : parts[parts.length - 2]
  return { instance, owner, repo, fullName: `${owner}/${repo}` }
}

export type OwnershipResult = { owned: true } | { owned: false; reason: string }

async function checkGithubFlavored(
  apiBase: string,
  accessToken: string,
  ref: RepoRef,
  username: string,
  userAgent: string | null,
): Promise<OwnershipResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  if (userAgent) headers['User-Agent'] = userAgent
  const res = await fetch(`${apiBase}/repos/${ref.owner}/${ref.repo}`, { headers })
  if (res.status === 404) return { owned: false, reason: 'Repo not found' }
  if (!res.ok) return { owned: false, reason: `API error: ${res.status}` }
  const data = (await res.json()) as { owner?: { login?: string } }
  if (data.owner?.login?.toLowerCase() !== username.toLowerCase()) {
    return { owned: false, reason: 'Repo does not belong to authenticated user' }
  }
  return { owned: true }
}

async function checkGitlab(
  baseUrl: string,
  accessToken: string,
  ref: RepoRef,
  username: string,
): Promise<OwnershipResult> {
  const projectId = encodeURIComponent(ref.fullName)
  const res = await fetch(`${baseUrl}/api/v4/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return { owned: false, reason: 'Repo not found' }
  if (!res.ok) return { owned: false, reason: `GitLab API error: ${res.status}` }
  const data = (await res.json()) as { namespace?: { path?: string; kind?: string } }
  if (data.namespace?.kind === 'user' && data.namespace.path?.toLowerCase() === username.toLowerCase()) {
    return { owned: true }
  }
  return { owned: false, reason: 'Repo does not belong to authenticated user' }
}

export async function checkOwnership(accessToken: string, ref: RepoRef, username: string): Promise<OwnershipResult> {
  const { instance } = ref
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
    return checkGithubFlavored(apiBase, accessToken, ref, username, 'tabularium/1.0')
  }
  if (instance.kind === 'gitea') {
    return checkGithubFlavored(`${instance.baseUrl}/api/v1`, accessToken, ref, username, null)
  }
  return checkGitlab(instance.baseUrl, accessToken, ref, username)
}
