import { logger } from './logger'
import type { ProviderInstance } from './provider-instance'

const log = logger.child({ module: 'list-repos' })

export type SubmittableRepo = {
  identityId: string
  providerInstanceId: string
  fullName: string
  owner: string
  name: string
  url: string
  description: string | null
  isPrivate: boolean
}

type GithubFlavoredRepo = {
  full_name: string
  html_url: string
  name: string
  description: string | null
  private: boolean
  owner: { login: string }
  permissions?: { admin?: boolean; push?: boolean }
  archived?: boolean
}

async function listGithubFlavored(
  apiBase: string,
  token: string,
  query: string,
  pageSize: number,
  maxPages: number,
  userAgent: string | null,
  instanceId: string,
): Promise<Omit<SubmittableRepo, 'identityId'>[]> {
  const repos: Omit<SubmittableRepo, 'identityId'>[] = []
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (userAgent) headers['User-Agent'] = userAgent

  for (let page = 1; page <= maxPages; page++) {
    const url = `${apiBase}${query}${query.includes('?') ? '&' : '?'}per_page=${pageSize}&page=${page}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      log.warn({ url, status: res.status }, 'repos api error')
      break
    }
    const data = (await res.json()) as GithubFlavoredRepo[]
    if (!Array.isArray(data) || data.length === 0) break
    for (const r of data) {
      if (r.archived) continue
      const writable = r.permissions?.admin || r.permissions?.push
      if (r.permissions && !writable) continue
      repos.push({
        providerInstanceId: instanceId,
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        url: r.html_url,
        description: r.description?.trim() ? r.description : null,
        isPrivate: r.private,
      })
    }
    if (data.length < pageSize) break
  }
  return repos
}

type GitlabProject = {
  id: number
  path_with_namespace: string
  web_url: string
  name: string
  path: string
  description: string | null
  visibility: 'private' | 'internal' | 'public'
  archived: boolean
  namespace: { path: string; kind: 'user' | 'group' }
}

async function listGitlab(
  baseUrl: string,
  token: string,
  instanceId: string,
): Promise<Omit<SubmittableRepo, 'identityId'>[]> {
  const repos: Omit<SubmittableRepo, 'identityId'>[] = []
  for (let page = 1; page <= 4; page++) {
    const url = `${baseUrl}/api/v4/projects?membership=true&per_page=50&page=${page}&order_by=last_activity_at&min_access_level=40`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      log.warn({ url, status: res.status }, 'gitlab api error')
      break
    }
    const data = (await res.json()) as GitlabProject[]
    if (!Array.isArray(data) || data.length === 0) break
    for (const p of data) {
      if (p.archived) continue
      repos.push({
        providerInstanceId: instanceId,
        fullName: p.path_with_namespace,
        owner: p.namespace.path,
        name: p.path,
        url: p.web_url,
        description: p.description?.trim() ? p.description : null,
        isPrivate: p.visibility !== 'public',
      })
    }
    if (data.length < 50) break
  }
  return repos
}

export async function listReposFor(
  instance: ProviderInstance,
  token: string,
): Promise<Omit<SubmittableRepo, 'identityId'>[]> {
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com'
      ? 'https://api.github.com'
      : `${instance.baseUrl}/api/v3`
    return listGithubFlavored(
      apiBase, token,
      '/user/repos?affiliation=owner,organization_member,collaborator&sort=pushed',
      100, 3, 'pluggr/1.0', instance.id,
    )
  }
  if (instance.kind === 'gitea') {
    return listGithubFlavored(`${instance.baseUrl}/api/v1`, token, '/user/repos', 50, 4, null, instance.id)
  }
  return listGitlab(instance.baseUrl, token, instance.id)
}
