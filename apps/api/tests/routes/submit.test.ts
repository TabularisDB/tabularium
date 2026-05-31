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
    const token = await signJwt({
      sub: user.id,
      identityId: user.identityId,
      username: 'alice',
      providerInstanceId: 'github',
    })

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
    const data = (await res.json()) as { slug: string; webhookSecret: string; webhookUrl: string }
    expect(data.slug).toBe('mydb')
    expect(data.webhookSecret).toHaveLength(64)
    expect(data.webhookUrl).toContain('/api/webhooks/release')

    const saved = await db.query.plugins.findFirst({ where: { id: 'mydb' } })
    expect(saved).toBeDefined()
  })

  it('removes the matching plugin request on success', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({
      sub: user.id,
      identityId: user.identityId,
      username: 'alice',
      providerInstanceId: 'github',
    })
    const requestId = ulid()
    await db.insert(pluginRequests).values({
      id: requestId,
      slug: 'mydb',
      name: 'MyDB',
      description: 'desc',
      requesterId: user.id,
      upvotes: 0,
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
    const token = await signJwt({
      sub: user.id,
      identityId: user.identityId,
      username: 'alice',
      providerInstanceId: 'github',
    })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify({ owner: { login: 'bob' } }), { status: 200 })) as unknown as typeof fetch,
    )

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

  it('keeps submit lenient even when the manifest is invalid', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({
      sub: user.id,
      identityId: user.identityId,
      username: 'alice',
      providerInstanceId: 'github',
    })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('api.github.com/repos') && u.endsWith('/repos/alice/my-plugin')) {
        return new Response(JSON.stringify({ owner: { login: 'alice' } }), { status: 200 })
      }
      if (u.includes('/releases/latest')) {
        return new Response(JSON.stringify({ tag_name: 'v0.1.0', assets: [] }), { status: 200 })
      }
      if (u.includes('/contents/tabularium.yaml')) {
        // deliberately invalid: name must be a string, not a number
        return new Response('name: 42\nkind: theme\n', { status: 200 })
      }
      if (u.includes('/contents/')) {
        return new Response('not found', { status: 404 })
      }
      if (u.includes('/hooks')) {
        return new Response(JSON.stringify({ id: 1 }), { status: 201 })
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch)

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoUrl: 'https://github.com/alice/my-plugin', name: 'My Plugin', description: 'desc' }),
      }),
    )
    fetchSpy.mockRestore()

    // Lenient: submit still succeeds even though the manifest is bad
    expect(res.status).toBe(200)
  })

  it('ManifestValidationError carries structured errors usable for downstream surfaces', () => {
    const { ManifestValidationError, parseManifestText } =
      require('../../src/lib/manifest') as typeof import('../../src/lib/manifest')
    try {
      parseManifestText('name: 42\nversion: 0.1.0\n', 'tabularium.yaml')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const e = err as InstanceType<typeof ManifestValidationError>
      // ajv produces keyword name as the code; for a string-type mismatch it is 'type'
      expect(e.errors.some((er) => er.path === '/name' && er.code === 'type')).toBe(true)
    }
  })
})
