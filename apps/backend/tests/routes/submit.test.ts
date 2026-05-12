import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { Elysia } from 'elysia'
import { clearDb, makeUser } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { db } from '../../src/db'
import { plugins, challenges } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

async function buildSubmitApp() {
  const { default: submitOauth } = await import('../../src/routes/api/submit/oauth')
  return new Elysia().use(submitOauth)
}

describe('POST /api/submit/oauth', () => {
  beforeEach(clearDb)

  it('returns 401 without auth', async () => {
    const app = await buildSubmitApp()
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
    const token = await signJwt({ sub: user.id, username: 'alice', provider: 'github', providerInstanceUrl: null })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('api.github.com/repos')) {
        return new Response(JSON.stringify({ owner: { login: 'alice' } }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })

    const app = await buildSubmitApp()
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

    const saved = await db.query.plugins.findFirst({ where: eq(plugins.id, 'mydb') })
    expect(saved).toBeDefined()
  })

  it('returns 403 when user does not own the repo', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({ sub: user.id, username: 'alice', provider: 'github', providerInstanceUrl: null })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ owner: { login: 'bob' } }), { status: 200 }),
    )

    const app = await buildSubmitApp()
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

async function buildChallengeApp() {
  const { default: challengeIndex } = await import('../../src/routes/api/submit/challenge/index')
  const { default: challengeVerify } = await import('../../src/routes/api/submit/challenge/verify')
  return new Elysia().use(challengeIndex).use(challengeVerify)
}

describe('POST /api/submit/challenge', () => {
  beforeEach(clearDb)

  it('creates a challenge and returns a token', async () => {
    const app = await buildChallengeApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: 'https://github.com/alice/my-plugin' }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json() as { token: string; instructions: string }
    expect(data.token).toHaveLength(64)
    expect(data.instructions).toContain('.tabularis')
  })
})

describe('POST /api/submit/challenge/verify', () => {
  beforeEach(clearDb)

  it('returns 401 without auth', async () => {
    const app = await buildChallengeApp()
    const res = await app.handle(
      new Request('http://localhost/api/submit/challenge/verify?token=abc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plugin', description: 'desc' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('verifies challenge and creates plugin when token matches', async () => {
    const user = await makeUser({ username: 'alice' })
    const token = await signJwt({ sub: user.id, username: 'alice', provider: 'github', providerInstanceUrl: null })

    const { generateChallengeToken } = await import('../../src/lib/challenge')
    const challengeToken = generateChallengeToken()
    await db.insert(challenges).values({
      token: challengeToken,
      repoUrl: 'https://github.com/alice/tabularis-mydb2-plugin',
      expiresAt: Date.now() + 86400000,
      verified: 0,
    })

    const fetchSpy = spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(challengeToken, { status: 200 }),
    )

    const app = await buildChallengeApp()
    const res = await app.handle(
      new Request(`http://localhost/api/submit/challenge/verify?token=${challengeToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'MyDB2', description: 'Another plugin' }),
      }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(200)
    const data = await res.json() as { slug: string; webhookSecret: string }
    expect(data.slug).toBe('mydb2')
  })
})
