import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp, userHeaders, type TestUser } from '../helpers'
import { db } from '../../src/db'
import { pluginRequests, pluginRequestClaims } from '../../src/db/schema'

async function seed(user: TestUser, overrides: Partial<typeof pluginRequests.$inferInsert> = {}) {
  const row = {
    id: ulid(),
    slug: 'firebird',
    name: 'Firebird',
    description: 'Firebird driver',
    kind: 'driver',
    status: 'approved' as const,
    requesterId: user.id,
    ...overrides,
  }
  await db.insert(pluginRequests).values(row)
  return row
}

async function scaffold(user: TestUser, id: string, body: Record<string, unknown> = {}) {
  const app = await buildApp()
  return app.handle(
    new Request(`http://localhost/api/requests/${id}/scaffold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...userHeaders(user) },
      body: JSON.stringify(body),
    }),
  )
}

type Call = { method: string; url: string; body: Record<string, unknown> | null }

function mockGithub(scopes: string | null) {
  const calls: Call[] = []
  const spy = spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    calls.push({ method, url, body })
    const ok = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), { status, headers })
    if (url.endsWith('/user') && method === 'GET') {
      return ok({ login: 'builder' }, 200, scopes === null ? {} : { 'x-oauth-scopes': scopes })
    }
    if (url.endsWith('/user/repos')) {
      return ok(
        {
          name: body?.name,
          full_name: `builder/${body?.name}`,
          html_url: `https://github.com/builder/${body?.name}`,
          default_branch: 'main',
          owner: { login: 'builder' },
        },
        201,
      )
    }
    if (url.endsWith('/git/blobs')) return ok({ sha: `blob${calls.length}` }, 201)
    if (url.endsWith('/git/trees')) return ok({ sha: 'tree1' }, 201)
    if (url.endsWith('/git/commits')) return ok({ sha: 'commit1' }, 201)
    if (url.includes('/git/refs/heads/')) return ok({ ref: 'refs/heads/main' })
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch)
  return { calls, restore: () => spy.mockRestore() }
}

describe('POST /api/requests/:id/scaffold', () => {
  beforeEach(clearDb)

  it('requires a claim on an approved request', async () => {
    const user = await makeUser()
    const row = await seed(user)
    const res = await scaffold(user, row.id)
    expect(res.status).toBe(409)
  })

  it('asks for the workflow scope with a re-authorization URL', async () => {
    const user = await makeUser()
    const row = await seed(user)
    await db.insert(pluginRequestClaims).values({ requestId: row.id, userId: user.id })
    const gh = mockGithub('read:user, public_repo, admin:repo_hook')
    const res = await scaffold(user, row.id, { returnTo: 'http://localhost:3000/requests' })
    gh.restore()

    expect(res.status).toBe(403)
    const data = (await res.json()) as { missingScope: string; reauthUrl: string }
    expect(data.missingScope).toBe('workflow')
    const url = new URL(data.reauthUrl)
    expect(url.pathname).toBe('/auth/github')
    expect(url.searchParams.get('scope')).toBe('workflow')
    expect(url.searchParams.get('return_to')).toBe('http://localhost:3000/requests')
    expect(gh.calls.some((c) => c.url.endsWith('/user/repos'))).toBe(false)
  })

  it('needs a minimum runtime version for themes', async () => {
    const user = await makeUser()
    const row = await seed(user, { slug: 'dracula', kind: 'theme' })
    await db.insert(pluginRequestClaims).values({ requestId: row.id, userId: user.id })
    const res = await scaffold(user, row.id)
    expect(res.status).toBe(400)
  })

  it('creates the repository with the generated driver and records it on the claim', async () => {
    const user = await makeUser()
    const row = await seed(user)
    await db.insert(pluginRequestClaims).values({ requestId: row.id, userId: user.id })
    const gh = mockGithub('public_repo, workflow')
    const res = await scaffold(user, row.id, { driver: { dbType: 'file' } })
    gh.restore()

    expect(res.status).toBe(200)
    const data = (await res.json()) as { repoUrl: string; files: number; submitUrl: string; claimers: unknown[] }
    expect(data.repoUrl).toBe('https://github.com/builder/firebird')
    expect(data.submitUrl).toContain('/submit?repo=')

    const repoCall = gh.calls.find((c) => c.url.endsWith('/user/repos'))!
    expect(repoCall.body).toMatchObject({ name: 'firebird', private: false, auto_init: true })
    const tree = gh.calls.find((c) => c.url.endsWith('/git/trees'))!.body!.tree as Array<{ path: string }>
    const paths = tree.map((e) => e.path)
    expect(paths).toContain('.tabularium')
    expect(paths).toContain('.github/workflows/release.yml')
    expect(paths).toContain('.gitignore')
    expect(paths).toHaveLength(data.files)
    const blobs = gh.calls.filter((c) => c.url.endsWith('/git/blobs'))
    const manifest = blobs[paths.indexOf('.tabularium')].body!.content as string
    expect(JSON.parse(Buffer.from(manifest, 'base64').toString('utf8'))).toMatchObject({ name: 'firebird' })
    const commit = gh.calls.find((c) => c.url.endsWith('/git/commits'))!
    expect(commit.body).toMatchObject({ tree: 'tree1', parents: [] })
    const ref = gh.calls.find((c) => c.url.includes('/git/refs/heads/main'))!
    expect(ref.body).toMatchObject({ sha: 'commit1', force: true })

    const claim = await db.query.pluginRequestClaims.findFirst({ where: { requestId: row.id } })
    expect(claim?.repoUrl).toBe('https://github.com/builder/firebird')
  })
})
