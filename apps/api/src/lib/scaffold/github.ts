import type { ProviderInstance } from '$lib/provider-instance'
import type { ScaffoldFile } from './generate'

export class GithubScaffoldError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function apiBase(instance: ProviderInstance): string {
  return instance.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${instance.baseUrl}/api/v3`
}

function client(instance: ProviderInstance, token: string) {
  const base = apiBase(instance)
  return async function gh<T>(method: string, path: string, body?: unknown): Promise<{ data: T; res: Response }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'tabularium/1.0',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const data = (text ? JSON.parse(text) : null) as T
    if (!res.ok) {
      const message = (data as { message?: string } | null)?.message ?? `GitHub returned ${res.status}`
      throw new GithubScaffoldError(message, res.status)
    }
    return { data, res }
  }
}

/**
 * Scopes granted to a classic OAuth token, from `X-OAuth-Scopes`. `null` when
 * GitHub does not report them (e.g. GitHub App user tokens), in which case the
 * push itself is the only check.
 */
export async function grantedScopes(
  instance: ProviderInstance,
  token: string,
): Promise<{ login: string; scopes: string[] | null }> {
  const { data, res } = await client(instance, token)<{ login: string }>('GET', '/user')
  const header = res.headers.get('x-oauth-scopes')
  return {
    login: data.login,
    scopes:
      header === null
        ? null
        : header
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
  }
}

export type RepoOwner = { login: string; type: 'user' | 'org'; avatarUrl: string | null }

/** The user's own account, then every org they belong to (needs `read:org` for private memberships). */
export async function listGithubOwners(instance: ProviderInstance, token: string): Promise<RepoOwner[]> {
  const gh = client(instance, token)
  type Account = { login: string; avatar_url?: string }
  const { data: me } = await gh<Account>('GET', '/user')
  const { data: orgs } = await gh<Account[]>('GET', '/user/orgs?per_page=100')
  return [
    { login: me.login, type: 'user' as const, avatarUrl: me.avatar_url ?? null },
    ...orgs
      .map((o) => ({ login: o.login, type: 'org' as const, avatarUrl: o.avatar_url ?? null }))
      .sort((a, b) => a.login.localeCompare(b.login)),
  ]
}

export type CreatedRepo = { owner: string; name: string; fullName: string; htmlUrl: string; defaultBranch: string }

/**
 * Create a repository and push `files` as its single initial commit. The repo
 * is created with an auto-generated first commit (the Git Data API cannot
 * write to an empty repository), which the scaffold commit then replaces.
 */
export async function createRepoWithFiles(
  instance: ProviderInstance,
  token: string,
  opts: { login: string; owner?: string; name: string; description: string; private: boolean; homepage?: string },
  files: ScaffoldFile[],
  message: string,
): Promise<CreatedRepo> {
  const gh = client(instance, token)
  const inOrg = opts.owner && opts.owner.toLowerCase() !== opts.login.toLowerCase()
  const { data: repo } = await gh<{
    name: string
    full_name: string
    html_url: string
    default_branch: string
    owner: { login: string }
  }>('POST', inOrg ? `/orgs/${encodeURIComponent(opts.owner!)}/repos` : '/user/repos', {
    name: opts.name,
    description: opts.description.slice(0, 350),
    homepage: opts.homepage,
    private: opts.private,
    auto_init: true,
  })
  const path = `/repos/${repo.owner.login}/${repo.name}`

  const tree = []
  for (const file of files) {
    const { data: blob } = await gh<{ sha: string }>('POST', `${path}/git/blobs`, {
      content: file.content.toString('base64'),
      encoding: 'base64',
    })
    tree.push({ path: file.path, mode: file.executable ? '100755' : '100644', type: 'blob', sha: blob.sha })
  }
  const { data: newTree } = await gh<{ sha: string }>('POST', `${path}/git/trees`, { tree })
  const { data: commit } = await gh<{ sha: string }>('POST', `${path}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [],
  })
  await gh('PATCH', `${path}/git/refs/heads/${encodeURIComponent(repo.default_branch)}`, {
    sha: commit.sha,
    force: true,
  })

  return {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
  }
}
