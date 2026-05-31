import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { deriveSlug } from '$lib/slug'
import { parseRepoUrl, checkOwnership } from '$lib/providers'
import { getValidAccessToken, OAuthExpiredError, UpstreamUnauthorizedError } from '$lib/oauth-tokens'
import { resolveManifest, ManifestValidationError } from '$lib/manifest'
import { getManifestConfig } from '$lib/manifest-config'
import { fetchLatestRelease } from '$lib/release-fetch'
import { getFeatures } from '$lib/features'
import { logger } from '$lib/logger'
import { humanize } from '$lib/util'

const log = logger.child({ module: 'submit-preview' })

function formatManifestFilenames(): string {
  const files = getManifestConfig().files
  if (files.length === 0) return '(no filenames configured)'
  if (files.length === 1) return `\`${files[0]}\``
  if (files.length === 2) return `\`${files[0]}\` or \`${files[1]}\``
  return files.map((f, i) => (i === files.length - 1 ? `or \`${f}\`` : `\`${f}\``)).join(', ')
}

const screenshotSchema = t.Object({
  url: t.String(),
  caption: t.Nullable(t.String()),
  alt: t.Nullable(t.String()),
})

const manifestPreviewSchema = t.Object({
  name: t.Nullable(t.String()),
  description: t.Nullable(t.String()),
  category: t.Nullable(t.String()),
  kind: t.Nullable(t.String()),
  tags: t.Array(t.String()),
  license: t.Nullable(t.String()),
  icon: t.Nullable(t.String()),
  screenshots: t.Array(screenshotSchema),
  homepage: t.Nullable(t.String()),
  documentationUrl: t.Nullable(t.String()),
  minRuntimeVersion: t.Nullable(t.String()),
  readmeLocales: t.Array(t.String()),
})

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'submit.preview', limit: 30, windowSeconds: 60 }))
  .post(
    '/',
    async ({ user, body, set }) => {
      if (!getFeatures().submissionsEnabled) {
        set.status = 403
        return { ok: false as const, error: 'Plugin submissions are disabled on this instance.' }
      }
      const ref = parseRepoUrl(body.repoUrl)
      if (!ref) {
        set.status = 400
        return { ok: false as const, error: 'Invalid repo URL — must match a configured provider instance' }
      }

      const identity = await db.query.identities.findFirst({
        where: { userId: user.sub, providerInstanceId: ref.instance.id },
      })
      if (!identity?.accessToken) {
        set.status = 412
        return {
          ok: false as const,
          error: `No linked ${ref.instance.displayName} account. Link one in /settings before submitting.`,
        }
      }

      let accessToken: string
      try {
        accessToken = await getValidAccessToken(identity, ref.instance)
      } catch (e) {
        if (e instanceof OAuthExpiredError) {
          set.status = 401
          return { ok: false as const, error: 'OAuth token expired', reauthFor: e.providerInstanceId }
        }
        throw e
      }
      const ownership = await checkOwnership(accessToken, ref, identity.username)
      if (!ownership.owned) {
        set.status = 403
        return { ok: false as const, error: ownership.reason }
      }

      // Provisional slug from the repo name. If a manifest is found and
      // declares `id`, that wins below — manifest `id` is the authoritative
      // identity (crates.io-style: lowercase, dashes only). The repo-derived
      // slug only matters when the manifest is missing the field (or absent).
      const repoSlug = deriveSlug(ref.repo)
      let slug = repoSlug
      const lookupExisting = async (id: string) => db.query.plugins.findFirst({ where: { id }, columns: { id: true } })
      let existing = await lookupExisting(slug)

      let latestRelease
      try {
        latestRelease = await fetchLatestRelease(accessToken, ref)
      } catch (err) {
        if (err instanceof UpstreamUnauthorizedError) {
          set.status = 401
          return { ok: false as const, error: 'OAuth token expired', reauthFor: err.providerInstanceId }
        }
        log.warn({ err, slug }, 'latest-release lookup failed during preview')
        latestRelease = null
      }

      if (!latestRelease) {
        return {
          ok: true as const,
          slug,
          slugTaken: existing !== null && existing !== undefined,
          repoUrl: body.repoUrl,
          providerInstanceId: ref.instance.id,
          providerKind: ref.instance.kind,
          fromManifest: false as const,
          suggestedName: humanize(ref.repo),
          message: `No release yet — the registry will pull the manifest (${formatManifestFilenames()}) on the first release webhook.`,
        }
      }

      try {
        const tag = latestRelease.tag
        const manifest = await resolveManifest(accessToken, ref, { ref: tag })
        if (!manifest) {
          return {
            ok: true as const,
            slug,
            slugTaken: existing !== null && existing !== undefined,
            repoUrl: body.repoUrl,
            providerInstanceId: ref.instance.id,
            providerKind: ref.instance.kind,
            fromManifest: false as const,
            suggestedName: humanize(ref.repo),
            message: `Release found, but no manifest file at the tag (looked for ${formatManifestFilenames()}) — you will need to provide a name and description manually.`,
          }
        }
        const { parsed, readmeLocales } = manifest
        if (parsed.name && parsed.name !== slug) {
          slug = parsed.name
          existing = await lookupExisting(slug)
        }
        const preview = {
          name: parsed.name ?? null,
          description: parsed.description ?? null,
          category: parsed.category ?? null,
          kind: parsed.kind ?? null,
          tags: parsed.tags ?? [],
          license: parsed.license ?? null,
          icon: parsed.icon ?? null,
          screenshots: (parsed.screenshots ?? []).map((s) => ({
            url: s.url,
            caption: s.caption ?? null,
            alt: s.alt ?? null,
          })),
          homepage: parsed.homepage ?? null,
          documentationUrl: parsed.documentation_url ?? null,
          minRuntimeVersion: parsed.min_runtime_version ?? null,
          readmeLocales: readmeLocales ? Object.keys(readmeLocales) : [],
        }
        return {
          ok: true as const,
          slug,
          slugTaken: existing !== null && existing !== undefined,
          repoUrl: body.repoUrl,
          providerInstanceId: ref.instance.id,
          providerKind: ref.instance.kind,
          fromManifest: true as const,
          version: tag,
          preview,
        }
      } catch (err) {
        if (err instanceof UpstreamUnauthorizedError) {
          set.status = 401
          return { ok: false as const, error: 'OAuth token expired', reauthFor: err.providerInstanceId }
        }
        if (err instanceof ManifestValidationError) {
          return {
            ok: true as const,
            slug,
            slugTaken: existing !== null && existing !== undefined,
            repoUrl: body.repoUrl,
            providerInstanceId: ref.instance.id,
            providerKind: ref.instance.kind,
            fromManifest: false as const,
            suggestedName: humanize(ref.repo),
            validationErrors: err.errors,
            message: 'Manifest is present but failed validation — see the errors below.',
          }
        }
        log.warn({ err, slug }, 'preview failed')
        set.status = 500
        return { ok: false as const, error: 'Manifest fetch failed — try again' }
      }
    },
    {
      detail: {
        tags: ['Submit'],
        summary: 'Dry-run a submission: fetch + validate the manifest, no writes',
        description:
          'Resolves the latest release + .tabularium for the given repo and returns a preview the frontend can render before the user confirms. No database writes. Useful so the submit page can show name/description/kind/screenshots from the manifest instead of asking the user to type them again.',
        operationId: 'submitPreview',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      },
      body: t.Object({
        repoUrl: t.String({ minLength: 1 }),
      }),
      response: {
        200: t.Union([
          t.Object({
            ok: t.Literal(true),
            slug: t.String(),
            slugTaken: t.Boolean(),
            repoUrl: t.String(),
            providerInstanceId: t.String(),
            providerKind: t.String(),
            fromManifest: t.Literal(true),
            version: t.String(),
            preview: manifestPreviewSchema,
          }),
          t.Object({
            ok: t.Literal(true),
            slug: t.String(),
            slugTaken: t.Boolean(),
            repoUrl: t.String(),
            providerInstanceId: t.String(),
            providerKind: t.String(),
            fromManifest: t.Literal(false),
            suggestedName: t.String(),
            message: t.String(),
            validationErrors: t.Optional(t.Array(t.Any())),
          }),
        ]),
        400: t.Object({ ok: t.Literal(false), error: t.String() }),
        401: t.Object({ ok: t.Literal(false), error: t.String(), reauthFor: t.String() }),
        403: t.Object({ ok: t.Literal(false), error: t.String() }),
        412: t.Object({ ok: t.Literal(false), error: t.String() }),
        500: t.Object({ ok: t.Literal(false), error: t.String() }),
      },
    },
  )
