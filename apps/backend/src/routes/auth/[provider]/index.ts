import { Elysia, t } from 'elysia'
import { GitHub, Gitea, generateState, generateCodeVerifier } from 'arctic'

export default new Elysia()
  .get('/', async ({ params, query, set, cookie, redirect }) => {
    const state = generateState()

    if (params.provider === 'github') {
      const github = new GitHub(
        Bun.env.GITHUB_CLIENT_ID!,
        Bun.env.GITHUB_CLIENT_SECRET!,
        `${Bun.env.BASE_URL}/auth/github/callback`,
      )
      const url = github.createAuthorizationURL(state, ['read:user'])

      cookie.oauth_state.set({
        value: JSON.stringify({ nonce: state, provider: 'github' }),
        httpOnly: true,
        maxAge: 600,
        sameSite: 'lax',
        path: '/',
      })

      return redirect(url.toString(), 302)
    } else if (params.provider === 'gitea') {
      const instance = query.instance
      if (!instance) {
        set.status = 400
        return { error: 'Missing instance query param for gitea provider' }
      }

      const codeVerifier = generateCodeVerifier()
      const gitea = new Gitea(
        instance,
        Bun.env.GITEA_CODEBERG_CLIENT_ID!,
        Bun.env.GITEA_CODEBERG_CLIENT_SECRET!,
        `${Bun.env.BASE_URL}/auth/gitea/callback`,
      )
      const url = gitea.createAuthorizationURL(state, codeVerifier, ['read:user'])

      cookie.oauth_state.set({
        value: JSON.stringify({ nonce: state, provider: 'gitea', instance, codeVerifier }),
        httpOnly: true,
        maxAge: 600,
        sameSite: 'lax',
        path: '/',
      })

      return redirect(url.toString(), 302)
    }

    set.status = 400
    return { error: `Unknown provider: ${params.provider}` }
  }, {
    query: t.Object({
      instance: t.Optional(t.String()),
    }),
  })
