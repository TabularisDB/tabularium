import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { pluginRequests, pluginRequestClaims } from '../../src/db/schema'

describe('POST /api/submit/oauth', () => {
  beforeEach(clearDb)

  it('returns 401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: 'https://github.com/alice/my-plugin', name: 'My Plugin', description: 'desc' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('creates plugin when user owns the repo', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: 'alice', providerInstanceId: 'github' })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
      if (String(url).includes('api.github.com/repos')) {
        return new Response(JSON.stringify({ owner: { login: 'alice' } }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }) as unknown as typeof fetch)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          repoUrl: 'https://github.com/alice/tabularis-mydb-plugin',
          name: 'MyDB',
          description: 'My database plugin',
        }),
      }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(200)
    const data = await res.json() as { slug: string; webhookSecret: string; webhookUrl: string }
    expect(data.slug).toBe('mydb')
    expect(data.webhookSecret).toHaveLength(64)
    expect(data.webhookUrl).toContain('/api/webhooks/release')

    const saved = await db.query.plugins.findFirst({ where: { id: 'mydb' } })
    expect(saved).toBeDefined()
  })

  it('removes the matching plugin request on success', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: 'alice', providerInstanceId: 'github' })
    const requestId = ulid()
    await db.insert(pluginRequests).values({
      id: requestId, slug: 'mydb', name: 'MyDB', description: 'desc', requesterId: user.id, upvotes: 0,
    })
    await db.insert(pluginRequestClaims).values({ requestId, userId: user.id })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
      if (String(url).includes('api.github.com/repos')) {
        return new Response(JSON.stringify({ owner: { login: 'alice' } }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }) as unknown as typeof fetch)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          repoUrl: 'https://github.com/alice/tabularis-mydb-plugin',
          name: 'MyDB',
          description: 'My database plugin',
        }),
      }),
    )
    fetchSpy.mockRestore()
    expect(res.status).toBe(200)

    const gone = await db.query.pluginRequests.findFirst({ where: { id: requestId } })
    expect(gone).toBeUndefined()
    const claimGone = await db.query.pluginRequestClaims.findFirst({ where: { requestId } })
    expect(claimGone).toBeUndefined()
  })

  it('returns 403 when user does not own the repo', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({ sub: user.id, identityId: user.identityId, username: 'alice', providerInstanceId: 'github' })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation((async () =>
      new Response(JSON.stringify({ owner: { login: 'bob' } }), { status: 200 })
    ) as unknown as typeof fetch)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoUrl: 'https://github.com/bob/plugin', name: 'Plugin', description: 'desc' }),
      }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(403)
  })
})

