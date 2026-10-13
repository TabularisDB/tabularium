import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import { getValidAccessToken, OAuthExpiredError } from '$lib/oauth-tokens'
import { getInstance } from '$lib/provider-instance'
import { listGithubOwners, GithubScaffoldError } from '$lib/scaffold/github'

const ownerSchema = t.Object({
  login: t.String(),
  type: t.Union([t.Literal('user'), t.Literal('org')]),
  avatarUrl: t.Nullable(t.String()),
})

export default new Elysia().use(authMiddleware).get(
  '/',
  async ({ user, query, set }) => {
    const candidates = await db.query.identities.findMany({ where: { userId: user.sub } })
    const identity = candidates.find(
      (i) => (!query.identityId || i.id === query.identityId) && getInstance(i.providerInstanceId)?.kind === 'github',
    )
    const instance = identity ? getInstance(identity.providerInstanceId) : undefined
    if (!identity || !instance) {
      set.status = 412
      return { error: 'Listing repository owners needs a linked GitHub account.' }
    }
    try {
      const token = await getValidAccessToken(identity, instance)
      return { identityId: identity.id, owners: await listGithubOwners(instance, token) }
    } catch (err) {
      if (err instanceof OAuthExpiredError || (err instanceof GithubScaffoldError && err.status === 401)) {
        set.status = 401
        return { error: `Your ${instance.displayName} session expired.` }
      }
      throw err
    }
  },
  {
    detail: {
      tags: ['Submit'],
      summary: 'List the accounts you can create repositories in',
      description:
        'Your GitHub account first, then the organizations it belongs to: the valid `owner` values for scaffolding a request repository. Uses the first linked GitHub identity unless `identityId` is given. Organizations that restrict repository creation are still listed; GitHub refuses the scaffold if you lack the right.',
      operationId: 'listRepoOwners',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    query: t.Object({ identityId: t.Optional(t.String({ minLength: 1 })) }),
    response: {
      200: t.Object({ identityId: t.String(), owners: t.Array(ownerSchema) }),
      401: t.Object({ error: t.String() }),
      412: t.Object({ error: t.String() }),
    },
  },
)
