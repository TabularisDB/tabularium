import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { ulid } from 'ulid'
import { eq } from 'drizzle-orm'
import { clearDb, makeUser, buildApp } from '../helpers'
import { db } from '../../src/db'
import { users, identities } from '../../src/db/schema'
import { encryptToken } from '../../src/lib/crypto'
import { signJwt } from '../../src/lib/jwt'

// The default test instance (`github`) is configured at `https://github.com`,
// so the callback takes the PKCE branch — a plain `fetch` POST to the GitHub
// token endpoint. We can fully stub the flow with `spyOn(global, 'fetch')`.

type GithubFetchOpts = {
  accessToken?: string
  userResponse?: unknown
  userStatus?: number
  emailsResponse?: unknown
  emailsStatus?: number
  emailsCalled?: { count: number }
}

function stubGithubFetch(opts: GithubFetchOpts) {
  return spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(typeof input === 'object' && 'url' in input ? input.url : input)
    if (url.includes('github.com/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: opts.accessToken ?? 'test-access-token' }), { status: 200 })
    }
    if (url.endsWith('api.github.com/user') || url.endsWith('/api/v3/user')) {
      return new Response(JSON.stringify(opts.userResponse), { status: opts.userStatus ?? 200 })
    }
    if (url.endsWith('/user/emails')) {
      if (opts.emailsCalled) opts.emailsCalled.count += 1
      return new Response(JSON.stringify(opts.emailsResponse ?? []), { status: opts.emailsStatus ?? 200 })
    }
    return new Response('Not found', { status: 404 })
  }) as unknown as typeof fetch)
}

function callbackRequest(opts: { code: string; state: string; stateCookie: string; authCookie?: string }) {
  const cookieParts = [`oauth_state=${encodeURIComponent(opts.stateCookie)}`]
  if (opts.authCookie) cookieParts.push(`auth=${opts.authCookie}`)
  return new Request(`http://localhost/auth/github/callback?code=${opts.code}&state=${opts.state}`, {
    headers: { Cookie: cookieParts.join('; ') },
  })
}

function makeStateCookie(opts: { linking?: boolean } = {}): { stateValue: string; nonce: string } {
  const nonce = 'test-state-nonce'
  const stateValue = JSON.stringify({
    nonce,
    instanceId: 'github',
    codeVerifier: 'test-verifier',
    linking: opts.linking ?? false,
    returnTo: null,
  })
  return { stateValue, nonce }
}

describe('OAuth callback — email capture', () => {
  beforeEach(clearDb)

  it('persists email from /user/emails when /user returns null email (new GitHub signup)', async () => {
    const { stateValue, nonce } = makeStateCookie()
    const emailsCalled = { count: 0 }
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9001, login: 'alice', email: null },
      emailsResponse: [
        { email: 'noise@y.com', primary: false, verified: true },
        { email: 'alice@example.com', primary: true, verified: true },
      ],
      emailsCalled,
    })

    const app = await buildApp()
    const res = await app.handle(
      callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const inserted = await db.query.users.findFirst({ where: { displayName: 'alice' } })
    expect(inserted?.email).toBe('alice@example.com')
    expect(inserted?.locale).toBe('en')
    expect(emailsCalled.count).toBe(1)
  })

  it('skips /user/emails when /user already returns an email', async () => {
    const { stateValue, nonce } = makeStateCookie()
    const emailsCalled = { count: 0 }
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9002, login: 'bob', email: 'bob@example.com' },
      emailsCalled,
    })

    const app = await buildApp()
    const res = await app.handle(
      callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const inserted = await db.query.users.findFirst({ where: { displayName: 'bob' } })
    expect(inserted?.email).toBe('bob@example.com')
    expect(emailsCalled.count).toBe(0)
  })

  it('backfills email for an existing user whose row had email=null (re-login)', async () => {
    // Seed a user with no email and a matching GitHub identity. The callback
    // takes the "existingIdentity" refresh path and should backfill the email.
    const userId = ulid()
    await db.insert(users).values({ id: userId, displayName: 'carol', email: null })
    await db.insert(identities).values({
      id: ulid(),
      userId,
      providerInstanceId: 'github',
      externalId: '9003',
      username: 'carol',
      accessToken: encryptToken('seed-token'),
    })

    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9003, login: 'carol', email: 'carol@example.com' },
    })

    const app = await buildApp()
    const res = await app.handle(
      callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { id: userId } })
    expect(row?.email).toBe('carol@example.com')
  })

  it('does not overwrite an existing email on re-login', async () => {
    const userId = ulid()
    await db.insert(users).values({ id: userId, displayName: 'dave', email: 'original@example.com' })
    await db.insert(identities).values({
      id: ulid(),
      userId,
      providerInstanceId: 'github',
      externalId: '9004',
      username: 'dave',
      accessToken: encryptToken('seed-token'),
    })

    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9004, login: 'dave', email: 'changed@example.com' },
    })

    const app = await buildApp()
    const res = await app.handle(
      callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { id: userId } })
    expect(row?.email).toBe('original@example.com')
  })

  it('backfills email when linking a fresh GitHub account to an existing emailless user', async () => {
    const linkUser = await makeUser({ username: 'erin', email: null })
    // Drop the seed identity so the link path creates a fresh one for a new externalId.
    await db.delete(identities).where(eq(identities.userId, linkUser.id))
    const authCookie = await signJwt({
      sub: linkUser.id,
      identityId: linkUser.identityId,
      username: linkUser.username,
      providerInstanceId: 'github',
    })

    const { stateValue, nonce } = makeStateCookie({ linking: true })
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9005, login: 'erin-gh', email: 'erin@example.com' },
    })

    const app = await buildApp()
    const res = await app.handle(
      callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue, authCookie }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { id: linkUser.id } })
    expect(row?.email).toBe('erin@example.com')
  })

  it('saves user without email when the provided email is already taken', async () => {
    // Pre-existing user owns the email.
    await db.insert(users).values({ id: ulid(), displayName: 'first-owner', email: 'taken@example.com' })

    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9006, login: 'fiona', email: 'taken@example.com' },
    })

    const app = await buildApp()
    const res = await app.handle(
      callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }),
    )

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const fiona = await db.query.users.findFirst({ where: { displayName: 'fiona' } })
    expect(fiona).toBeDefined()
    expect(fiona?.email).toBeNull()
  })
})
