import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { db } from '$db'
import type { identities } from '$db/schema'
import { listReposFor, REPO_PAGE_SIZES, type RepoPage, type SubmittableRepo } from '$lib/list-repos'
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
  page: t.Number(),
  limit: t.Number(),
  total: t.Number(),
  hasMore: t.Boolean(),
  error: t.Nullable(t.String()),
  reauthUrl: t.String(),
})

async function reposForIdentity(id: typeof identities.$inferSelect, options: { search?: string; page: number }) {
  const inst = getInstance(id.providerInstanceId)
  const empty = {
    repos: [] as SubmittableRepo[],
    page: options.page,
    limit: REPO_PAGE_SIZES[inst?.kind ?? 'github'],
    total: 0,
    hasMore: false,
  }
  if (!id.accessToken) return empty
  if (!inst || !inst.enabled) return empty
  const token = await getValidAccessToken(id, inst)
  const result = await listReposFor(inst, token, options)
  return { ...result, repos: result.repos.map((r) => ({ ...r, identityId: id.id })) }
}

export default new Elysia().use(authMiddleware).get(
  '/',
  async ({ user, query, set }) => {
    const search = query.search?.trim()
    if (search !== undefined && search.length < 3) {
      set.status = 422
      return { error: 'Repository search requires at least 3 characters' }
    }
    const userIdentities = await db.query.identities.findMany({
      where: { userId: user.sub, ...(query.identityId ? { id: query.identityId } : {}) },
    })

    const groups = await Promise.all(
      userIdentities.map(async (id) => {
        const inst = getInstance(id.providerInstanceId)
        let result: Omit<RepoPage, 'repos'> & { repos: SubmittableRepo[] } = {
          repos: [] as SubmittableRepo[],
          page: query.page,
          limit: REPO_PAGE_SIZES[inst?.kind ?? 'github'],
          total: 0,
          hasMore: false,
        }
        let error: string | null = null
        try {
          result = await reposForIdentity(id, { search, page: query.page })
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
          ...result,
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
      description:
        'Search names and descriptions server-side with at least 3 characters. Results contain up to 100 repositories per page for GitHub and 50 for GitLab/Gitea, with the total number of eligible matches across all pages. Use identityId to paginate or search a specific linked account, and hasMore to request the next page.',
      operationId: 'listSubmittableRepos',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    query: t.Object({
      identityId: t.Optional(t.String({ minLength: 1 })),
      search: t.Optional(t.String({ minLength: 3, maxLength: 200 })),
      page: t.Numeric({ minimum: 1, maximum: 100000, multipleOf: 1, default: 1 }),
    }),
    response: {
      200: t.Object({ groups: t.Array(groupSchema) }),
      422: t.Object({ error: t.String() }),
    },
  },
)
