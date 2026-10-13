import { Elysia, t } from 'elysia'
import { and, eq } from 'drizzle-orm'
import semver from 'semver'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { pluginRequestClaims } from '$db/schema'
import { getBranding } from '$lib/branding'
import { hasClaimedRequest } from '$lib/claims'
import { logger } from '$lib/logger'
import { getValidAccessToken, OAuthExpiredError } from '$lib/oauth-tokens'
import { getInstance } from '$lib/provider-instance'
import { claimerSchema, loadClaimers } from '$lib/request-view'
import { generatePluginFiles, isScaffoldKind, ScaffoldError, withBountyNote } from '$lib/scaffold/generate'
import { createRepoWithFiles, grantedScopes, GithubScaffoldError } from '$lib/scaffold/github'
import { emitEvent, webBaseUrl } from '$lib/webhooks/events'

const log = logger.child({ module: 'request-scaffold' })

const errorSchema = t.Object({
  error: t.String(),
  reauthUrl: t.Optional(t.String()),
  missingScope: t.Optional(t.String()),
  hint: t.Optional(t.String()),
})

// Re-authorize with the extra scope GitHub requires to write workflow files,
// then land back where the user started.
function reauthUrl(instanceId: string, returnTo: string | undefined, scope?: string): string {
  const params = new URLSearchParams()
  if (scope) params.set('scope', scope)
  params.set('return_to', returnTo ?? `${webBaseUrl()}/requests`)
  return `${webBaseUrl()}/auth/${encodeURIComponent(instanceId)}?${params}`
}

function localCommand(slug: string, kind: string): string {
  return kind === 'theme'
    ? `npx --package @tabularis/create-plugin tabularis-theme scaffold ${slug} --dir ${slug} --min-runtime-version <version>`
    : `npm create @tabularis/plugin@latest ${slug}`
}

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'request-scaffold', limit: 5, windowSeconds: 3600 }))
  .post(
    '/',
    async ({ params, body, user, set }) => {
      const request = await db.query.pluginRequests.findFirst({ where: { id: params.id } })
      if (!request) {
        set.status = 404
        return { error: 'Request not found' }
      }
      if (request.status !== 'approved') {
        set.status = 409
        return { error: 'Only approved requests can be scaffolded.' }
      }
      if (!(await hasClaimedRequest(request.id, user.sub))) {
        set.status = 409
        return { error: 'Claim this request before creating its repository.' }
      }
      const kind = request.kind
      if (!isScaffoldKind(kind)) {
        set.status = 422
        return { error: `There is no scaffold for '${kind ?? 'unspecified'}' plugins yet.` }
      }
      if (kind === 'theme' && !semver.valid(body.theme?.minRuntimeVersion ?? '')) {
        set.status = 400
        return { error: 'Themes need `theme.minRuntimeVersion`, the first Tabularis version that supports them.' }
      }

      const candidates = await db.query.identities.findMany({ where: { userId: user.sub } })
      const identity = candidates.find(
        (i) => (!body.identityId || i.id === body.identityId) && getInstance(i.providerInstanceId)?.kind === 'github',
      )
      const instance = identity ? getInstance(identity.providerInstanceId) : undefined
      if (!identity || !instance) {
        set.status = 412
        return {
          error: 'Creating the repository needs a linked GitHub account.',
          hint: `Scaffold it locally instead: ${localCommand(request.slug, kind)}`,
        }
      }

      let token: string
      try {
        token = await getValidAccessToken(identity, instance)
      } catch (err) {
        if (!(err instanceof OAuthExpiredError)) throw err
        set.status = 401
        return {
          error: `Your ${instance.displayName} session expired.`,
          reauthUrl: reauthUrl(instance.id, body.returnTo),
        }
      }

      let login: string
      try {
        const granted = await grantedScopes(instance, token)
        login = granted.login
        if (granted.scopes && !granted.scopes.includes('workflow') && !granted.scopes.includes('repo')) {
          set.status = 403
          return {
            error: `${instance.displayName} only lets apps add CI workflows with the \`workflow\` permission. Grant it once to create the repository.`,
            missingScope: 'workflow',
            reauthUrl: reauthUrl(instance.id, body.returnTo, 'workflow'),
          }
        }
      } catch (err) {
        if (err instanceof GithubScaffoldError && err.status === 401) {
          set.status = 401
          return {
            error: `Your ${instance.displayName} session expired.`,
            reauthUrl: reauthUrl(instance.id, body.returnTo),
          }
        }
        throw err
      }

      let files
      try {
        files = await generatePluginFiles(
          kind === 'theme'
            ? { kind, slug: request.slug, minRuntimeVersion: body.theme!.minRuntimeVersion }
            : {
                kind,
                slug: request.slug,
                driver: {
                  dbType: body.driver?.dbType ?? 'network',
                  quote: body.driver?.quote ?? '"',
                  withUi: body.driver?.withUi ?? false,
                },
              },
        )
      } catch (err) {
        if (!(err instanceof ScaffoldError)) throw err
        set.status = 422
        return { error: err.message, hint: `Scaffold it locally instead: ${localCommand(request.slug, kind)}` }
      }

      const requestUrl = `${webBaseUrl()}/requests`
      files = withBountyNote(
        files,
        `## Bounty\n\nScaffolded for the [${request.name}](${requestUrl}) request on ${getBranding().name}. Publish a release, then submit this repository to the registry: the request ships as soon as the plugin \`${request.slug}\` is listed.`,
      )

      let repo
      try {
        repo = await createRepoWithFiles(
          instance,
          token,
          {
            login,
            owner: body.owner,
            name: body.repoName ?? request.slug,
            description: request.description,
            private: body.private ?? false,
          },
          files,
          `Scaffold ${request.slug} with @tabularis/create-plugin`,
        )
      } catch (err) {
        if (!(err instanceof GithubScaffoldError)) throw err
        log.warn({ err: err.message, status: err.status, requestId: request.id }, 'repository creation failed')
        if (err.status === 422) {
          set.status = 409
          return { error: `Could not create the repository: ${err.message}. Pick another name.` }
        }
        set.status = 502
        return { error: `${instance.displayName} refused the repository: ${err.message}` }
      }

      await db
        .update(pluginRequestClaims)
        .set({ repoUrl: repo.htmlUrl, scaffoldedAt: Date.now() })
        .where(and(eq(pluginRequestClaims.requestId, request.id), eq(pluginRequestClaims.userId, user.sub)))

      const claimers = (await loadClaimers([request.id])).get(request.id) ?? []
      await emitEvent('request.scaffolded', {
        actor: { id: user.sub, name: user.username ?? null },
        request: { ...request, claims: claimers.length, repoUrl: repo.htmlUrl },
      })

      return {
        repoUrl: repo.htmlUrl,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        files: files.length,
        submitUrl: `${webBaseUrl()}/submit?repo=${encodeURIComponent(repo.htmlUrl)}`,
        claimers,
      }
    },
    {
      detail: {
        tags: ['Requests'],
        summary: 'Create a plugin repository for a claimed request',
        description:
          "Generates the project with @tabularis/create-plugin (the request slug becomes the plugin name, so the request ships when that plugin is listed) and pushes it as the first commit of a new repository in the caller's GitHub account or one of their orgs. Requires an active claim on an approved `driver` or `theme` request. GitHub only accepts CI workflow files from tokens with the `workflow` scope: without it the call returns 403 with a `reauthUrl` that grants it and comes back to `returnTo`.",
        operationId: 'scaffoldRequest',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        identityId: t.Optional(t.String({ description: 'Linked GitHub identity to use. Default: the first one.' })),
        owner: t.Optional(
          t.String({ pattern: '^[A-Za-z0-9-]{1,39}$', description: 'Org to create the repo in. Default: the user.' }),
        ),
        repoName: t.Optional(
          t.String({ pattern: '^[A-Za-z0-9._-]{1,100}$', description: 'Repository name. Default: the request slug.' }),
        ),
        private: t.Optional(t.Boolean({ description: 'Create a private repository. Default false.' })),
        driver: t.Optional(
          t.Object({
            dbType: t.Optional(
              t.Union([t.Literal('network'), t.Literal('file'), t.Literal('folder'), t.Literal('api')]),
            ),
            quote: t.Optional(t.Union([t.Literal('"'), t.Literal('`')])),
            withUi: t.Optional(t.Boolean()),
          }),
        ),
        theme: t.Optional(t.Object({ minRuntimeVersion: t.String({ maxLength: 40 }) })),
        returnTo: t.Optional(
          t.String({
            maxLength: 512,
            description: 'Where to come back after re-authorizing. Must be a trusted origin.',
          }),
        ),
      }),
      response: {
        200: t.Object({
          repoUrl: t.String(),
          fullName: t.String(),
          defaultBranch: t.String(),
          files: t.Number(),
          submitUrl: t.String(),
          claimers: t.Array(claimerSchema),
        }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        412: errorSchema,
        422: errorSchema,
        502: errorSchema,
      },
    },
  )
