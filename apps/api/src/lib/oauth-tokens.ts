import { eq } from 'drizzle-orm'
import { GitHub, GitLab, Gitea } from 'arctic'
import { db } from '../db'
import { identities } from '../db/schema'
import type { ProviderInstance } from './provider-instance'
import { decryptToken, encryptToken } from './crypto'
import { env } from './env'
import { logger } from './logger'

const log = logger.child({ module: 'oauth-tokens' })

const EARLY_REFRESH_MS = 60_000

export class OAuthExpiredError extends Error {
  constructor(
    public readonly providerInstanceId: string,
    public readonly identityId: string,
    cause?: unknown,
  ) {
    super(`OAuth token expired for provider instance ${providerInstanceId}; re-link required`)
    this.name = 'OAuthExpiredError'
    if (cause) this.cause = cause
  }
}

export type IdentityWithTokens = {
  id: string
  providerInstanceId: string
  accessToken: string | null
  refreshToken: string | null
  accessTokenExpiresAt: number | null
}

export async function getValidAccessToken(identity: IdentityWithTokens, instance: ProviderInstance): Promise<string> {
  if (!identity.accessToken) throw new OAuthExpiredError(identity.providerInstanceId, identity.id)

  const expiresAt = identity.accessTokenExpiresAt
  const now = Date.now()
  if (!expiresAt || expiresAt > now + EARLY_REFRESH_MS) {
    return decryptToken(identity.accessToken)
  }

  if (!identity.refreshToken) {
    throw new OAuthExpiredError(identity.providerInstanceId, identity.id)
  }

  try {
    const refreshed = await refreshTokens(instance, decryptToken(identity.refreshToken))
    await db
      .update(identities)
      .set({
        accessToken: encryptToken(refreshed.accessToken),
        refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : identity.refreshToken,
        accessTokenExpiresAt: refreshed.expiresAt,
      })
      .where(eq(identities.id, identity.id))
    log.info({ identityId: identity.id, instance: instance.id }, 'oauth token refreshed')
    return refreshed.accessToken
  } catch (err) {
    log.warn({ err, identityId: identity.id, instance: instance.id }, 'token refresh failed')
    throw new OAuthExpiredError(identity.providerInstanceId, identity.id, err)
  }
}

type RefreshResult = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
}

async function refreshTokens(instance: ProviderInstance, refreshToken: string): Promise<RefreshResult> {
  const callback = `${env.BASE_URL}/auth/${instance.id}/callback`
  let tokens
  if (instance.kind === 'github') {
    tokens = await new GitHub(instance.clientId, instance.clientSecret, callback).refreshAccessToken(refreshToken)
  } else if (instance.kind === 'gitlab') {
    tokens = await new GitLab(instance.baseUrl, instance.clientId, instance.clientSecret, callback).refreshAccessToken(
      refreshToken,
    )
  } else {
    tokens = await new Gitea(instance.baseUrl, instance.clientId, instance.clientSecret, callback).refreshAccessToken(
      refreshToken,
    )
  }
  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
    expiresAt: tryExpiresAt(tokens),
  }
}

function tryExpiresAt(tokens: { accessTokenExpiresAt(): Date }): number | null {
  try {
    return tokens.accessTokenExpiresAt().getTime()
  } catch {
    return null
  }
}

export function reauthErrorBody(err: OAuthExpiredError): { error: string; reauthFor: string } {
  return {
    error: 'OAuth token expired — re-authorization needed',
    reauthFor: err.providerInstanceId,
  }
}
