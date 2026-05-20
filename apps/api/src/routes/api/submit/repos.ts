import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import type { identities } from '$db/schema'
import { listReposFor, type SubmittableRepo } from '$lib/list-repos'
import { getValidAccessToken, OAuthExpiredError, UpstreamUnauthorizedError } from '$lib/oauth-tokens'
import { getInstance } from '$lib/provider-instance'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'submit-repos' })

const repoSchema = t.Object({
  identityId: t.String(),
  providerInstanceId: t.String(),
  fullName: t.String(),
  owner: t.String(),
  name: t.String(),
  url: t.String(),
  description: t.Nullable(t.String()),
  isPrivate: t.Boolean(),
})

const groupSchema = t.Object({
  identityId: t.String(),
  providerInstanceId: t.String(),
  providerDisplayName: t.String(),
  providerKind: t.Union([t.Literal('github'), t.Literal('gitlab'), t.Literal('gitea')]),
  username: t.String(),
  repos: t.Array(repoSchema),
  error: t.Nullable(t.String()),
  reauthUrl: t.String(),
})

async function reposForIdentity(id: typeof identities.$inferSelect): Promise<SubmittableRepo[]> {
  if (!id.accessToken) return []
  const inst = getInstance(id.providerInstanceId)
  if (!inst) return []
  const token = await getValidAccessToken(id, inst)
  const raw = await listReposFor(inst, token)
  return raw.map((r) => ({ ...r, identityId: id.id }))
}

export default new Elysia().use(authMiddleware).get(
  '/',
  async ({ user }) => {
    const userIdentities = await db.query.identities.findMany({ where: { userId: user.sub } })

    const groups = await Promise.all(
      userIdentities.map(async (id) => {
        const inst = getInstance(id.providerInstanceId)
        let repos: SubmittableRepo[] = []
        let error: string | null = null
        try {
          repos = await reposForIdentity(id)
        } catch (e) {
          if (e instanceof OAuthExpiredError || e instanceof UpstreamUnauthorizedError) {
            error = 'reauth_required'
          } else {
            log.error({ err: e, identityId: id.id, instance: id.providerInstanceId }, 'failed to list repos')
            error = e instanceof Error ? e.message : 'Failed to list repos'
          }
        }
        return {
          identityId: id.id,
          providerInstanceId: id.providerInstanceId,
          providerDisplayName: inst?.displayName ?? id.providerInstanceId,
          providerKind: inst?.kind ?? 'github',
          username: id.username,
          repos,
          error,
          reauthUrl: `/auth/${id.providerInstanceId}?link=1`,
        }
      }),
    )

    return { groups }
  },
  {
    detail: {
      tags: ['Submit'],
      summary: 'List submittable repos across linked identities',
      operationId: 'listSubmittableRepos',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    response: { 200: t.Object({ groups: t.Array(groupSchema) }) },
  },
)
