import { createHash } from 'node:crypto'
import { cache } from './cache'
import type { ProviderInstance } from './provider-instance'
import { UpstreamUnauthorizedError } from './oauth-tokens'

export const REPO_PAGE_SIZES = { github: 100, gitlab: 50, gitea: 50 } as const

type Repo = Omit<SubmittableRepo, 'identityId'>
export type RepoPage = { repos: Repo[]; page: number; limit: number; total: number; hasMore: boolean }
type UpstreamPage = { repos: Repo[]; hasMore: boolean }

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
  permissions?: { admin?: boolean; maintain?: boolean }
  archived?: boolean
}

async function listGithubFlavored(
  apiBase: string,
  token: string,
  query: string,
  page: number,
  pageParam: string,
  pageSize: number,
  userAgent: string | null,
  instanceId: string,
): Promise<UpstreamPage> {
  const repos: Repo[] = []
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (userAgent) headers['User-Agent'] = userAgent

  const url = `${apiBase}${query}${query.includes('?') ? '&' : '?'}${pageParam}=${pageSize}&page=${page}`
  const res = await fetch(url, { headers })
  if (res.status === 401) throw new UpstreamUnauthorizedError(instanceId, 'user/repos')
  if (!res.ok) {
    throw new Error(`Repository API error: ${res.status}`)
  }
  const data = (await res.json()) as GithubFlavoredRepo[]
  if (!Array.isArray(data)) throw new Error('Invalid repository API response')
  for (const r of data) {
    if (r.archived) continue
    // ponytail: mirror checkOwnership — maintain+ submits. Gitea lacks `maintain`, admin is its ceiling.
    const writable = r.permissions?.admin || r.permissions?.maintain
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
  return { repos, hasMore: hasNextPage(res, data.length, pageSize) }
}

function hasNextPage(res: Response, count: number, pageSize: number): boolean {
  const link = res.headers.get('link')
  if (link !== null) return /rel="next"/.test(link)
  const nextPage = res.headers.get('x-next-page')
  if (nextPage !== null) return nextPage !== ''
  return count === pageSize
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

async function listGitlab(baseUrl: string, token: string, instanceId: string, page: number): Promise<UpstreamPage> {
  const repos: Repo[] = []
  const url = `${baseUrl}/api/v4/projects?membership=true&per_page=${REPO_PAGE_SIZES.gitlab}&page=${page}&order_by=last_activity_at&min_access_level=40`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new UpstreamUnauthorizedError(instanceId, 'projects')
  if (!res.ok) {
    throw new Error(`GitLab API error: ${res.status}`)
  }
  const data = (await res.json()) as GitlabProject[]
  if (!Array.isArray(data)) throw new Error('Invalid repository API response')
  for (const p of data) {
    if (p.archived) continue
    repos.push({
      providerInstanceId: instanceId,
      fullName: p.path_with_namespace,
      owner: p.path_with_namespace.split('/').slice(0, -1).join('/'),
      name: p.path,
      url: p.web_url,
      description: p.description?.trim() ? p.description : null,
      isPrivate: p.visibility !== 'public',
    })
  }
  return { repos, hasMore: hasNextPage(res, data.length, REPO_PAGE_SIZES.gitlab) }
}

async function upstreamPage(instance: ProviderInstance, token: string, page: number): Promise<UpstreamPage> {
  if (instance.kind === 'github') {
    const apiBase = instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
    return listGithubFlavored(
      apiBase,
      token,
      '/user/repos?affiliation=owner,organization_member,collaborator&sort=pushed',
      page,
      'per_page',
      REPO_PAGE_SIZES.github,
      'tabularium/1.0',
      instance.id,
    )
  }
  if (instance.kind === 'gitea') {
    return listGithubFlavored(
      `${instance.baseUrl}/api/v1`,
      token,
      '/user/repos',
      page,
      'limit',
      REPO_PAGE_SIZES.gitea,
      null,
      instance.id,
    )
  }
  return listGitlab(instance.baseUrl, token, instance.id, page)
}

export async function listReposFor(
  instance: ProviderInstance,
  token: string,
  options: { search?: string; page?: number } = {},
): Promise<RepoPage> {
  const search = options.search?.trim().toLowerCase() ?? ''
  if (search && search.length < 3) throw new Error('Repository search requires at least 3 characters')
  const page = options.page ?? 1
  const limit = REPO_PAGE_SIZES[instance.kind]
  const offset = (page - 1) * limit
  const repos: Repo[] = []
  let matched = 0
  // Cache provider pages, rather than search results, so typing a new query
  // reuses the same private catalogue. Credential changes get a fresh cache.
  const scope = createHash('sha256').update(`${instance.kind}:${instance.baseUrl}:${limit}:${token}`).digest('hex')
  for (let upstream = 1; ; upstream++) {
    const key = `submit:repos:${instance.id}:${scope}:${upstream}`
    let result = await cache().get<UpstreamPage>(key)
    if (!result) {
      result = await upstreamPage(instance, token, upstream)
      await cache().set(key, result, 60)
    }
    for (const repo of result.repos) {
      if (
        search &&
        !repo.fullName.toLowerCase().includes(search) &&
        !repo.description?.toLowerCase().includes(search)
      ) {
        continue
      }
      if (matched++ < offset) continue
      if (repos.length < limit) repos.push(repo)
    }
    // Count every eligible match, including those outside the requested page.
    if (!result.hasMore) {
      return { repos, page, limit, total: matched, hasMore: matched > offset + repos.length }
    }
  }
}
