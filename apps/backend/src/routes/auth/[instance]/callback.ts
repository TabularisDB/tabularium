import { Elysia, t } from 'elysia'
import { GitHub, GitLab, Gitea, OAuth2RequestError } from 'arctic'
import { ulid } from 'ulid'
import { count, eq, and } from 'drizzle-orm'
import { db } from '$db'
import { users, identities, rootCredentials } from '$db/schema'
import { signJwt, verifyJwt } from '$lib/jwt'
import { encryptToken } from '$lib/crypto'
import { getInstance, type ProviderInstance } from '$lib/provider-instance'
import { env, isProd } from '$lib/env'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'auth-callback' })

type ProviderProfile = {
  externalId: string
  username: string
  accessToken: string
}

type StateData = {
  nonce: string
  instanceId: string
  codeVerifier?: string
  linking?: boolean
  returnTo?: string | null
}

async function exchangeGithub(inst: ProviderInstance, code: string): Promise<ProviderProfile> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
  const gh = new GitHub(inst.clientId, inst.clientSecret, callback)
  const tokens = await gh.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()
  log.info({ instance: inst.id }, 'github token issued')
  const apiBase = inst.baseUrl === 'https://github.com' ? 'https://api.github.com' : `${inst.baseUrl}/api/v3`
  const profileRes = await fetch(`${apiBase}/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'pluggr/1.0' },
  })
  const profile = await profileRes.json() as { id: number; login: string }
  return { externalId: String(profile.id), username: profile.login, accessToken }
}

async function exchangeGitlab(inst: ProviderInstance, code: string): Promise<ProviderProfile> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
  const gl = new GitLab(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
  const tokens = await gl.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()
  log.info({ instance: inst.id }, 'gitlab token issued')
  const profileRes = await fetch(`${inst.baseUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const profile = await profileRes.json() as { id: number; username: string }
  return { externalId: String(profile.id), username: profile.username, accessToken }
}

async function exchangeGitea(inst: ProviderInstance, code: string, state: StateData): Promise<ProviderProfile> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`
  const gt = new Gitea(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
  const tokens = await gt.validateAuthorizationCode(code, state.codeVerifier!)
  const accessToken = tokens.accessToken()
  log.info({ instance: inst.id }, 'gitea token issued')
  const profileRes = await fetch(`${inst.baseUrl}/api/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const profile = await profileRes.json() as { id: number; login: string }
  return { externalId: String(profile.id), username: profile.login, accessToken }
}

async function exchange(inst: ProviderInstance, code: string, state: StateData): Promise<ProviderProfile> {
  if (inst.kind === 'github') return exchangeGithub(inst, code)
  if (inst.kind === 'gitlab') return exchangeGitlab(inst, code)
  return exchangeGitea(inst, code, state)
}

async function resolveLinkUserId(authCookieValue: string | undefined): Promise<string | null> {
  if (typeof authCookieValue !== 'string') return null
  const payload = await verifyJwt(authCookieValue)
  return payload?.sub ?? null
}

export default new Elysia()
  .get('/', async ({ params, query, cookie, set, redirect }) => {
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

    const inst = getInstance(params.instance)
    if (!inst) {
      set.status = 404
      return { error: `Unknown provider instance: ${params.instance}` }
    }

    const linkUserId = stateData.linking
      ? await resolveLinkUserId(cookie.auth?.value as string | undefined)
      : null
    if (stateData.linking && !linkUserId) {
      set.status = 401
      return { error: 'Linking session expired — sign in and try again' }
    }

    try {
      const profile = await exchange(inst, query.code, stateData)

      const existingIdentity = await db.query.identities.findFirst({
        where: { providerInstanceId: inst.id, externalId: profile.externalId },
      })

      if (existingIdentity && linkUserId && existingIdentity.userId !== linkUserId) {
        set.status = 409
        return { error: `This ${inst.displayName} account is already linked to a different user. Sign in with it instead.` }
      }

      const encryptedToken = encryptToken(profile.accessToken)
      let userId: string
      let identityId: string

      if (existingIdentity) {
        userId = existingIdentity.userId
        identityId = existingIdentity.id
        await db.update(identities)
          .set({ username: profile.username, accessToken: encryptedToken })
          .where(eq(identities.id, identityId))
      }

      if (!existingIdentity) {
        userId = linkUserId ?? ulid()
        identityId = ulid()

        if (!linkUserId) {
          const [{ adminCount }] = await db
            .select({ adminCount: count() })
            .from(users)
            .where(eq(users.role, 'admin'))
          const role = adminCount === 0 ? 'admin' : 'user'
          await db.insert(users).values({ id: userId, displayName: profile.username, role })
          if (role === 'admin') log.info({ userId, username: profile.username }, 'first user promoted to admin')
        }

        await db.insert(identities).values({
          id: identityId,
          userId,
          providerInstanceId: inst.id,
          externalId: profile.externalId,
          username: profile.username,
          accessToken: encryptedToken,
        })

        if (linkUserId) {
          const remaining = await db.query.identities.findMany({
            where: { userId: linkUserId },
            columns: { id: true },
          })
          if (remaining.length === 1) {
            const deleted = await db.delete(rootCredentials).where(eq(rootCredentials.userId, linkUserId))
            if (deleted) log.info({ userId: linkUserId }, 'root_credentials revoked after first OAuth link')
          }
        }
      }

      const jwt = await signJwt({
        sub: userId!,
        identityId: identityId!,
        username: profile.username,
        providerInstanceId: inst.id,
      })

      cookie.auth.set({
        value: jwt,
        httpOnly: true,
        secure: isProd(),
        maxAge: 3600,
        sameSite: 'lax',
        path: '/',
      })
      cookie.oauth_state.remove()

      const webBase = env.WEB_BASE_URL ?? env.BASE_URL
      const target = stateData.returnTo ?? (linkUserId ? '/settings' : '/welcome')
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
  }, {
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
  })
