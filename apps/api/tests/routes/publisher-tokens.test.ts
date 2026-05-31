import { describe, it, expect, beforeEach } from 'bun:test'
import { clearDb, buildApp, makeUser, makePlugin } from '../helpers'
import { signJwt } from '../../src/lib/jwt'
import { createPublisherToken, hasScope } from '../../src/lib/publisher-tokens'
import { db } from '../../src/db'
import { publisherTokens } from '../../src/db/schema'
import { eq } from 'drizzle-orm'

async function userJwt(role: 'user' | 'admin' = 'user') {
  const u = await makeUser({ role, username: role })
  return {
    user: u,
    token: await signJwt({ sub: u.id, identityId: u.identityId, username: u.username, providerInstanceId: 'github' }),
  }
}

describe('publisher token scope matching', () => {
  it('publish:* covers any publish scope', () => {
    expect(hasScope('publish:firestore', ['publish:*'])).toBe(true)
    expect(hasScope('publish:any-slug', ['publish:*'])).toBe(true)
  })

  it('publish:<slug> only matches that slug', () => {
    expect(hasScope('publish:firestore', ['publish:firestore'])).toBe(true)
    expect(hasScope('publish:postgres', ['publish:firestore'])).toBe(false)
  })

  it('action mismatch denies', () => {
    expect(hasScope('yank:firestore', ['publish:*'])).toBe(false)
    expect(hasScope('publish:firestore', ['yank:*'])).toBe(false)
  })

  it('throws on malformed required scope', () => {
    expect(() => hasScope('not-a-scope', ['publish:*'])).toThrow()
  })
})

describe('publisher_tokens lib', () => {
  beforeEach(clearDb)

  it('creates and verifies a token', async () => {
    const u = await makeUser()
    const { token, row } = await createPublisherToken({
      userId: u.id,
      name: 'CI',
      scopes: ['publish:*'],
    })
    expect(token.startsWith('tpub_')).toBe(true)
    expect(row.scopes).toEqual(['publish:*'])
  })

  it('rejects empty scope array', async () => {
    const u = await makeUser()
    await expect(createPublisherToken({ userId: u.id, name: 'CI', scopes: [] })).rejects.toThrow(/non-empty/)
  })

  it('rejects malformed scope strings', async () => {
    const u = await makeUser()
    await expect(createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish-everything'] })).rejects.toThrow(
      /scope/,
    )
  })

  it('stores only the sha256 hash', async () => {
    const u = await makeUser()
    const { token, id } = await createPublisherToken({
      userId: u.id,
      name: 'CI',
      scopes: ['publish:*'],
    })
    const row = await db.query.publisherTokens.findFirst({ where: { id } })
    expect(row?.tokenHash).not.toBe(token)
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('GET/POST/DELETE /api/auth/me/tokens', () => {
  beforeEach(clearDb)

  it('401 without auth', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/api/auth/me/tokens'))
    expect(res.status).toBe(401)
  })

  it('POST creates a token and returns the plaintext exactly once', async () => {
    const { token } = await userJwt()
    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/auth/me/tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CI', scopes: ['publish:*'] }),
      }),
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { token: string; row: { id: string; prefix: string } }
    expect(data.token.startsWith('tpub_')).toBe(true)
    expect(data.row.prefix.length).toBeLessThan(data.token.length)
  })

  it('GET lists tokens for the caller only', async () => {
    const a = await userJwt('user')
    const b = await userJwt('admin')
    await createPublisherToken({ userId: a.user.id, name: 'mine', scopes: ['publish:*'] })
    await createPublisherToken({ userId: b.user.id, name: 'theirs', scopes: ['publish:*'] })

    const app = await buildApp()
    const res = await app.handle(
      new Request('http://localhost/api/auth/me/tokens', { headers: { Authorization: `Bearer ${a.token}` } }),
    )
    const data = (await res.json()) as { tokens: Array<{ name: string }> }
    expect(data.tokens.map((t) => t.name)).toEqual(['mine'])
  })

  it('DELETE revokes', async () => {
    const a = await userJwt('user')
    const created = await createPublisherToken({ userId: a.user.id, name: 'mine', scopes: ['publish:*'] })

    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/auth/me/tokens/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${a.token}` },
      }),
    )
    expect(res.status).toBe(204)
    const row = await db.query.publisherTokens.findFirst({ where: { id: created.id } })
    expect(row?.revokedAt).not.toBeNull()
  })

  it('DELETE someone else’s token returns 403', async () => {
    const a = await userJwt('user')
    const b = await userJwt('admin')
    const theirs = await createPublisherToken({ userId: b.user.id, name: 'theirs', scopes: ['publish:*'] })
    const app = await buildApp()
    const res = await app.handle(
      new Request(`http://localhost/api/auth/me/tokens/${theirs.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${a.token}` },
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('POST /api/publish/:slug', () => {
  beforeEach(clearDb)

  const MANIFEST = JSON.stringify({
    name: 'alpha',
    version: '1.0.0',
    description: 'A test plugin',
    category: 'misc',
  })

  async function pubFetch(slug: string, token: string, body: Record<string, unknown>) {
    const app = await buildApp()
    return app.handle(
      new Request(`http://localhost/api/publish/${slug}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
  }

  it('401 with no token', async () => {
    const res = await (await buildApp()).handle(new Request('http://localhost/api/publish/alpha', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('first push with publish:* claims the slug', async () => {
    const u = await makeUser()
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:*'] })

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '1.0.0',
      assets: [{ name: 'alpha.zip', url: 'https://example.com/alpha.zip' }],
      repoUrl: 'https://github.com/u/alpha',
    })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { slug: string; claimed: boolean }
    expect(data.slug).toBe('alpha')
    expect(data.claimed).toBe(true)
    const plugin = await db.query.plugins.findFirst({ where: { id: 'alpha' } })
    expect(plugin?.ownerId).toBe(u.id)
    expect(plugin?.category).toBe('misc')
  })

  it('first push without publish:* returns 403', async () => {
    const u = await makeUser()
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:beta'] })

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '1.0.0',
      assets: [],
      repoUrl: 'https://github.com/u/alpha',
    })
    expect(res.status).toBe(403)
  })

  it('first push without repoUrl returns 400', async () => {
    const u = await makeUser()
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:*'] })

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '1.0.0',
      assets: [],
    })
    expect(res.status).toBe(400)
  })

  it('update push with publish:<slug> succeeds', async () => {
    const u = await makeUser()
    await makePlugin(u.id, { id: 'alpha', repoUrl: 'https://github.com/u/alpha' })
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:alpha'] })

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '1.0.0',
      assets: [{ name: 'alpha.zip', url: 'https://example.com/alpha.zip' }],
    })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { claimed: boolean }
    expect(data.claimed).toBe(false)
  })

  it('update push by non-owner returns 403', async () => {
    const owner = await makeUser({ username: 'owner' })
    const other = await makeUser({ username: 'other' })
    await makePlugin(owner.id, { id: 'alpha', repoUrl: 'https://github.com/owner/alpha' })
    const { token } = await createPublisherToken({ userId: other.id, name: 'CI', scopes: ['publish:*'] })

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '1.0.0',
      assets: [],
    })
    expect(res.status).toBe(403)
  })

  it('returns 422 when manifest version does not match the published version', async () => {
    const u = await makeUser()
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:*'] })

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '2.0.0',
      assets: [{ name: 'alpha.zip', url: 'https://example.com/alpha.zip' }],
      repoUrl: 'https://github.com/u/alpha',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/version "1\.0\.0".*tag v2\.0\.0/)
  })

  it('invalid manifest returns 422', async () => {
    const u = await makeUser()
    const { token } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:*'] })

    const res = await pubFetch('alpha', token, {
      manifest: '{ not valid json',
      version: '1.0.0',
      assets: [],
      repoUrl: 'https://github.com/u/alpha',
    })
    expect(res.status).toBe(422)
  })

  it('revoked token returns 401', async () => {
    const u = await makeUser()
    const { token, id } = await createPublisherToken({ userId: u.id, name: 'CI', scopes: ['publish:*'] })
    await db.update(publisherTokens).set({ revokedAt: Date.now() }).where(eq(publisherTokens.id, id))

    const res = await pubFetch('alpha', token, {
      manifest: MANIFEST,
      version: '1.0.0',
      assets: [],
      repoUrl: 'https://github.com/u/alpha',
    })
    expect(res.status).toBe(401)
  })
})
