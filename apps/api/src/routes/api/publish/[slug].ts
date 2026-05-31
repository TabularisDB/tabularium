import { Elysia, t } from 'elysia'
import { db } from '$db'
import { plugins } from '$db/schema'
import { publisherTokenMiddleware } from '$middleware/publisher-token'
import { hasScope } from '$lib/publisher-tokens'
import { parseRepoUrl } from '$lib/providers'
import { ManifestValidationError, parseManifestText, rawContentBase } from '$lib/manifest'
import {
  manifestPatch,
  applyManifestToPlugin,
  assertManifestVersionMatches,
  ManifestVersionMismatchError,
} from '$lib/manifest-apply'
import { persistRelease, hashReleaseAssetsAsync } from '$lib/release-ingest'
import { recordAudit } from '$lib/audit'
import { getSetting } from '$lib/settings'
import { logger } from '$lib/logger'
import type { NormalizedRelease } from '$lib/webhook'

const log = logger.child({ module: 'publish' })

const SLUG_RE = /^[a-z][a-z0-9-]*$/
const SLUG_MAX = 80

const assetSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  url: t.String({ minLength: 1, maxLength: 1000 }),
  sha256: t.Optional(t.String({ pattern: '^[0-9a-f]{64}$' })),
  size: t.Optional(t.Number()),
})

const publishBodySchema = t.Object({
  manifest: t.String({ minLength: 1, maxLength: 64 * 1024 }),
  version: t.String({ minLength: 1, maxLength: 40, pattern: '^v?\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9.-]+)?$' }),
  assets: t.Array(assetSchema, { maxItems: 32 }),
  repoUrl: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  attestation: t.Optional(t.Any()),
})

function makeWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default new Elysia().use(publisherTokenMiddleware).post(
  '/',
  async ({ params, body, set, publisher, request }) => {
    const slug = params.slug.trim()
    if (!slug || slug.length > SLUG_MAX || !SLUG_RE.test(slug)) {
      set.status = 400
      return { error: `slug must match ${SLUG_RE} (max ${SLUG_MAX} chars)` }
    }

    const existing = await db.query.plugins.findFirst({ where: { id: slug } })

    if (!existing) {
      // First push — auto-claim path. Requires publish:* scope and a repoUrl
      // because the registry needs a forge anchor for asset URLs and (later)
      // optional webhook setup.
      if (!hasScope('publish:*', publisher.scopes)) {
        await recordAudit({
          actorId: publisher.userId,
          action: 'plugin.publish_denied',
          target: `plugin:${slug}`,
          meta: { reason: 'new-slug push requires publish:* scope', tokenId: publisher.id },
          ip: request.headers.get('x-forwarded-for') ?? null,
        })
        set.status = 403
        return { error: 'publish:* scope required to claim a new plugin slug' }
      }
      if (!body.repoUrl) {
        set.status = 400
        return { error: 'repoUrl is required on first push' }
      }
      const ref = parseRepoUrl(body.repoUrl)
      if (!ref) {
        set.status = 400
        return { error: 'repoUrl does not parse to a configured provider instance' }
      }
      const repoClash = await db.query.plugins.findFirst({ where: { repoUrl: body.repoUrl } })
      if (repoClash) {
        await recordAudit({
          actorId: publisher.userId,
          action: 'plugin.publish_conflict',
          target: `plugin:${slug}`,
          meta: { reason: 'repoUrl already claimed', clashSlug: repoClash.id, tokenId: publisher.id },
          ip: request.headers.get('x-forwarded-for') ?? null,
        })
        set.status = 409
        return { error: `repoUrl already claimed by plugin "${repoClash.id}"` }
      }

      let parsed
      try {
        parsed = parseManifestText(body.manifest)
      } catch (err) {
        if (err instanceof ManifestValidationError) {
          await recordAudit({
            actorId: publisher.userId,
            action: 'plugin.publish_invalid',
            target: `plugin:${slug}`,
            meta: { errors: err.errors.slice(0, 5), tokenId: publisher.id },
            ip: request.headers.get('x-forwarded-for') ?? null,
          })
          set.status = 422
          return { error: err.message, errors: err.errors }
        }
        throw err
      }

      try {
        assertManifestVersionMatches(parsed, body.version)
      } catch (err) {
        if (err instanceof ManifestVersionMismatchError) {
          await recordAudit({
            actorId: publisher.userId,
            action: 'plugin.publish_invalid',
            target: `plugin:${slug}`,
            meta: {
              reason: 'manifest_version_mismatch',
              declared: err.declared,
              expected: err.expected,
              tokenId: publisher.id,
            },
            ip: request.headers.get('x-forwarded-for') ?? null,
          })
          set.status = 422
          return { error: err.message }
        }
        throw err
      }

      const autoApprove = getSetting('submit.auto_approve') !== '0'
      const now = Date.now()
      await db.insert(plugins).values({
        id: slug,
        ownerId: publisher.userId,
        providerInstanceId: ref.instance.id,
        name: parsed.name ?? slug,
        description: parsed.description ?? '',
        author: parsed.name ?? slug,
        repoUrl: body.repoUrl,
        homepage: parsed.homepage ?? body.repoUrl,
        webhookSecret: makeWebhookSecret(),
        status: autoApprove ? 'approved' : 'pending',
        createdAt: now,
        updatedAt: now,
      })

      const version = body.version.replace(/^v/, '')
      const tag = body.version.startsWith('v') ? body.version : `v${version}`
      const normalized: NormalizedRelease = {
        repoUrl: body.repoUrl,
        published: true,
        tag,
        assets: body.assets.map((a) => ({ name: a.name, url: a.url })),
      }
      const { assetMap } = await persistRelease({ id: slug, latestVersion: null }, normalized)

      // Apply manifest fields (category, tags, icon, extensions, …) to the
      // freshly-created plugin row.
      const patch = manifestPatch(
        { raw: body.manifest, parsed, readmeMarkdown: null, readmeLocales: null },
        { repoBase: rawContentBase(ref, tag), version },
      )
      await applyManifestToPlugin(slug, patch)

      void hashReleaseAssetsAsync(
        { id: slug, ownerId: publisher.userId, repoUrl: body.repoUrl },
        normalized,
        assetMap,
        version,
      ).catch((err) => log.error({ err, slug, version }, 'background hashing crashed'))

      await recordAudit({
        actorId: publisher.userId,
        action: 'plugin.publish_claim',
        target: `plugin:${slug}`,
        meta: { version, tokenId: publisher.id },
        ip: request.headers.get('x-forwarded-for') ?? null,
      })

      return { slug, version, claimed: true }
    }

    // Update path — slug already exists. Owner-only via scope match.
    if (publisher.userId !== existing.ownerId) {
      set.status = 403
      return { error: 'only the plugin owner can publish a new release' }
    }
    if (!hasScope(`publish:${slug}`, publisher.scopes)) {
      await recordAudit({
        actorId: publisher.userId,
        action: 'plugin.publish_denied',
        target: `plugin:${slug}`,
        meta: { reason: 'scope mismatch', tokenId: publisher.id, scopes: publisher.scopes },
        ip: request.headers.get('x-forwarded-for') ?? null,
      })
      set.status = 403
      return { error: `token lacks publish:${slug} (or publish:*) scope` }
    }

    const ref = parseRepoUrl(existing.repoUrl)
    if (!ref) {
      set.status = 422
      return { error: 'plugin.repoUrl no longer parses to a configured provider instance' }
    }

    let parsed
    try {
      parsed = parseManifestText(body.manifest)
    } catch (err) {
      if (err instanceof ManifestValidationError) {
        await recordAudit({
          actorId: publisher.userId,
          action: 'plugin.publish_invalid',
          target: `plugin:${slug}`,
          meta: { errors: err.errors.slice(0, 5), tokenId: publisher.id },
          ip: request.headers.get('x-forwarded-for') ?? null,
        })
        set.status = 422
        return { error: err.message, errors: err.errors }
      }
      throw err
    }

    try {
      assertManifestVersionMatches(parsed, body.version)
    } catch (err) {
      if (err instanceof ManifestVersionMismatchError) {
        await recordAudit({
          actorId: publisher.userId,
          action: 'plugin.publish_invalid',
          target: `plugin:${slug}`,
          meta: {
            reason: 'manifest_version_mismatch',
            declared: err.declared,
            expected: err.expected,
            tokenId: publisher.id,
          },
          ip: request.headers.get('x-forwarded-for') ?? null,
        })
        set.status = 422
        return { error: err.message }
      }
      throw err
    }

    const version = body.version.replace(/^v/, '')
    const tag = body.version.startsWith('v') ? body.version : `v${version}`
    const normalized: NormalizedRelease = {
      repoUrl: existing.repoUrl,
      published: true,
      tag,
      assets: body.assets.map((a) => ({ name: a.name, url: a.url })),
    }
    const { assetMap } = await persistRelease({ id: slug, latestVersion: existing.latestVersion }, normalized)

    const patch = manifestPatch(
      { raw: body.manifest, parsed, readmeMarkdown: null, readmeLocales: null },
      { repoBase: rawContentBase(ref, tag), version },
    )
    await applyManifestToPlugin(slug, patch)

    void hashReleaseAssetsAsync(
      { id: slug, ownerId: publisher.userId, repoUrl: existing.repoUrl },
      normalized,
      assetMap,
      version,
    ).catch((err) => log.error({ err, slug, version }, 'background hashing crashed'))

    await recordAudit({
      actorId: publisher.userId,
      action: 'plugin.publish_update',
      target: `plugin:${slug}`,
      meta: { version, tokenId: publisher.id },
      ip: request.headers.get('x-forwarded-for') ?? null,
    })

    return { slug, version, claimed: false }
  },
  {
    detail: {
      tags: ['Publish'],
      summary: 'Publish a release from a CI / CLI using a publisher token',
      description:
        'Token-authenticated counterpart to the webhook ingest path. First push of an unknown slug ' +
        "auto-claims it (requires publish:* scope and a repoUrl). Subsequent pushes update the plugin's " +
        'latest release. Manifest is validated; asset URLs are hashed in the background.',
      operationId: 'publishRelease',
      security: [{ publisherToken: [] }],
    },
    params: t.Object({ slug: t.String() }),
    body: publishBodySchema,
    response: {
      200: t.Object({ slug: t.String(), version: t.String(), claimed: t.Boolean() }),
      400: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
      422: t.Object({ error: t.String(), errors: t.Optional(t.Array(t.Any())) }),
    },
  },
)
