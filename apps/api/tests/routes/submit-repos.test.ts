import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { buildApp, clearDb, makeUser, userHeaders } from '../helpers'

describe('GET /api/submit/repos', () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
  beforeEach(async () => {
    await clearDb()
    fetchSpy = spyOn(globalThis, 'fetch')
    fetchSpy.mockImplementation((async (input) => {
      const url = new URL(String(input))
      const start = (Number(url.searchParams.get('page')) - 1) * 100
      return Response.json(
        Array.from({ length: Math.max(0, Math.min(100, 351 - start)) }, (_, i) => ({
          full_name: `alice/plugin-${start + i}`,
          html_url: `https://github.com/alice/plugin-${start + i}`,
          name: `plugin-${start + i}`,
          description: null,
          private: false,
          owner: { login: 'alice' },
          permissions: { maintain: true },
        })),
      )
    }) as typeof fetch)
  })
  afterEach(() => fetchSpy.mockRestore())

  it('requires authentication', async () => {
    const app = await buildApp()
    expect((await app.handle(new Request('http://localhost/api/submit/repos'))).status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 100 GitHub results per page with accurate pagination metadata', async () => {
    const user = await makeUser()
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/submit/repos', { headers: userHeaders(user) }))
    expect(res.status).toBe(200)
    const { groups } = await res.json()
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      identityId: user.identityId,
      page: 1,
      limit: 100,
      total: 351,
      hasMore: true,
      error: null,
    })
    expect(groups[0].repos).toHaveLength(100)
    expect(groups[0].repos[0].identityId).toBe(user.identityId)
  })

  it('searches and submits a maintainable repo outside the former 300-repo list', async () => {
    const user = await makeUser({ username: 'alice' })
    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/submit/repos?identityId=${user.identityId}&search=plugin-350`, {
        headers: userHeaders(user),
      }),
    )
    expect(res.status).toBe(200)
    const { groups } = await res.json()
    expect(groups[0].repos.map((r: { name: string }) => r.name)).toEqual(['plugin-350'])
    expect(groups[0].hasMore).toBe(false)
    expect(groups[0].total).toBe(1)
    const repoUrl = groups[0].repos[0].url
    fetchSpy.mockImplementation((async (input) => {
      if (String(input) === 'https://api.github.com/repos/alice/plugin-350') {
        return Response.json({ permissions: { maintain: true } })
      }
      return new Response('Not found', { status: 404 })
    }) as typeof fetch)
    const preview = await app.handle(
      new Request('http://localhost/api/submit/preview', {
        method: 'POST',
        headers: { ...userHeaders(user), 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      }),
    )
    expect(preview.status).toBe(200)
    expect(await preview.json()).toMatchObject({ ok: true, slug: 'plugin-350' })
    const submitted = await app.handle(
      new Request('http://localhost/api/submit/oauth', {
        method: 'POST',
        headers: { ...userHeaders(user), 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, name: 'Plugin 350', description: 'A plugin beyond the old repository cap' }),
      }),
    )
    expect(submitted.status).toBe(200)
    expect(await submitted.json()).toMatchObject({ slug: 'plugin-350' })
  })

  it('serves subsequent pages for the selected identity', async () => {
    const user = await makeUser()
    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/submit/repos?identityId=${user.identityId}&page=4`, {
        headers: userHeaders(user),
      }),
    )
    expect(res.status).toBe(200)
    const { groups } = await res.json()
    expect(groups[0]).toMatchObject({ page: 4, limit: 100, total: 351, hasMore: false })
    expect(groups[0].repos.map((r: { name: string }) => r.name)).toEqual(
      Array.from({ length: 51 }, (_, index) => `plugin-${300 + index}`),
    )
  })

  it('rejects searches shorter than 3 trimmed characters before calling upstream', async () => {
    const user = await makeUser()
    const app = await buildApp()
    for (const search of ['', 'a', 'ab', '  ab  ', '   ']) {
      const res = await app.handle(
        new Request(`http://localhost/api/submit/repos?search=${encodeURIComponent(search)}`, {
          headers: userHeaders(user),
        }),
      )
      expect(res.status).toBe(422)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects invalid page numbers', async () => {
    const user = await makeUser()
    const app = await buildApp()
    for (const page of ['0', '-1', '1.5', 'abc']) {
      const res = await app.handle(
        new Request(`http://localhost/api/submit/repos?page=${page}`, {
          headers: userHeaders(user),
        }),
      )
      expect(res.status).toBe(422)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("cannot query another user's identity", async () => {
    const user = await makeUser()
    const other = await makeUser()
    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/submit/repos?identityId=${other.identityId}`, {
        headers: userHeaders(user),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ groups: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports provider failures instead of silently hiding remaining repositories', async () => {
    const user = await makeUser()
    fetchSpy.mockResolvedValue(new Response('rate limited', { status: 403 }))
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/submit/repos', { headers: userHeaders(user) }))
    const { groups } = await res.json()
    expect(groups[0].error).toBe('Repository API error: 403')
    expect(groups[0].repos).toEqual([])
  })

  it('reports expired upstream credentials as requiring reauthentication', async () => {
    const user = await makeUser()
    fetchSpy.mockResolvedValue(new Response('expired', { status: 401 }))
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/submit/repos', { headers: userHeaders(user) }))
    const { groups } = await res.json()
    expect(groups[0].error).toBe('reauth_required')
  })
})
