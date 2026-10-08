import { createHash, randomBytes } from 'node:crypto'
import { db } from '$db'
import { env } from '$lib/env'
import type { JwtPayload } from '$lib/jwt'
import type { DelegatedAccess } from '$lib/access'
import { recordAudit } from '$lib/audit'
import { putRecord, readRecord, consumeRecord, revokeRecord, userGrants } from './store'

const DAY = 86400_000
export const ACCESS_SECONDS = 900
export const ADMIN_AREAS = [
  'plugins',
  'users',
  'manifest',
  'docs',
  'pages',
  'settings',
  'provider-instances',
  'features',
  'kinds',
  'branding',
  'home-copy',
  'i18n',
  'instance',
  'infra',
  'audit',
  'diagnostics',
  'requests',
]
export const SCOPES = [
  'catalog:read',
  'account:read',
  'plugins:write',
  'requests:write',
  ...ADMIN_AREAS.flatMap((a) => [`admin:${a}:read`, `admin:${a}:write`]),
]
export const issuerUrl = () => env.BASE_URL.replace(/\/$/, '')
export const resourceUrl = () => `${issuerUrl()}/mcp`
export const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export const challenge = (s: string) => createHash('sha256').update(s).digest('base64url')
export const secret = () => randomBytes(32).toString('base64url')
export class OAuthError extends Error {
  constructor(
    public error: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
function fail(error: string, message: string): never {
  throw new OAuthError(error, message)
}
export type Client = {
  client_id: string
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: 'none'
}
type Grant = { clientId: string; user: JwtPayload; scopes: string[]; resource: string; createdAt: number }
type Credential = { grantId: string; clientId: string; resource: string }
type Code = Credential & { redirect: string; challenge: string }
export type AuthParams = Record<string, string>

export async function registerClient(raw: Record<string, unknown>): Promise<Client> {
  if (typeof raw.client_name !== 'string' || !raw.client_name.trim() || raw.client_name.length > 100)
    fail('invalid_client_metadata', 'client_name must be 1–100 characters')
  if (raw.token_endpoint_auth_method !== undefined && raw.token_endpoint_auth_method !== 'none')
    fail('invalid_client_metadata', 'Only public clients with PKCE are supported')
  for (const [key, allowed] of [
    ['grant_types', ['authorization_code', 'refresh_token']],
    ['response_types', ['code']],
  ] as const) {
    const value = raw[key]
    if (
      value !== undefined &&
      (!Array.isArray(value) || !value.length || value.some((v) => !allowed.includes(v as never)))
    )
      fail('invalid_client_metadata', `Unsupported ${key}`)
  }
  if (!Array.isArray(raw.redirect_uris) || !raw.redirect_uris.length || raw.redirect_uris.length > 10)
    fail('invalid_redirect_uri', 'Provide 1–10 redirect URIs')
  for (const uri of raw.redirect_uris) {
    let u: URL
    try {
      if (typeof uri !== 'string' || uri.length > 2048) throw new Error()
      u = new URL(uri)
    } catch {
      fail('invalid_redirect_uri', 'Invalid redirect URI')
    }
    if (
      u.username ||
      u.password ||
      u.hash ||
      uri.includes('#') ||
      !(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)))
    )
      fail('invalid_redirect_uri', 'Use HTTPS or an HTTP loopback callback, without credentials or fragments')
  }
  const client: Client = {
    client_id: secret(),
    client_name: raw.client_name.trim(),
    redirect_uris: raw.redirect_uris as string[],
    token_endpoint_auth_method: 'none',
  }
  await putRecord(client.client_id, 'client', client, Date.now() + 365 * DAY)
  return client
}
export async function validateAuthorization(p: AuthParams) {
  const row = await readRecord<Client>(p.client_id ?? '', 'client')
  if (!row || row.expiresAt <= Date.now()) fail('invalid_client', 'Unknown or expired client')
  if (!row.data.redirect_uris.includes(p.redirect_uri)) fail('invalid_request', 'Unregistered redirect URI')
  if (
    p.response_type !== 'code' ||
    p.code_challenge_method !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge ?? '')
  )
    fail('invalid_request', 'Authorization code with S256 PKCE is required')
  if (p.resource !== resourceUrl()) fail('invalid_target', 'resource must be the canonical MCP URL')
  const scopes = [...new Set((p.scope || 'catalog:read').split(' ').filter(Boolean))]
  if (!scopes.length || scopes.some((s) => !SCOPES.includes(s))) fail('invalid_scope', 'Unknown scope')
  if ((p.state?.length ?? 0) > 1024) fail('invalid_request', 'state too long')
  return { client: row.data, scopes }
}
export async function authorize(p: AuthParams, user: JwtPayload): Promise<string> {
  const { scopes } = await validateAuthorization(p)
  const account = await db.query.users.findFirst({ where: { id: user.sub } })
  if (!account || user.bootstrap) fail('access_denied', 'User unavailable')
  if (scopes.some((s) => s.startsWith('admin:')) && account.role !== 'admin')
    fail('access_denied', 'Admin scopes require an administrator')
  const grantId = secret()
  // A grant is independent of the browser login session. Revoking a connection
  // is explicit; never carry the browser's jti into delegated REST dispatch.
  const { jti: _jti, ...identity } = user
  await putRecord(
    grantId,
    'grant',
    { clientId: p.client_id, user: identity, scopes, resource: resourceUrl(), createdAt: Date.now() } satisfies Grant,
    Date.now() + 30 * DAY,
    user.sub,
  )
  const code = secret()
  await putRecord(
    hash(code),
    'code',
    {
      grantId,
      clientId: p.client_id,
      resource: resourceUrl(),
      redirect: p.redirect_uri,
      challenge: p.code_challenge,
    } satisfies Code,
    Date.now() + 300_000,
    user.sub,
  )
  await recordAudit({
    actorId: user.sub,
    action: 'oauth.authorize',
    target: `oauth:${grantId}`,
    meta: { clientId: p.client_id, scopes },
  })
  return code
}
async function activeGrant(id: string) {
  const grant = await readRecord<Grant>(id, 'grant')
  if (!grant || grant.revokedAt || grant.expiresAt <= Date.now()) return null
  const user = await db.query.users.findFirst({ where: { id: grant.userId! } })
  return user ? { ...grant, role: user.role } : null
}
async function issueTokens(grantId: string) {
  const grant = await activeGrant(grantId)
  if (!grant) fail('invalid_grant', 'Connection expired or revoked')
  const access_token = `tba_${secret()}`
  const refresh_token = `tbr_${secret()}`
  const data: Credential = { grantId, clientId: grant.data.clientId, resource: grant.data.resource }
  const expiresAt = Math.min(Date.now() + ACCESS_SECONDS * 1000, grant.expiresAt)
  await putRecord(hash(access_token), 'access', data, expiresAt, grant.userId)
  await putRecord(hash(refresh_token), 'refresh', data, grant.expiresAt, grant.userId)
  return {
    access_token,
    refresh_token,
    token_type: 'Bearer',
    expires_in: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
    scope: grant.data.scopes.join(' '),
  }
}
export async function exchangeCode(p: AuthParams) {
  const row = await readRecord<Code>(hash(p.code ?? ''), 'code')
  if (
    !row ||
    row.data.clientId !== p.client_id ||
    row.data.redirect !== p.redirect_uri ||
    p.resource !== row.data.resource ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier ?? '') ||
    challenge(p.code_verifier) !== row.data.challenge
  )
    fail('invalid_grant', 'Invalid authorization code or binding')
  if (row.consumedBy) {
    await revokeRecord(row.data.grantId)
    fail('invalid_grant', 'Authorization code already used')
  }
  if (row.expiresAt <= Date.now()) fail('invalid_grant', 'Authorization code expired')
  if (!(await consumeRecord(row.id))) {
    await revokeRecord(row.data.grantId)
    fail('invalid_grant', 'Authorization code already used')
  }
  return issueTokens(row.data.grantId)
}
export async function refreshAccess(p: AuthParams) {
  const row = await readRecord<Credential>(hash(p.refresh_token ?? ''), 'refresh')
  if (!row || row.data.clientId !== p.client_id || row.data.resource !== p.resource)
    fail('invalid_grant', 'Invalid refresh token or binding')
  if (row.consumedBy) {
    await revokeRecord(row.data.grantId)
    fail('invalid_grant', 'Refresh token reuse revoked this connection')
  }
  if (row.expiresAt <= Date.now()) fail('invalid_grant', 'Refresh token expired')
  const grant = await activeGrant(row.data.grantId)
  if (!grant) fail('invalid_grant', 'Connection expired or revoked')
  if (p.scope && p.scope !== grant.data.scopes.join(' '))
    fail('invalid_scope', 'Scope changes require a new authorization')
  if (!(await consumeRecord(row.id))) {
    await revokeRecord(row.data.grantId)
    fail('invalid_grant', 'Refresh token already used')
  }
  return issueTokens(row.data.grantId)
}
export async function verifyAccess(token: string): Promise<(DelegatedAccess & { role: string }) | null> {
  if (!token.startsWith('tba_') || token.length > 100) return null
  const row = await readRecord<Credential>(hash(token), 'access')
  if (!row || row.expiresAt <= Date.now() || row.data.resource !== resourceUrl()) return null
  const grant = await activeGrant(row.data.grantId)
  if (!grant || grant.data.resource !== resourceUrl()) return null
  return {
    user: grant.data.user,
    clientId: grant.data.clientId,
    grantId: grant.id,
    scopes: grant.data.scopes,
    role: grant.role,
  }
}
export async function revokeGrant(userId: string, grantId: string) {
  const grant = await readRecord<Grant>(grantId, 'grant')
  if (!grant || grant.userId !== userId) throw new OAuthError('access_denied', 'Connection not found', 404)
  await revokeRecord(grantId)
  await recordAudit({
    actorId: userId,
    action: 'oauth.revoke',
    target: `oauth:${grantId}`,
    meta: { clientId: grant.data.clientId },
  })
}
export async function revokeToken(token: string, clientId: string) {
  const row = await readRecord<Credential>(hash(token), token.startsWith('tbr_') ? 'refresh' : 'access')
  if (row && row.data.clientId === clientId) await revokeRecord(row.data.grantId)
}
export async function listGrants(userId: string) {
  const rows = await userGrants(userId)
  return Promise.all(
    rows
      .filter((r) => !r.revokedAt && r.expiresAt > Date.now())
      .map(async (r) => {
        const grant = JSON.parse(r.payload) as Grant
        const client = await readRecord<Client>(grant.clientId, 'client')
        return {
          id: r.id,
          clientName: client?.data.client_name ?? grant.clientId,
          scopes: grant.scopes,
          createdAt: grant.createdAt,
          expiresAt: r.expiresAt,
        }
      }),
  )
}
