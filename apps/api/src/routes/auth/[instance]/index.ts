import { Elysia, t } from 'elysia'
import { GitHub, GitLab, Gitea, generateState, generateCodeVerifier } from 'arctic'
import { verifyJwt } from '$lib/jwt'
import { getInstance, type ProviderInstance } from '$lib/provider-instance'
import { env, isProd } from '$lib/env'

function safeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

function buildAuthUrl(inst: ProviderInstance, state: string, linking: boolean): { url: URL; codeVerifier?: string } {
  const callback = `${env.BASE_URL}/auth/${inst.id}/callback`

  if (inst.kind === 'github') {
    const gh = new GitHub(inst.clientId, inst.clientSecret, callback)
    const url = gh.createAuthorizationURL(state, ['read:user', 'read:org', 'public_repo', 'admin:repo_hook'])
    if (linking) url.searchParams.set('prompt', 'consent')
    return { url }
  }

  if (inst.kind === 'gitlab') {
    const gl = new GitLab(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
    const url = gl.createAuthorizationURL(state, ['read_user', 'api'])
    if (linking) url.searchParams.set('prompt', 'consent')
    return { url }
  }

  // gitea-flavored (Codeberg, self-hosted Forgejo/Gitea)
  const codeVerifier = generateCodeVerifier()
  const gt = new Gitea(inst.baseUrl, inst.clientId, inst.clientSecret, callback)
  const url = gt.createAuthorizationURL(state, codeVerifier, ['read:user', 'write:repository', 'read:organization'])
  if (linking) url.searchParams.set('prompt', 'consent')
  return { url, codeVerifier }
}

export default new Elysia()
  .get('/', async ({ params, query, set, cookie, redirect }) => {
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
    const { url, codeVerifier } = buildAuthUrl(inst, state, linking)

    cookie.oauth_state.set({
      value: { nonce: state, instanceId: inst.id, codeVerifier, linking, returnTo },
      httpOnly: true,
      secure: isProd(),
      maxAge: 600,
      sameSite: 'lax',
      path: '/',
    })

    return redirect(url.toString(), 302)
  }, {
    detail: {
      tags: ['Auth'],
      summary: 'Start OAuth flow for a provider instance',
      description: 'Redirects to the provider instance\'s authorize page. Instance IDs are configured by the admin (e.g. `github`, `gitlab`, `forgejo-acme`). Set `link=1` to attach this identity to the currently signed-in user.',
      operationId: 'startOAuth',
    },
    params: t.Object({ instance: t.String() }),
    query: t.Object({
      link: t.Optional(t.String()),
      return_to: t.Optional(t.String()),
    }),
  })
