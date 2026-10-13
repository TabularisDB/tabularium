import { Elysia, t } from 'elysia'
import { and, eq } from 'drizzle-orm'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { pluginRequestClaims } from '$db/schema'
import { hasClaimedRequest } from '$lib/claims'
import { getValidAccessToken, OAuthExpiredError } from '$lib/oauth-tokens'
import { checkOwnership, parseRepoUrl } from '$lib/providers'
import { claimerSchema, loadClaimers } from '$lib/request-view'
import { emitEvent, webBaseUrl } from '$lib/webhooks/events'

const errorSchema = t.Object({ error: t.String(), reauthUrl: t.Optional(t.String()) })

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'request-repo', limit: 20, windowSeconds: 3600 }))
  .post(
    '/',
    async ({ params, body, user, set }) => {
      const request = await db.query.pluginRequests.findFirst({ where: { id: params.id } })
      if (!request) {
        set.status = 404
        return { error: 'Request not found' }
      }
      if (!(await hasClaimedRequest(request.id, user.sub))) {
        set.status = 409
        return { error: 'Claim this request before linking a repository.' }
      }
      const where = and(eq(pluginRequestClaims.requestId, request.id), eq(pluginRequestClaims.userId, user.sub))

      // Unlinking needs no provider round-trip.
      if (body.repoUrl === null) {
        await db.update(pluginRequestClaims).set({ repoUrl: null, scaffoldedAt: null }).where(where)
        const claimers = (await loadClaimers([request.id])).get(request.id) ?? []
        return { repoUrl: null, fullName: null, submitUrl: null, claimers }
      }

      if (request.status !== 'approved') {
        set.status = 409
        return { error: 'Only approved requests can get a repository.' }
      }
      const ref = parseRepoUrl(body.repoUrl)
      if (!ref) {
        set.status = 422
        return { error: 'Not a repository URL on a provider this registry knows.' }
      }

      const identity = (await db.query.identities.findMany({ where: { userId: user.sub } })).find(
        (i) => i.providerInstanceId === ref.instance.id,
      )
      if (!identity?.accessToken) {
        set.status = 412
        return { error: `Link a ${ref.instance.displayName} account to prove you maintain ${ref.fullName}.` }
      }
      let token: string
      try {
        token = await getValidAccessToken(identity, ref.instance)
      } catch (err) {
        if (!(err instanceof OAuthExpiredError)) throw err
        set.status = 401
        return {
          error: `Your ${ref.instance.displayName} session expired.`,
          reauthUrl: `${webBaseUrl()}/auth/${encodeURIComponent(ref.instance.id)}?return_to=${encodeURIComponent(body.returnTo ?? `${webBaseUrl()}/requests`)}`,
        }
      }
      // Same bar as submitting a plugin: maintain (or admin) on the repository.
      const ownership = await checkOwnership(token, ref)
      if (!ownership.owned) {
        set.status = 403
        return { error: `${ref.fullName}: ${ownership.reason}` }
      }

      const repoUrl = `${ref.instance.baseUrl}/${ref.fullName}`
      await db.update(pluginRequestClaims).set({ repoUrl, scaffoldedAt: null }).where(where)
      const claimers = (await loadClaimers([request.id])).get(request.id) ?? []
      await emitEvent('request.repo_linked', {
        actor: { id: user.sub, name: user.username ?? null },
        request: { ...request, claims: claimers.length, repoUrl },
      })
      return {
        repoUrl,
        fullName: ref.fullName,
        submitUrl: `${webBaseUrl()}/submit?repo=${encodeURIComponent(repoUrl)}`,
        claimers,
      }
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'Link an existing repository to your claim',
        description:
          "Records a repository you already maintain as the work for your claim on an approved request, instead of scaffolding a new one. The repository must be on a provider you have linked, with maintain or admin permission (the same check as submitting a plugin). Pass `repoUrl: null` to unlink. The request still ships only when a plugin with the request's slug is listed.",
        operationId: 'linkRequestRepo',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        repoUrl: t.Nullable(
          t.String({ maxLength: 500, description: 'Repository URL, e.g. https://github.com/acme/my-plugin.' }),
        ),
        returnTo: t.Optional(
          t.String({
            maxLength: 512,
            description: 'Where to come back after re-authorizing. Must be a trusted origin.',
          }),
        ),
      }),
      response: {
        200: t.Object({
          repoUrl: t.Nullable(t.String()),
          fullName: t.Nullable(t.String()),
          submitUrl: t.Nullable(t.String()),
          claimers: t.Array(claimerSchema),
        }),
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        412: errorSchema,
        422: errorSchema,
      },
    },
  )
