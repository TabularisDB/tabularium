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
import { getSetting, setSetting, deleteSetting, isSettingsInitialized } from '$lib/settings'
import { recordAudit } from '$lib/audit'
import { bus } from '$lib/plugin-host'
import { safeReturnTo } from './index'

const log = logger.child({ module: 'auth-callback' })

const AUTO_ADMIN_FUSE_KEY = 'bootstrap.auto_admin_consumed'

type ProviderProfile = {
  externalId: string
  username: string
  email: string | null
  // True only when the GitHub `x-oauth-scopes` response header is present and
  // does NOT contain `user:email`. Absent header (Enterprise / forks) leaves
  // this false so we don't surface a false-positive recovery banner.
  needsEmailScope: boolean
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: number | null
}

export const EMAIL_SCOPE_RECOVERY_KEY_PREFIX = 'email.scope_recovery_needed.'

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
  const profile = (await profileRes.json()) as { id: number; login: string; email: string | null }
  // GitHub returns granted scopes in `x-oauth-scopes`. Enterprise/forks may
  // omit the header — treat absent-header as "unknown" so we don't trigger a
  // false-positive recovery prompt.
  const scopeHeader = profileRes.headers.get('x-oauth-scopes')
  const grantedScopes = (scopeHeader ?? '').split(/,\s*/).filter(Boolean)
  const hasEmailScope = grantedScopes.includes('user:email')
  const needsEmailScope = scopeHeader !== null && !hasEmailScope
  let email = profile.email ?? null
  if (!email) {
    try {
      const emailsRes = await fetch(`${apiBase}/user/emails`, {
        headers: {
          Authorization: `Bearer ${tokenFields.accessToken}`,
          'User-Agent': 'tabularium/1.0',
          Accept: 'application/json',
        },
      })
      if (emailsRes.ok) {
        const list = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>
        const primary = list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified) ?? null
        email = primary?.email ?? null
      }
    } catch {
      // scope missing or rate limit — leave email null, scope-recovery handles it
    }
  }
  return { externalId: String(profile.id), username: profile.login, email, needsEmailScope, ...tokenFields }
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
  const profile = (await profileRes.json()) as { id: number; username: string; email: string | null }
  return {
    externalId: String(profile.id),
    username: profile.username,
    email: profile.email ?? null,
    needsEmailScope: false,
    ...tokenFields,
  }
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
  const profile = (await profileRes.json()) as { id: number; login: string; email: string | null }
  return {
    externalId: String(profile.id),
    username: profile.login,
    email: profile.email ?? null,
    needsEmailScope: false,
    ...tokenFields,
  }
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

        // Non-destructive email backfill: only fill when the user row has
        // no email yet, and only if no other user already claims it.
        if (profile.email) {
          const existingUser = await db.query.users.findFirst({ where: { id: existingIdentity.userId } })
          if (existingUser && !existingUser.email) {
            const dupe = await db.query.users.findFirst({ where: { email: profile.email } })
            if (!dupe) {
              await db.update(users).set({ email: profile.email }).where(eq(users.id, existingIdentity.userId))
            } else {
              log.warn(
                { email: profile.email, ourUserId: existingIdentity.userId, conflictUserId: dupe.id },
                'email taken — skipping backfill on existing identity',
              )
            }
          }
        }
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

          // users.email is UNIQUE. If another user already claims it (e.g. a
          // partial earlier signup), persist without the email and log; the
          // user can set it via the self-service endpoint (Task 4).
          let emailToPersist: string | null = profile.email
          if (emailToPersist) {
            const dupe = await db.query.users.findFirst({ where: { email: emailToPersist } })
            if (dupe) {
              log.warn(
                { email: emailToPersist, ourUserId: userId, conflictUserId: dupe.id },
                'email taken — saving user without email',
              )
              emailToPersist = null
            }
          }
          await db
            .insert(users)
            .values({ id: userId, displayName: profile.username, email: emailToPersist, locale: 'en', role })
          if (role === 'admin') {
            log.info({ userId, username: profile.username }, 'first user promoted to admin')
            if (isSettingsInitialized()) await setSetting(AUTO_ADMIN_FUSE_KEY, '1')
          }

          // Brand-new OAuth signup (not linking). Emit the welcome event
          // only when we know an email — OAuth providers may not surface
          // one. The plugin-email subscriber also re-checks via the
          // resolveUserContact fallback chain, but skipping the emit when
          // we have no email keeps the bus chatter clean.
          if (profile.email && emailToPersist) {
            bus.emit('account.welcome', {
              user: { id: userId, email: emailToPersist, locale: 'en' },
              username: profile.username,
            })
          }
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

        if (linkUserId && profile.email) {
          // Non-destructive backfill on link: fill the linked user's email
          // only if currently null and no other user already claims it.
          const u = await db.query.users.findFirst({ where: { id: linkUserId } })
          if (u && !u.email) {
            const dupe = await db.query.users.findFirst({ where: { email: profile.email } })
            if (!dupe) {
              await db.update(users).set({ email: profile.email }).where(eq(users.id, linkUserId))
            } else {
              log.warn(
                { email: profile.email, ourUserId: linkUserId, conflictUserId: dupe.id },
                'email taken — skipping backfill on link',
              )
            }
          }
        }

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

      // Persist a per-user "email scope recovery needed" flag. Only fires for
      // GitHub instances where we OBSERVED a scope header that lacked
      // `user:email` AND no email could be captured. On any other outcome
      // (email captured, scope confirmed present, non-GitHub provider) the
      // flag is cleared so stale state doesn't survive a successful re-auth.
      const recoveryNeeded =
        inst.kind === 'github' && profile.email == null && profile.needsEmailScope === true
      if (recoveryNeeded) {
        await setSetting(`${EMAIL_SCOPE_RECOVERY_KEY_PREFIX}${userId!}`, '1')
      } else {
        await deleteSetting(`${EMAIL_SCOPE_RECOVERY_KEY_PREFIX}${userId!}`)
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
      const defaultTarget = recoveryNeeded
        ? linkUserId
          ? '/settings/email'
          : '/welcome'
        : linkUserId
          ? '/settings'
          : '/welcome'
      const target = safeTarget ?? defaultTarget
      const hintedTarget = recoveryNeeded
        ? `${target}${target.includes('?') ? '&' : '?'}email-scope=needed`
        : target
      return redirect(`${webBase}${hintedTarget}`, 302)
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
