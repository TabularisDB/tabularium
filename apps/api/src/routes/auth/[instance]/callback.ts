import { Elysia, t } from 'elysia'
import { GitHub, GitLab, Gitea, OAuth2RequestError } from 'arctic'
import { ulid } from 'ulid'
import { count, eq } from 'drizzle-orm'
import { db } from '$db'
import { users, identities, rootCredentials } from '$db/schema'
import { signJwt, verifyJwt } from '$lib/jwt'
import { createSession } from '$lib/sessions'
import { encryptToken } from '$lib/crypto'
import { getInstance, type ProviderInstance } from '$lib/provider-instance'
import { env, isProd } from '$lib/env'
import { logger } from '$lib/logger'
import { getSetting, setSetting, isSettingsInitialized } from '$lib/settings'
import { recordAudit } from '$lib/audit'
import { fireWelcomeEmail } from '$lib/email/welcome'
import { safeReturnTo } from './index'

const log = logger.child({ module: 'auth-callback' })

const AUTO_ADMIN_FUSE_KEY = 'bootstrap.auto_admin_consumed'

type ProviderProfile = {
  externalId: string
  username: string
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: number | null
}

const DISPLAY_NAME_RE = /^[\p{L}\p{N}._\-\s]{1,60}$/u

function sanitizeUsername(raw: string): string {
  const trimmed = raw.trim().slice(0, 60)
  return DISPLAY_NAME_RE.test(trimmed) ? trimmed : `user-${Math.random().toString(36).slice(2, 10)}`
}

type StateData = {
  nonce: string
  instanceId: string
  codeVerifier?: string
  linking?: boolean
  returnTo?: string | null
}

async function exchangeGithubPkce(inst: ProviderInstance, code: string, codeVerifier: string): Promise<string> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: callback,
    client_id: inst.clientId,
  })
  const basic = Buffer.from(`${inst.clientId}:${inst.clientSecret}`).toString('base64')
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  if (!res.ok) throw new Error(`GitHub token endpoint ${res.status}`)
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (data.error || !data.access_token) {
    throw new Error(`GitHub OAuth: ${data.error_description ?? data.error ?? 'no access_token'}`)
  }
  return data.access_token
}

function tokensToProfileFields(tokens: {
  accessToken(): string
  hasRefreshToken(): boolean
  refreshToken(): string
  accessTokenExpiresAt(): Date
}): {
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: number | null
} {
  let expiresAt: number | null = null
  try {
    expiresAt = tokens.accessTokenExpiresAt().getTime()
  } catch {
    expiresAt = null
  }
  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
    accessTokenExpiresAt: expiresAt,
  }
}

async function exchangeGithub(inst: ProviderInstance, code: string, state: StateData): Promise<ProviderProfile> {
  let tokenFields: { accessToken: string; refreshToken: string | null; accessTokenExpiresAt: number | null }
  if (inst.baseUrl === 'https://github.com' && state.codeVerifier) {
    const accessToken = await exchangeGithubPkce(inst, code, state.codeVerifier)
    tokenFields = { accessToken, refreshToken: null, accessTokenExpiresAt: null }
  } else {
    const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
    const gh = new GitHub(inst.clientId, inst.clientSecret, callback)
    const tokens = await gh.validateAuthorizationCode(code)
    tokenFields = tokensToProfileFields(tokens)
  }
  log.info({ instance: inst.id }, 'github token issued')
  const apiBase = inst.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${inst.baseUrl}/api/v3`
  const profileRes = await fetch(`${apiBase}/user`, {
    headers: { Authorization: `Bearer ${tokenFields.accessToken}`, 'User-Agent': 'tabularium/1.0' },
  })
  const profile = (await profileRes.json()) as { id: number; login: string }
  return { externalId: String(profile.id), username: profile.login, ...tokenFields }
}

async function exchangeGitlab(inst: ProviderInstance, code: string): Promise<ProviderProfile> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
  const gl = new GitLab(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
  const tokens = await gl.validateAuthorizationCode(code)
  const tokenFields = tokensToProfileFields(tokens)
  log.info({ instance: inst.id }, 'gitlab token issued')
  const profileRes = await fetch(`${inst.baseUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${tokenFields.accessToken}` },
  })
  const profile = (await profileRes.json()) as { id: number; username: string }
  return { externalId: String(profile.id), username: profile.username, ...tokenFields }
}

async function exchangeGitea(inst: ProviderInstance, code: string, state: StateData): Promise<ProviderProfile> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
  const gt = new Gitea(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
  const tokens = await gt.validateAuthorizationCode(code, state.codeVerifier!)
  const tokenFields = tokensToProfileFields(tokens)
  log.info({ instance: inst.id }, 'gitea token issued')
  const profileRes = await fetch(`${inst.baseUrl}/api/v1/user`, {
    headers: { Authorization: `Bearer ${tokenFields.accessToken}` },
  })
  const profile = (await profileRes.json()) as { id: number; login: string }
  return { externalId: String(profile.id), username: profile.login, ...tokenFields }
}

async function exchange(inst: ProviderInstance, code: string, state: StateData): Promise<ProviderProfile> {
  if (inst.kind === 'github') return exchangeGithub(inst, code, state)
  if (inst.kind === 'gitlab') return exchangeGitlab(inst, code)
  return exchangeGitea(inst, code, state)
}

async function resolveLinkUserId(authCookieValue: string | undefined): Promise<string | null> {
  if (typeof authCookieValue !== 'string') return null
  const payload = await verifyJwt(authCookieValue)
  return payload?.sub ?? null
}

export default new Elysia().get(
  '/',
  async ({ params, query, cookie, set, redirect, request }) => {
    const raw = cookie.oauth_state?.value as StateData | string | undefined
    if (!raw) {
      set.status = 400
      return { error: 'Missing state cookie' }
    }
    let stateData: StateData
    try {
      stateData = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      set.status = 400
      return { error: 'Invalid state cookie' }
    }
    if (stateData.nonce !== query.state || stateData.instanceId !== params.instance) {
      set.status = 400
      return { error: 'State mismatch' }
    }

    // State has now been validated and consumed — clear the cookie regardless
    // of what the rest of the flow does, so error paths don't leave it valid
    // for up to 10 min. Success path re-sets the auth cookie below.
    cookie.oauth_state.remove()

    const inst = getInstance(params.instance)
    if (!inst) {
      set.status = 404
      return { error: `Unknown provider instance: ${params.instance}` }
    }

    const linkUserId = stateData.linking ? await resolveLinkUserId(cookie.auth?.value as string | undefined) : null
    if (stateData.linking && !linkUserId) {
      set.status = 401
      return { error: 'Linking session expired — sign in and try again' }
    }

    try {
      const profile = await exchange(inst, query.code, stateData)
      profile.username = sanitizeUsername(profile.username)

      const existingIdentity = await db.query.identities.findFirst({
        where: { providerInstanceId: inst.id, externalId: profile.externalId },
      })

      if (existingIdentity && linkUserId && existingIdentity.userId !== linkUserId) {
        set.status = 409
        return {
          error: `This ${inst.displayName} account is already linked to a different user. Sign in with it instead.`,
        }
      }

      const encryptedToken = encryptToken(profile.accessToken)
      const encryptedRefresh = profile.refreshToken ? encryptToken(profile.refreshToken) : null
      let userId: string
      let identityId: string

      if (existingIdentity) {
        userId = existingIdentity.userId
        identityId = existingIdentity.id
        await db
          .update(identities)
          .set({
            username: profile.username,
            accessToken: encryptedToken,
            refreshToken: encryptedRefresh,
            accessTokenExpiresAt: profile.accessTokenExpiresAt,
          })
          .where(eq(identities.id, identityId))
      }

      if (!existingIdentity) {
        userId = linkUserId ?? ulid()
        identityId = ulid()

        if (!linkUserId) {
          const [{ adminCount }] = await db.select({ adminCount: count() }).from(users).where(eq(users.role, 'admin'))
          const fuseBlown = isSettingsInitialized() && getSetting(AUTO_ADMIN_FUSE_KEY) === '1'
          if (adminCount === 0 && fuseBlown) {
            log.error(
              { username: profile.username },
              'auto-admin fuse already consumed but adminCount=0 — refusing silent promotion',
            )
            set.status = 503
            return { error: 'Instance state inconsistent — restore admin via email recovery instead' }
          }
          const role = adminCount === 0 ? 'admin' : 'user'
          await db.insert(users).values({ id: userId, displayName: profile.username, role })
          if (role === 'admin') {
            log.info({ userId, username: profile.username }, 'first user promoted to admin')
            if (isSettingsInitialized()) await setSetting(AUTO_ADMIN_FUSE_KEY, '1')
          }

          // Brand-new OAuth signup (not linking). Fire-and-forget welcome email;
          // OAuth provides no email today so the helper will silently no-op,
          // but this stays correct if a provider ever yields one or if a prior
          // rootCredentials row exists for the user.
          const newUserId = userId
          const newUsername = profile.username
          queueMicrotask(() => {
            void fireWelcomeEmail({ userId: newUserId, username: newUsername })
          })
        }

        await db.insert(identities).values({
          id: identityId,
          userId,
          providerInstanceId: inst.id,
          externalId: profile.externalId,
          username: profile.username,
          accessToken: encryptedToken,
          refreshToken: encryptedRefresh,
          accessTokenExpiresAt: profile.accessTokenExpiresAt,
        })

        if (linkUserId) {
          const persist = getSetting('auth.email_recovery_persist') === '1'
          if (!persist) {
            const remaining = await db.query.identities.findMany({
              where: { userId: linkUserId },
              columns: { id: true },
            })
            if (remaining.length === 1) {
              await db.delete(rootCredentials).where(eq(rootCredentials.userId, linkUserId))
              log.info({ userId: linkUserId }, 'root_credentials revoked after first OAuth link')
            }
          }
        }
      }

      const sessionId = await createSession({
        userId: userId!,
        userAgent: request.headers.get('user-agent') ?? null,
        ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
      })
      const jwt = await signJwt({
        sub: userId!,
        identityId: identityId!,
        username: profile.username,
        providerInstanceId: inst.id,
        jti: sessionId,
      })

      cookie.auth.set({
        value: jwt,
        httpOnly: true,
        secure: isProd(),
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
        path: '/',
      })
      // `provider_instance:<id>` target shape is the canonical reference used
      // by the providers admin UI to derive last-used timestamps.
      await recordAudit({
        actorId: userId!,
        actorName: profile.username,
        action: 'provider_instance.oauth_callback',
        target: `provider_instance:${inst.id}`,
        meta: { kind: inst.kind, linking: Boolean(linkUserId) },
        ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
      })

      const webBase = env.WEB_BASE_URL ?? env.BASE_URL
      const safeTarget = safeReturnTo(stateData.returnTo ?? undefined)
      const target = safeTarget ?? (linkUserId ? '/settings' : '/welcome')
      return redirect(`${webBase}${target}`, 302)
    } catch (e) {
      if (e instanceof OAuth2RequestError) {
        set.status = 400
        return { error: 'OAuth error: ' + e.message }
      }
      log.error({ err: e, instance: params.instance }, 'auth callback failed')
      set.status = 500
      return { error: 'Internal error during auth' }
    }
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'OAuth callback for a provider instance',
      operationId: 'oauthCallback',
    },
    params: t.Object({ instance: t.String() }),
    query: t.Object({
      code: t.String(),
      state: t.String(),
    }),
  },
)
