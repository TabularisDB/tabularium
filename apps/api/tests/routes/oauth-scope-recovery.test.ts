import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { ulid } from 'ulid'
import { clearDb, makeUser, buildApp } from '../helpers'
import { db } from '../../src/db'
import { users, identities } from '../../src/db/schema'
import { encryptToken } from '../../src/lib/crypto'
import { getSetting, setSetting } from '../../src/lib/settings'

// Twin of `oauth-email-capture.test.ts` — same fetch-spy + state cookie
// scaffolding, but focused on the `x-oauth-scopes` header path and the
// per-user `email.scope_recovery_needed.<userId>` settings flag.

type GithubFetchOpts = {
  accessToken?: string
  userResponse?: unknown
  userStatus?: number
  userScopeHeader?: string | null // null = header omitted (Enterprise/forks)
  emailsResponse?: unknown
  emailsStatus?: number
}

function stubGithubFetch(opts: GithubFetchOpts) {
  return spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(typeof input === 'object' && 'url' in input ? input.url : input)
    if (url.includes('github.com/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: opts.accessToken ?? 'test-access-token' }), { status: 200 })
    }
    if (url.endsWith('api.github.com/user') || url.endsWith('/api/v3/user')) {
      const headers = new Headers()
      if (opts.userScopeHeader !== null && opts.userScopeHeader !== undefined) {
        headers.set('x-oauth-scopes', opts.userScopeHeader)
      }
      return new Response(JSON.stringify(opts.userResponse), { status: opts.userStatus ?? 200, headers })
    }
    if (url.endsWith('/user/emails')) {
      return new Response(JSON.stringify(opts.emailsResponse ?? []), { status: opts.emailsStatus ?? 200 })
    }
    return new Response('Not found', { status: 404 })
  }) as unknown as typeof fetch)
}

function callbackRequest(opts: { code: string; state: string; stateCookie: string }) {
  return new Request(`http://localhost/auth/github/callback?code=${opts.code}&state=${opts.state}`, {
    headers: { Cookie: `oauth_state=${encodeURIComponent(opts.stateCookie)}` },
  })
}

function makeStateCookie(): { stateValue: string; nonce: string } {
  const nonce = 'test-state-nonce'
  const stateValue = JSON.stringify({
    nonce,
    instanceId: 'github',
    codeVerifier: 'test-verifier',
    linking: false,
    returnTo: null,
  })
  return { stateValue, nonce }
}

const flagKey = (userId: string) => `email.scope_recovery_needed.${userId}`

describe('OAuth callback — scope recovery flag', () => {
  beforeEach(clearDb)

  it('sets the recovery flag + redirects with email-scope=needed when scope header lacks user:email', async () => {
    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9101, login: 'alice', email: null },
      userScopeHeader: 'read:user',
      emailsStatus: 403,
      emailsResponse: { message: 'Resource not accessible by personal access token' },
    })

    const app = await buildApp()
    const res = await app.handle(callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }))

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { displayName: 'alice' } })
    expect(row?.email).toBeNull()
    expect(getSetting(flagKey(row!.id))).toBe('1')

    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/welcome')
    expect(location).toContain('email-scope=needed')
  })

  it('does NOT set the flag when an email was captured (even if scope header missing user:email)', async () => {
    // /user.email is populated directly — even though scope header lacks
    // user:email, we have a usable address so no recovery is needed.
    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9102, login: 'bob', email: 'bob@example.com' },
      userScopeHeader: 'read:user',
    })

    const app = await buildApp()
    const res = await app.handle(callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }))

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { displayName: 'bob' } })
    expect(row?.email).toBe('bob@example.com')
    expect(getSetting(flagKey(row!.id))).toBeUndefined()

    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('email-scope=needed')
  })

  it('does NOT set the flag when scope header confirms user:email is granted', async () => {
    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9103, login: 'carol', email: null },
      userScopeHeader: 'read:user, user:email',
      emailsResponse: [{ email: 'carol@example.com', primary: true, verified: true }],
    })

    const app = await buildApp()
    const res = await app.handle(callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }))

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { displayName: 'carol' } })
    expect(row?.email).toBe('carol@example.com')
    expect(getSetting(flagKey(row!.id))).toBeUndefined()

    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('email-scope=needed')
  })

  it('clears a stale recovery flag when a fresh login captures an email', async () => {
    // Seed an existing identity + a stale flag from a prior failed login.
    const userId = ulid()
    await db.insert(users).values({ id: userId, displayName: 'dave', email: null })
    await db.insert(identities).values({
      id: ulid(),
      userId,
      providerInstanceId: 'github',
      externalId: '9104',
      username: 'dave',
      accessToken: encryptToken('seed-token'),
    })
    await setSetting(flagKey(userId), '1')
    expect(getSetting(flagKey(userId))).toBe('1')

    const { stateValue, nonce } = makeStateCookie()
    const fetchSpy = stubGithubFetch({
      userResponse: { id: 9104, login: 'dave', email: 'dave@example.com' },
      userScopeHeader: 'read:user, user:email',
    })

    const app = await buildApp()
    const res = await app.handle(callbackRequest({ code: 'test-code', state: nonce, stateCookie: stateValue }))

    fetchSpy.mockRestore()
    expect(res.status).toBe(302)

    const row = await db.query.users.findFirst({ where: { id: userId } })
    expect(row?.email).toBe('dave@example.com')
    expect(getSetting(flagKey(userId))).toBeUndefined()
  })

  it('appends prompt=consent on the authorize URL when ?reauth=email', async () => {
    const app = await buildApp()
    const res = await app.handle(new Request('http://localhost/auth/github?reauth=email'))
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('github.com')
    expect(location).toContain('prompt=consent')
  })
})
