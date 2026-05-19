import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { eq } from 'drizzle-orm'
import { db } from '$db'
import { plugins, pluginRequests, pluginRequestVotes, pluginRequestClaims } from '$db/schema'
import { deriveSlug } from '$lib/slug'
import { parseRepoUrl, checkOwnership } from '$lib/providers'
import { setupWebhook } from '$lib/setup-webhook'
import { getValidAccessToken, OAuthExpiredError } from '$lib/oauth-tokens'
import { env } from '$lib/env'
import { getSetting } from '$lib/settings'
import { resolveManifest, rawContentBase, ManifestValidationError } from '$lib/manifest'
import { manifestPatch, applyManifestToPlugin } from '$lib/manifest-apply'
import { fetchLatestRelease } from '$lib/release-fetch'
import { persistRelease, hashReleaseAssetsAsync } from '$lib/release-ingest'
import { getFeatures } from '$lib/features'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'submit-oauth' })

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('hex')
}

function humanize(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'submit', limit: 10, windowSeconds: 3600 }))
  .post(
    '/',
    async ({ user, body, set }) => {
      if (!getFeatures().submissionsEnabled) {
        set.status = 403
        return { error: 'Plugin submissions are disabled on this instance.' }
      }
      const ref = parseRepoUrl(body.repoUrl)
      if (!ref) {
        set.status = 400
        return { error: 'Invalid repo URL — must match a configured provider instance' }
      }

      const identity = await db.query.identities.findFirst({
        where: { userId: user.sub, providerInstanceId: ref.instance.id },
      })

      if (!identity?.accessToken) {
        set.status = 412
        return {
          error: `No linked ${ref.instance.displayName} account. Link one in /settings before submitting.`,
        }
      }

      let accessToken: string
      try {
        accessToken = await getValidAccessToken(identity, ref.instance)
      } catch (e) {
        if (e instanceof OAuthExpiredError) {
          set.status = 401
          return { error: 'OAuth token expired', reauthFor: e.providerInstanceId }
        }
        throw e
      }
      const ownership = await checkOwnership(accessToken, ref, identity.username)

      if (!ownership.owned) {
        set.status = 403
        return { error: ownership.reason }
      }

      const slug = deriveSlug(ref.repo)
      const existing = await db.query.plugins.findFirst({ where: { id: slug } })
      if (existing) {
        set.status = 409
        return { error: `Plugin slug '${slug}' is already taken` }
      }

      const webhookSecret = generateWebhookSecret()
      const requireApproval = getSetting('instance.require_approval') === '1'
      const status = requireApproval ? 'pending' : 'approved'

      // Manifest will overwrite name/description if it exists; these are only
      // displayed until the first release webhook lands. So we accept empty
      // input and synthesise a name from the repo slug, with an empty
      // description as the inert placeholder.
      const fallbackName = body.name?.trim() ? body.name.trim() : humanize(ref.repo)
      const fallbackDescription = body.description?.trim() ?? ''

      await db.insert(plugins).values({
        id: slug,
        ownerId: user.sub,
        providerInstanceId: ref.instance.id,
        name: fallbackName,
        description: fallbackDescription,
        author: `${identity.username} <${body.repoUrl}>`,
        repoUrl: body.repoUrl,
        homepage: body.repoUrl,
        webhookSecret,
        status,
      })

      try {
        const latestRelease = await fetchLatestRelease(accessToken, ref).catch((err) => {
          log.warn({ err, slug }, 'latest-release lookup failed at submit')
          return null
        })
        if (!latestRelease) {
          log.info({ slug }, 'no release yet — skipping manifest fetch, waiting for webhook')
        }
        if (latestRelease) {
          const tag = latestRelease.tag
          const manifest = await resolveManifest(accessToken, ref, { ref: tag })
          if (manifest) {
            const patch = manifestPatch(manifest, {
              repoBase: rawContentBase(ref, tag),
              version: tag,
            })
            await applyManifestToPlugin(slug, patch)
            log.info({ slug, source: manifest.source, tag }, 'manifest applied at submit (from latest release)')
          }
          if (!manifest) {
            log.info({ slug, tag }, 'no .tabularium manifest in latest release — using fallback metadata')
          }
          // Also ingest the release itself — without this, the plugin has no
          // releases in the DB until the next webhook fires, which means the
          // refresh button has nothing to re-hash. The webhook handler does
          // the same work; persistRelease + hashReleaseAssetsAsync are
          // factored out so both call sites stay in sync.
          if (latestRelease.published) {
            const { version, assetMap } = await persistRelease({ id: slug, latestVersion: null }, latestRelease)
            queueMicrotask(() => {
              void hashReleaseAssetsAsync(
                { id: slug, ownerId: user.sub, repoUrl: body.repoUrl },
                latestRelease,
                assetMap,
                version,
              )
            })
            log.info({ slug, version, assets: Object.keys(assetMap) }, 'release ingested at submit')
          }
        }
      } catch (err) {
        if (err instanceof ManifestValidationError) {
          log.warn({ slug, errors: err.errors }, 'manifest invalid at submit — continuing without it')
        } else {
          log.warn({ err, slug }, 'manifest fetch failed at submit — continuing without it')
        }
      }

      try {
        const matching = await db.query.pluginRequests.findFirst({
          where: { slug },
          columns: { id: true },
        })
        if (matching) {
          await db.delete(pluginRequestVotes).where(eq(pluginRequestVotes.requestId, matching.id))
          await db.delete(pluginRequestClaims).where(eq(pluginRequestClaims.requestId, matching.id))
          await db.delete(pluginRequests).where(eq(pluginRequests.id, matching.id))
        }
      } catch (err) {
        log.warn({ err, slug }, 'failed to clean up matching plugin request')
      }

      const webhookUrl = `${env.BASE_URL}/api/webhooks/release`
      const setup = await setupWebhook(accessToken, ref, webhookUrl, webhookSecret)

      return {
        slug,
        status,
        webhookSecret,
        webhookUrl,
        webhookInstalled: setup.installed,
        webhookSetupReason: setup.installed ? null : setup.reason,
        repoUrl: body.repoUrl,
        providerInstanceId: ref.instance.id,
        providerKind: ref.instance.kind,
      }
    },
    {
      detail: {
        tags: ['Submit'],
        summary: 'Submit plugin via OAuth-verified ownership',
        operationId: 'submitOAuth',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        repoUrl: t.String(),
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          slug: t.String(),
          status: t.Union([t.Literal('approved'), t.Literal('pending'), t.Literal('rejected')]),
          webhookSecret: t.String(),
          webhookUrl: t.String(),
          webhookInstalled: t.Boolean(),
          webhookSetupReason: t.Nullable(t.String()),
          repoUrl: t.String(),
          providerInstanceId: t.String(),
          providerKind: t.String(),
        }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String(), reauthFor: t.String() }),
        403: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        412: t.Object({ error: t.String() }),
      },
    },
  )
