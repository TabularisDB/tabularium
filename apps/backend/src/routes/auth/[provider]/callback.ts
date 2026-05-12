import { Elysia, t } from 'elysia'
import { GitHub, Gitea, OAuth2RequestError } from 'arctic'
import { db } from '../../../db'
import { users } from '../../../db/schema'
import { signJwt } from '../../../lib/jwt'
import { eq, and } from 'drizzle-orm'

export default new Elysia()
  .get('/auth/:provider/callback', async ({ params, query, cookie, set, redirect }) => {
    const stateStr = cookie.oauth_state?.value
    if (!stateStr) {
      set.status = 400
      return { error: 'Missing state cookie' }
    }

    let stateData: { nonce: string; provider: string; instance?: string; codeVerifier?: string }
    try {
      stateData = JSON.parse(stateStr)
    } catch {
      set.status = 400
      return { error: 'Invalid state cookie' }
    }

    if (stateData.nonce !== query.state || stateData.provider !== params.provider) {
      set.status = 400
      return { error: 'State mismatch' }
    }

    try {
      let externalId: string
      let username: string
      let accessToken: string
      let providerInstanceUrl: string | null = null

      if (params.provider === 'github') {
        const github = new GitHub(
          Bun.env.GITHUB_CLIENT_ID!,
          Bun.env.GITHUB_CLIENT_SECRET!,
          `${Bun.env.BASE_URL}/auth/github/callback`,
        )
        const tokens = await github.validateAuthorizationCode(query.code)
        accessToken = tokens.accessToken()

        const profileRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'tabularis-registry/1.0',
          },
        })
        const profile = await profileRes.json() as { id: number; login: string }
        externalId = String(profile.id)
        username = profile.login
      } else if (params.provider === 'gitea') {
        const instance = stateData.instance!
        providerInstanceUrl = instance
        const gitea = new Gitea(
          instance,
          Bun.env.GITEA_CODEBERG_CLIENT_ID!,
          Bun.env.GITEA_CODEBERG_CLIENT_SECRET!,
          `${Bun.env.BASE_URL}/auth/gitea/callback`,
        )
        const tokens = await gitea.validateAuthorizationCode(query.code, stateData.codeVerifier!)
        accessToken = tokens.accessToken()

        const profileRes = await fetch(`${instance}/api/v1/user`, {
          headers: { Authorization: `token ${accessToken}` },
        })
        const profile = await profileRes.json() as { id: number; login: string }
        externalId = String(profile.id)
        username = profile.login
      } else {
        set.status = 400
        return { error: 'Unknown provider' }
      }

      const existing = await db.query.users.findFirst({
        where: and(
          eq(users.provider, params.provider as 'github' | 'gitea'),
          eq(users.externalId, externalId),
        ),
      })

      const userId = existing?.id ?? crypto.randomUUID()
      if (!existing) {
        await db.insert(users).values({
          id: userId,
          provider: params.provider as 'github' | 'gitea',
          providerInstanceUrl,
          externalId,
          username,
          accessToken,
        })
      } else {
        await db
          .update(users)
          .set({ username, accessToken })
          .where(eq(users.id, userId))
      }

      const jwt = await signJwt({
        sub: userId,
        username,
        provider: params.provider,
        providerInstanceUrl,
      })

      cookie.auth.set({
        value: jwt,
        httpOnly: true,
        maxAge: 3600,
        sameSite: 'lax',
        path: '/',
      })
      cookie.oauth_state.remove()

      return redirect(`${Bun.env.BASE_URL}/auth/success`, 302)
    } catch (e) {
      if (e instanceof OAuth2RequestError) {
        set.status = 400
        return { error: 'OAuth error: ' + e.message }
      }
      set.status = 500
      return { error: 'Internal error during auth' }
    }
  }, {
    query: t.Object({
      code: t.String(),
      state: t.String(),
    }),
  })
