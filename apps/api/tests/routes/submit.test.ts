import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { pluginRequests, pluginRequestClaims, providerInstances } from '../../src/db/schema'
import { encryptToken } from '../../src/lib/crypto'
import { initProviderInstances } from '../../src/lib/provider-instance'

describe('POST /api/submit/oauth', () => {
  let webhookFetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | undefined
  beforeEach(clearDb)
  afterEach(() => webhookFetchSpy?.mockRestore())

  for (const kind of ['github', 'gitlab', 'gitea'] as const) {
    for (const failure of [403, 404, 'network', 'timeout', 'invalid-response', 'installed'] as const) {
      it(`submits with ${kind} read access when webhook setup returns ${failure}`, async () => {
        const baseUrl = kind === 'github' ? 'https://github.com' : `https://${kind}.example.com`
        if (kind !== 'github') {
          await db.insert(providerInstances).values({
            id: kind,
            kind,
            displayName: kind,
            baseUrl,
            clientId: 'test-client-id',
            clientSecret: encryptToken('test-secret'),
            enabled: 1,
          })
          await initProviderInstances()
        }
        const user = await makeUser({ username: 'alice', providerInstanceId: kind })
        const repoUrl = `${baseUrl}/alice/my-plugin`
        webhookFetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
          const url = new URL(String(input))
          if (url.pathname.endsWith('/hooks')) {
            expect(init?.method).toBe('POST')
            expect(init?.signal).toBeInstanceOf(AbortSignal)
            if (failure === 'network') throw new TypeError('Connection failed')
            if (failure === 'timeout') throw new DOMException('Timed out', 'TimeoutError')
            if (failure === 'invalid-response') return new Response('invalid JSON', { status: 201 })
            if (failure === 'installed') return Response.json({ id: 1 }, { status: 201 })
            return new Response('Insufficient scope', { status: failure })
          }
          if (url.pathname.endsWith('/repos/alice/my-plugin') || url.pathname.endsWith('/projects/alice%2Fmy-plugin')) {
            // The account's role is independent of the app's read-only OAuth grant.
            return Response.json({
              permissions:
                kind === 'gitlab' ? { project_access: { access_level: 40 } } : { admin: true, maintain: true },
            })
          }
          return new Response('Not found', { status: 404 })
        }) as typeof fetch)

        const app = await buildApp()
        const res = await app.handle(
          new Request('http://localhost/api/submit/oauth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.jwt}` },
            body: JSON.stringify({ repoUrl }),
          }),
        )

        expect(res.status).toBe(200)
        const data = (await res.json()) as {
          slug: string
          webhookInstalled: boolean
          webhookSetupReason: string | null
          webhookUrl: string
          webhookSecret: string
        }
        expect(data.webhookInstalled).toBe(failure === 'installed')
        if (failure === 'installed') expect(data.webhookSetupReason).toBeNull()
        else expect(data.webhookSetupReason).toBeTruthy()
        expect(data.webhookUrl).toBe('http://localhost:3000/api/webhooks/release')
        expect(data.webhookSecret).toHaveLength(64)
        const saved = await db.query.plugins.findFirst({ where: { id: data.slug } })
        expect(saved).toMatchObject({ ownerId: user.id, repoUrl, webhookSecret: data.webhookSecret })
      })
    }
  }

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
        return new Response(JSON.stringify({ owner: { login: 'alice' }, permissions: { maintain: true } }), {
          status: 200,
        })
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

  it('keeps the matching request in progress until the plugin is in the catalog', async () => {
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
      status: 'approved',
    })
    await db.insert(pluginRequestClaims).values({ requestId, userId: user.id })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation((async (url: string | URL | Request) => {
      if (String(url).includes('api.github.com/repos')) {
        return new Response(JSON.stringify({ owner: { login: 'alice' }, permissions: { maintain: true } }), {
          status: 200,
        })
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

    // No release yet, so no manifest: the plugin is not listed and the
    // request stays open (and claimed) instead of being deleted.
    const pending = await db.query.pluginRequests.findFirst({ where: { id: requestId } })
    expect(pending).toMatchObject({ status: 'approved', fulfilledPluginId: null })
    const claim = await db.query.pluginRequestClaims.findFirst({ where: { requestId } })
    expect(claim).toBeDefined()
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

  it('rejects an invalid manifest instead of silently claiming a different identity', async () => {
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
        return new Response(JSON.stringify({ owner: { login: 'alice' }, permissions: { maintain: true } }), {
          status: 200,
        })
      }
      if (u.includes('/releases?')) {
        return new Response(JSON.stringify([{ tag_name: 'v0.1.0', assets: [] }]), { status: 200 })
      }
      if (u.includes('/contents/.tabularium') || u.includes('/contents/tabularium.json')) {
        return new Response(JSON.stringify({ name: 42, version: '0.1.0', kind: 'theme' }), { status: 200 })
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

    expect(res.status).toBe(422)
    expect(await db.query.plugins.findFirst({ where: { id: 'my-plugin' } })).toBeUndefined()
  })

  it('ManifestValidationError carries structured errors usable for downstream surfaces', () => {
    const { ManifestValidationError, parseManifestText } =
      require('../../src/lib/manifest') as typeof import('../../src/lib/manifest')
    try {
      parseManifestText(JSON.stringify({ name: 42, version: '0.1.0' }))
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError)
      const e = err as InstanceType<typeof ManifestValidationError>
      // ajv produces keyword name as the code; for a string-type mismatch it is 'type'
      expect(e.errors.some((er) => er.path === '/name' && er.code === 'type')).toBe(true)
    }
  })
})
