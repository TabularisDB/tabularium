import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { initCache } from '../../src/lib/cache'
import { listReposFor } from '../../src/lib/list-repos'
import { UpstreamUnauthorizedError } from '../../src/lib/oauth-tokens'
import type { ProviderInstance } from '../../src/lib/provider-instance'

const github: ProviderInstance = {
  id: 'github',
  kind: 'github',
  displayName: 'GitHub',
  baseUrl: 'https://github.com',
  clientId: '',
  clientSecret: '',
  logoUrl: null,
  enabled: true,
}

function repo(index: number, overrides = {}) {
  return {
    full_name: `alice/plugin-${index}`,
    html_url: `https://github.com/alice/plugin-${index}`,
    name: `plugin-${index}`,
    description: null,
    private: false,
    owner: { login: 'alice' },
    permissions: { maintain: true },
    ...overrides,
  }
}

describe('server-side repository search and pagination', () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>

  beforeEach(() => {
    initCache()
    fetchSpy = spyOn(globalThis, 'fetch')
  })

  afterEach(() => fetchSpy.mockRestore())

  function catalogue(repos: unknown[]) {
    fetchSpy.mockImplementation((async (input) => {
      const url = new URL(String(input))
      const size = Number(url.searchParams.get('per_page') ?? url.searchParams.get('limit'))
      expect([50, 100]).toContain(size)
      const page = Number(url.searchParams.get('page'))
      return Response.json(repos.slice((page - 1) * size, page * size))
    }) as typeof fetch)
  }

  it('returns at most 100 GitHub repos and paginates without overlaps or a 300-repo ceiling', async () => {
    catalogue(Array.from({ length: 351 }, (_, index) => repo(index)))
    const first = await listReposFor(github, 'token')
    expect(first.repos).toHaveLength(100)
    expect(first).toMatchObject({ page: 1, limit: 100, total: 351, hasMore: true })
    const second = await listReposFor(github, 'token', { page: 2 })
    expect(second.repos).toHaveLength(100)
    expect(second.repos[0].name).toBe('plugin-100')
    expect(second.total).toBe(351)
    const last = await listReposFor(github, 'token', { page: 4 })
    expect(last.repos.map((r) => r.name)).toEqual(Array.from({ length: 51 }, (_, index) => `plugin-${300 + index}`))
    expect(last.hasMore).toBe(false)
    expect(last.total).toBe(351)
    expect(await listReposFor(github, 'token', { page: 5 })).toMatchObject({
      repos: [],
      total: 351,
      hasMore: false,
    })
  })

  it('finds names and descriptions beyond the former cap, case-insensitively', async () => {
    const repos = Array.from({ length: 1001 }, (_, index) => repo(index))
    repos[900] = repo(900, { full_name: 'org/target-plugin', name: 'target-plugin' })
    repos[1000] = repo(1000, { description: 'A TARGET database connector' })
    catalogue(repos)
    const result = await listReposFor(github, 'token', { search: '  TaRgEt  ' })
    expect(result.repos.map((r) => r.name)).toEqual(['target-plugin', 'plugin-1000'])
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(11)
  })

  it('paginates matches after excluding archived and non-maintainable repositories', async () => {
    catalogue(
      Array.from({ length: 351 }, (_, index) =>
        repo(index, {
          archived: index < 300,
          permissions: index === 301 ? { push: true } : { maintain: true },
        }),
      ),
    )
    const result = await listReposFor(github, 'token', { search: 'plugin' })
    expect(result.repos).toHaveLength(50)
    expect(result.repos[0].name).toBe('plugin-300')
    expect(result.repos.at(-1)?.name).toBe('plugin-350')
    expect(result.total).toBe(50)
    expect(result.hasMore).toBe(false)
  })

  it('paginates filtered search results rather than provider pages', async () => {
    catalogue(
      Array.from({ length: 607 }, (_, index) =>
        repo(index, {
          description: index % 3 === 0 ? 'matching connector' : null,
        }),
      ),
    )
    const first = await listReposFor(github, 'token', { search: 'matching' })
    const second = await listReposFor(github, 'token', { search: 'matching', page: 2 })
    const last = await listReposFor(github, 'token', { search: 'matching', page: 3 })
    expect(first.repos).toHaveLength(100)
    expect(second.repos).toHaveLength(100)
    expect(second.repos[0].name).toBe('plugin-300')
    expect([first.total, second.total, last.total]).toEqual([203, 203, 203])
    expect(last.repos.map((r) => r.name)).toEqual(['plugin-600', 'plugin-603', 'plugin-606'])
    expect(last.hasMore).toBe(false)
  })

  it('reuses cached provider pages for different searches, isolated by credentials', async () => {
    catalogue(Array.from({ length: 120 }, (_, index) => repo(index)))
    await listReposFor(github, 'alice-token', { search: 'missing' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    await listReposFor(github, 'alice-token', { search: 'plugin-119' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    await listReposFor(github, 'bob-token', { search: 'plugin-119' })
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('does not claim another page exists when exactly 100 eligible repos remain', async () => {
    catalogue(Array.from({ length: 100 }, (_, index) => repo(index)))
    expect((await listReposFor(github, 'token')).hasMore).toBe(false)
  })

  it('returns an empty final page for a search with no matches', async () => {
    catalogue(Array.from({ length: 125 }, (_, index) => repo(index)))
    expect(await listReposFor(github, 'token', { search: 'missing' })).toMatchObject({
      repos: [],
      total: 0,
      hasMore: false,
    })
  })

  it('rejects short searches before contacting the provider', async () => {
    for (const search of ['a', 'ab', '  ab  ']) {
      await expect(listReposFor(github, 'token', { search })).rejects.toThrow('at least 3 characters')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('propagates upstream errors instead of returning a silently incomplete list', async () => {
    fetchSpy.mockResolvedValue(new Response('rate limited', { status: 403 }))
    await expect(listReposFor(github, 'token')).rejects.toThrow('Repository API error: 403')
  })

  it('preserves reauthentication handling', async () => {
    fetchSpy.mockResolvedValue(new Response('expired', { status: 401 }))
    await expect(listReposFor(github, 'token')).rejects.toBeInstanceOf(UpstreamUnauthorizedError)
  })

  it('uses the Gitea limit parameter and searches beyond its former 200-repo cap', async () => {
    catalogue(Array.from({ length: 251 }, (_, index) => repo(index)))
    const result = await listReposFor(
      { ...github, id: 'codeberg', kind: 'gitea', baseUrl: 'https://codeberg.org' },
      'token',
      {
        search: 'plugin-250',
      },
    )
    expect(result.repos.map((r) => r.name)).toEqual(['plugin-250'])
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/v1/user/repos?limit=50&page=1')
  })

  it('uses pagination headers when a provider returns fewer than the requested 50 items', async () => {
    fetchSpy.mockImplementation((async (input) => {
      const page = new URL(String(input)).searchParams.get('page')
      return Response.json([repo(Number(page))], {
        headers: {
          link:
            page === '1'
              ? '<https://codeberg.org/api/v1/user/repos?page=2>; rel="next"'
              : '<https://codeberg.org/api/v1/user/repos?page=1>; rel="prev"',
        },
      })
    }) as typeof fetch)
    const result = await listReposFor({ ...github, kind: 'gitea' }, 'token')
    expect(result.repos.map((r) => r.name)).toEqual(['plugin-1', 'plugin-2'])
    expect(result.hasMore).toBe(false)
  })

  it('searches GitLab beyond its former cap and preserves nested namespaces', async () => {
    catalogue(
      Array.from({ length: 251 }, (_, index) => ({
        id: index,
        path_with_namespace: `org/team/plugin-${index}`,
        web_url: `https://gitlab.com/org/team/plugin-${index}`,
        name: `Plugin ${index}`,
        path: `plugin-${index}`,
        description: null,
        visibility: 'public',
        archived: false,
        namespace: { path: 'team', kind: 'group' },
      })),
    )
    const result = await listReposFor(
      { ...github, id: 'gitlab', kind: 'gitlab', baseUrl: 'https://gitlab.com' },
      'token',
      {
        search: 'plugin-250',
      },
    )
    expect(result.repos).toHaveLength(1)
    expect(result.repos[0].owner).toBe('org/team')
    expect(String(fetchSpy.mock.calls[0][0])).toContain('min_access_level=40')
  })
})
