import { env, isProd, allowedOrigins } from '$lib/env'
import { verifySessionToken } from '$lib/access'
import { page, loginPage, scopeLabel, escapeHtml as esc } from './pages'
import { putRecord, readRecord, consumeRecord } from './store'
import {
  OAuthError,
  registerClient,
  validateAuthorization,
  authorize,
  exchangeCode,
  refreshAccess,
  revokeToken,
  revokeGrant,
  listGrants,
  secret,
  issuerUrl,
  resourceUrl,
  SCOPES,
  type AuthParams,
} from './server'

type Pending = { params: AuthParams; csrf?: string }
const cookieName = () => (isProd() ? '__Host-tabularium_oauth' : 'tabularium_oauth')
function cookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
async function currentUser(request: Request) {
  const token = cookie(request, 'auth')
  return token ? verifySessionToken(token) : null
}
function csrfCookie(value: string) {
  return `${cookieName()}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isProd() ? '; Secure' : ''}`
}
export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', pragma: 'no-cache', ...extra } })
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  if (reader)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 32768) {
        await reader.cancel()
        throw new OAuthError('invalid_request', 'Request too large', 413)
      }
      chunks.push(value)
    }
  const raw = Buffer.concat(chunks).toString('utf8')
  const contentType = request.headers.get('content-type')?.split(';')[0]
  if (contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(raw)
    if (new Set(params.keys()).size !== [...params.keys()].length)
      throw new OAuthError('invalid_request', 'Duplicate parameters')
    return Object.fromEntries(params)
  }
  if (contentType !== 'application/json') throw new OAuthError('invalid_request', 'Use JSON or form encoding', 415)
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed
  } catch {
    throw new OAuthError('invalid_request', 'Invalid JSON object')
  }
}
function strings(raw: Record<string, unknown>): AuthParams {
  if (Object.values(raw).some((v) => typeof v !== 'string'))
    throw new OAuthError('invalid_request', 'Parameters must be strings')
  return raw as AuthParams
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (
    origin &&
    !allowedOrigins()
      .map((value) => new URL(value).origin)
      .includes(origin)
  )
    throw new OAuthError('access_denied', 'Invalid origin', 403)
}
function requireCsrf(request: Request, posted: string, expected: string) {
  sameOrigin(request)
  if (!posted || posted !== expected || cookie(request, cookieName()) !== expected)
    throw new OAuthError('access_denied', 'Invalid or expired form', 403)
}
export async function oauthResponse(action: () => Promise<Response>, request?: Request) {
  try {
    return await action()
  } catch (e) {
    if (e instanceof OAuthError) {
      if (request?.headers.get('accept')?.includes('text/html')) {
        const response = page(
          'Connection could not be completed',
          `<p class="error" role="alert">${esc(e.message)}</p><p>Return to your assistant and start the connection again. Your existing connections are unchanged.</p><p><a href="/oauth/connections">Manage connected applications</a></p>`,
        )
        return new Response(response.body, { status: e.status, headers: response.headers })
      }
      return json({ error: e.error, error_description: e.message }, e.status)
    }
    throw e
  }
}
export async function authorizationPage(request: Request) {
  const query = new URL(request.url).searchParams
  if (new Set(query.keys()).size !== [...query.keys()].length)
    throw new OAuthError('invalid_request', 'Duplicate parameters')
  let params = Object.fromEntries(query)
  let pendingId = query.get('request')
  if (pendingId) {
    const pending = await readRecord<Pending>(pendingId, 'consent')
    if (!pending || pending.expiresAt <= Date.now() || pending.consumedBy)
      throw new OAuthError('invalid_request', 'Authorization request expired')
    params = pending.data.params
  }
  const { client, scopes } = await validateAuthorization(params)
  const user = await currentUser(request)
  if (!user) {
    if (!pendingId) {
      pendingId = secret()
      await putRecord(pendingId, 'consent', { params }, Date.now() + 600_000)
    }
    return loginPage(`/oauth/authorize?request=${pendingId}`)
  }
  const csrf = secret()
  const id = secret()
  await putRecord(id, 'consent', { params, csrf }, Date.now() + 600_000, user.sub)
  const response = page(
    'Allow this connection?',
    `<p><strong>${esc(client.client_name)}</strong> wants access as <strong>${esc(user.username)}</strong>.</p><section><h2>Requested permissions</h2><ul>${scopes.map((s) => `<li>${esc(scopeLabel(s))}</li>`).join('')}</ul><p class="muted">Access is limited by your current Tabularium permissions. This connection expires after 30 days and can be revoked at any time.</p></section><p class="muted">Registered callback: <code>${esc(params.redirect_uri)}</code></p><form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${id}"><input type="hidden" name="csrf" value="${csrf}"><div class="actions"><button name="decision" value="allow">Allow access</button><button name="decision" value="deny">Deny</button></div></form><p><a href="/oauth/connections">Manage connections</a></p>`,
    new URL(params.redirect_uri).origin,
  )
  response.headers.set('set-cookie', csrfCookie(csrf))
  return response
}
export async function authorizationDecision(request: Request) {
  const body = strings(await readBody(request))
  const row = await readRecord<Pending>(body.request ?? '', 'consent')
  const user = await currentUser(request)
  if (!row || !user || row.userId !== user.sub || !row.data.csrf || row.expiresAt <= Date.now())
    throw new OAuthError('access_denied', 'Invalid or expired form', 403)
  requireCsrf(request, body.csrf, row.data.csrf)
  if (!['allow', 'deny'].includes(body.decision)) throw new OAuthError('invalid_request', 'Choose allow or deny')
  await validateAuthorization(row.data.params)
  if (!(await consumeRecord(row.id))) throw new OAuthError('invalid_request', 'Form already used')
  const target = new URL(row.data.params.redirect_uri)
  if (body.decision === 'deny') target.searchParams.set('error', 'access_denied')
  else target.searchParams.set('code', await authorize(row.data.params, user))
  if (row.data.params.state !== undefined) target.searchParams.set('state', row.data.params.state)
  target.searchParams.set('iss', issuerUrl())
  return new Response(null, {
    status: 303,
    headers: { location: target.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })
}
export async function tokenResponse(request: Request) {
  const p = strings(await readBody(request))
  if (p.grant_type === 'authorization_code') return json(await exchangeCode(p))
  if (p.grant_type === 'refresh_token') return json(await refreshAccess(p))
  throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token')
}
export async function registrationResponse(request: Request) {
  return json(
    {
      ...(await registerClient(await readBody(request))),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    201,
  )
}
export async function revocationResponse(request: Request) {
  const p = strings(await readBody(request))
  await revokeToken(p.token ?? '', p.client_id ?? '')
  return json({})
}
export async function connectionsPage(request: Request) {
  const user = await currentUser(request)
  if (!user) return loginPage('/oauth/connections')
  const csrf = secret()
  const list = await listGrants(user.sub)
  const response = page(
    'Connected applications',
    `${new URL(request.url).searchParams.get('revoked') === '1' ? '<p class="success" role="status">Connection revoked. This application can no longer access your account.</p>' : ''}<p>Connections for <strong>${esc(user.username)}</strong>. Revoking a connection immediately disables its access and refresh tokens.</p>${list.length ? list.map((g) => `<section><h2>${esc(g.clientName)}</h2><p>${g.scopes.map((s) => `<span>${esc(scopeLabel(s))}</span>`).join(', ')}</p><p class="muted">Expires ${esc(new Date(g.expiresAt).toISOString().slice(0, 10))}</p><form action="/oauth/connections" method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="grant" value="${g.id}"><button>Revoke connection</button></form></section>`).join('') : '<p>No active connections.</p>'}<a href="${esc(env.WEB_BASE_URL ?? env.BASE_URL)}">Back to Tabularium</a>`,
  )
  response.headers.set('set-cookie', csrfCookie(csrf))
  return response
}
export async function revokeConnection(request: Request) {
  const user = await currentUser(request)
  if (!user) throw new OAuthError('access_denied', 'Sign in first', 401)
  const p = strings(await readBody(request))
  requireCsrf(request, p.csrf, cookie(request, cookieName()) ?? '')
  await revokeGrant(user.sub, p.grant)
  return new Response(null, {
    status: 303,
    headers: { location: '/oauth/connections?revoked=1', 'cache-control': 'no-store' },
  })
}
export const authorizationMetadata = () =>
  json(
    {
      issuer: issuerUrl(),
      authorization_endpoint: `${issuerUrl()}/oauth/authorize`,
      token_endpoint: `${issuerUrl()}/oauth/token`,
      registration_endpoint: `${issuerUrl()}/oauth/register`,
      revocation_endpoint: `${issuerUrl()}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: SCOPES,
      authorization_response_iss_parameter_supported: true,
    },
    200,
    { 'access-control-allow-origin': '*' },
  )
export const resourceMetadata = () =>
  json(
    {
      resource: resourceUrl(),
      authorization_servers: [issuerUrl()],
      scopes_supported: SCOPES,
      bearer_methods_supported: ['header'],
    },
    200,
    { 'access-control-allow-origin': '*' },
  )
