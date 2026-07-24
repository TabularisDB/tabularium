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
  userAgent: string | null,
): Promise<OwnershipResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  if (userAgent) headers['User-Agent'] = userAgent
  const res = await fetch(`${apiBase}/repos/${ref.owner}/${ref.repo}`, { headers })
  if (res.status === 404) return { owned: false, reason: 'Repo not found' }
  if (!res.ok) return { owned: false, reason: `API error: ${res.status}` }
  const data = (await res.json()) as { permissions?: { admin?: boolean; maintain?: boolean } }
  // ponytail: maintain>=submit. GitHub owners have admin; Gitea has no `maintain`
  // field so admin is its ceiling equivalent. Drop `username` param when GitLab
  // path below is the last owner-based check to go.
  if (data.permissions?.maintain || data.permissions?.admin) return { owned: true }
  return { owned: false, reason: 'Requires maintain permission on the repo' }
}

async function checkGitlab(baseUrl: string, accessToken: string, ref: RepoRef): Promise<OwnershipResult> {
  const projectId = encodeURIComponent(ref.fullName)
  const res = await fetch(`${baseUrl}/api/v4/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return { owned: false, reason: 'Repo not found' }
  if (!res.ok) return { owned: false, reason: `GitLab API error: ${res.status}` }
  const data = (await res.json()) as {
    permissions?: { project_access?: { access_level?: number }; group_access?: { access_level?: number } }
  }
  // GitLab access levels: Maintainer=40, Owner=50. Group access covers inherited perms.
  const level = Math.max(
    data.permissions?.project_access?.access_level ?? 0,
    data.permissions?.group_access?.access_level ?? 0,
  )
  if (level >= 40) return { owned: true }
  return { owned: false, reason: 'Requires maintainer access on the project' }
}

export async function checkOwnership(accessToken: string, ref: RepoRef): Promise<OwnershipResult> {
  const { instance } = ref
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
    return checkGithubFlavored(apiBase, accessToken, ref, 'tabularium/1.0')
  }
  if (instance.kind === 'gitea') {
    return checkGithubFlavored(`${instance.baseUrl}/api/v1`, accessToken, ref, null)
  }
  return checkGitlab(instance.baseUrl, accessToken, ref)
}
