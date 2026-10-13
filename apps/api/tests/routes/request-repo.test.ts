import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp, userHeaders, type TestUser } from '../helpers'
import { db } from '../../src/db'
import { pluginRequests, pluginRequestClaims } from '../../src/db/schema'

async function seed(user: TestUser) {
  const row = {
    id: ulid(),
    slug: 'trino-presto',
    name: 'Trino / Presto',
    description: 'Trino driver',
    kind: 'driver',
    status: 'approved' as const,
    requesterId: user.id,
  }
  await db.insert(pluginRequests).values(row)
  return row
}

async function call(user: TestUser, method: string, path: string, body?: unknown) {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...userHeaders(user) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

function mockGithub(routes: Record<string, unknown>) {
  const spy = spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const data = routes[url.pathname]
    return data === undefined
      ? new Response('{"message":"Not Found"}', { status: 404 })
      : new Response(JSON.stringify(data), { status: 200 })
  }) as unknown as typeof fetch)
  return () => spy.mockRestore()
}

describe('POST /api/requests/:id/repo', () => {
  beforeEach(clearDb)

  it('requires a claim', async () => {
    const user = await makeUser()
    const row = await seed(user)
    const res = await call(user, 'POST', `/api/requests/${row.id}/repo`, {
      repoUrl: 'https://github.com/acme/trino',
    })
    expect(res.status).toBe(409)
  })

  it('links a repository the user maintains and records it on the claim', async () => {
    const user = await makeUser()
    const row = await seed(user)
    await db.insert(pluginRequestClaims).values({ requestId: row.id, userId: user.id })
    const restore = mockGithub({ '/repos/acme/trino': { permissions: { admin: false, maintain: true } } })
    const res = await call(user, 'POST', `/api/requests/${row.id}/repo`, {
      repoUrl: 'https://github.com/acme/trino.git',
    })
    restore()

    expect(res.status).toBe(200)
    const data = (await res.json()) as { repoUrl: string; fullName: string; claimers: Array<{ repoUrl: string }> }
    expect(data.repoUrl).toBe('https://github.com/acme/trino')
    expect(data.fullName).toBe('acme/trino')
    expect(data.claimers[0].repoUrl).toBe('https://github.com/acme/trino')
    const claim = await db.query.pluginRequestClaims.findFirst({ where: { requestId: row.id } })
    expect(claim?.repoUrl).toBe('https://github.com/acme/trino')
  })

  it('refuses a repository without maintain permission', async () => {
    const user = await makeUser()
    const row = await seed(user)
    await db.insert(pluginRequestClaims).values({ requestId: row.id, userId: user.id })
    const restore = mockGithub({ '/repos/acme/trino': { permissions: { push: true } } })
    const res = await call(user, 'POST', `/api/requests/${row.id}/repo`, {
      repoUrl: 'https://github.com/acme/trino',
    })
    restore()
    expect(res.status).toBe(403)
  })

  it('refuses URLs outside the configured providers', async () => {
    const user = await makeUser()
    const row = await seed(user)
    await db.insert(pluginRequestClaims).values({ requestId: row.id, userId: user.id })
    const res = await call(user, 'POST', `/api/requests/${row.id}/repo`, {
      repoUrl: 'https://example.com/acme/trino',
    })
    expect(res.status).toBe(422)
  })

  it('unlinks with a null repoUrl', async () => {
    const user = await makeUser()
    const row = await seed(user)
    await db
      .insert(pluginRequestClaims)
      .values({ requestId: row.id, userId: user.id, repoUrl: 'https://github.com/acme/trino' })
    const res = await call(user, 'POST', `/api/requests/${row.id}/repo`, { repoUrl: null })
    expect(res.status).toBe(200)
    const claim = await db.query.pluginRequestClaims.findFirst({ where: { requestId: row.id } })
    expect(claim?.repoUrl).toBeNull()
  })
})

describe('GET /api/submit/owners', () => {
  beforeEach(clearDb)

  it('lists the account first, then its organizations', async () => {
    const user = await makeUser()
    const restore = mockGithub({
      '/user': { login: 'builder', avatar_url: 'https://avatars.example/u' },
      '/user/orgs': [{ login: 'zeta' }, { login: 'Acme', avatar_url: 'https://avatars.example/a' }],
    })
    const res = await call(user, 'GET', '/api/submit/owners')
    restore()

    expect(res.status).toBe(200)
    const data = (await res.json()) as { owners: Array<{ login: string; type: string }> }
    expect(data.owners.map((o) => `${o.type}:${o.login}`)).toEqual(['user:builder', 'org:Acme', 'org:zeta'])
  })
})
