import { Elysia, t } from 'elysia'
import { GitHub, GitLab, Gitea, generateState, generateCodeVerifier } from 'arctic'
import { verifyJwt } from '$lib/jwt'
import { getInstance, type ProviderInstance } from '$lib/provider-instance'
import { env, isProd } from '$lib/env'
import { safeReturnTo } from '$lib/return-to'

async function s256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function buildAuthUrl(
  inst: ProviderInstance,
  state: string,
  linking: boolean,
  extraScopes: string[] = [],
): Promise<{ url: URL; codeVerifier?: string }> {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`

  if (inst.kind === 'github') {
    const gh = new GitHub(inst.clientId, inst.clientSecret, callback)
    const scopes = ['read:user', 'read:org']
    if (extraScopes.includes('webhook')) scopes.push('write:repo_hook')
    if (extraScopes.includes('workflow')) scopes.push('public_repo', 'workflow')
    const url = gh.createAuthorizationURL(state, scopes)
    if (linking) url.searchParams.set('prompt', 'consent')
    if (inst.baseUrl === 'https://github.com') {
      const codeVerifier = generateCodeVerifier()
      url.searchParams.set('code_challenge', await s256Challenge(codeVerifier))
      url.searchParams.set('code_challenge_method', 'S256')
      return { url, codeVerifier }
    }
    return { url }
  }

  if (inst.kind === 'gitlab') {
    const gl = new GitLab(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
    const url = gl.createAuthorizationURL(state, ['read_user', extraScopes.includes('webhook') ? 'api' : 'read_api'])
    if (linking) url.searchParams.set('prompt', 'consent')
    return { url }
  }

  const codeVerifier = generateCodeVerifier()
  const gt = new Gitea(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
  const url = gt.createAuthorizationURL(state, codeVerifier, [
    'read:user',
    extraScopes.includes('webhook') ? 'write:repository' : 'read:repository',
    'read:organization',
  ])
  if (linking) url.searchParams.set('prompt', 'consent')
  return { url, codeVerifier }
}

export default new Elysia().get(
  '/',
  async ({ params, query, set, cookie, redirect }) => {
    const inst = getInstance(params.instance)
    if (!inst) {
      set.status = 404
      return { error: `Unknown provider instance: ${params.instance}` }
    }
    if (!inst.enabled) {
      set.status = 503
      return { error: `Provider instance ${params.instance} is disabled` }
    }

    const linking = query.link === '1'
    if (linking) {
      const token = cookie.auth?.value
      const payload = typeof token === 'string' ? await verifyJwt(token) : null
      if (!payload) {
        set.status = 401
        return { error: 'Must be signed in to link an account' }
      }
    }

    const state = generateState()
    const returnTo = safeReturnTo(query.return_to)
    const extraScopes = query.scope ? query.scope.split(/[\s,]+/).filter(Boolean) : []
    const { url, codeVerifier } = await buildAuthUrl(inst, state, linking, extraScopes)

    cookie.oauth_state.set({
      value: { nonce: state, instanceId: inst.id, codeVerifier, linking, returnTo },
      httpOnly: true,
      secure: isProd(),
      maxAge: 600,
      sameSite: 'lax',
      path: `/auth/${inst.id}/callback`,
    })

    return redirect(url.toString(), 302)
  },
  {
    detail: {
      tags: ['Auth'],
      summary: 'Start OAuth flow for a provider instance',
      description:
        "Redirects to the provider instance's authorize page with read-only access by default. Instance IDs are configured by the admin (e.g. `github`, `gitlab`, `forgejo-acme`). Set `link=1` to attach this identity to the currently signed-in user. `scope=webhook` optionally requests webhook creation access. `scope=workflow` requests GitHub public repository write and workflow access for scaffolding; other values are ignored.",
      operationId: 'startOAuth',
    },
    params: t.Object({ instance: t.String() }),
    query: t.Object({
      link: t.Optional(t.String()),
      return_to: t.Optional(t.String()),
      scope: t.Optional(t.String({ maxLength: 100 })),
    }),
  },
)
