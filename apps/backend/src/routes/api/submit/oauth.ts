import { Elysia, t } from 'elysia'
import { authMiddleware } from '$middleware/auth'
import { rateLimit } from '$middleware/rate-limit'
import { db } from '$db'
import { plugins } from '$db/schema'
import { deriveSlug } from '$lib/slug'
import { parseRepoUrl, checkOwnership } from '$lib/providers'
import { setupWebhook } from '$lib/setup-webhook'
import { decryptToken } from '$lib/crypto'
import { env } from '$lib/env'
import { getSetting } from '$lib/settings'
import { resolveManifest, rawContentBase } from '$lib/manifest'
import { manifestPatch, applyManifestToPlugin } from '$lib/manifest-apply'
import { getFeatures } from '$lib/features'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'submit-oauth' })

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('hex')
}

export default new Elysia()
  .use(authMiddleware)
  .use(rateLimit({ bucket: 'submit', limit: 10, windowSeconds: 3600 }))
  .post('/', async ({ user, body, set }) => {
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

    const accessToken = decryptToken(identity.accessToken)
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

    await db.insert(plugins).values({
      id: slug,
      ownerId: user.sub,
      providerInstanceId: ref.instance.id,
      name: body.name,
      description: body.description,
      author: `${identity.username} <${body.repoUrl}>`,
      repoUrl: body.repoUrl,
      homepage: body.repoUrl,
      webhookSecret,
      status,
    })

    try {
      const manifest = await resolveManifest(accessToken, ref)
      if (manifest) {
        const patch = manifestPatch(manifest, {
          repoBase: rawContentBase(ref, 'HEAD'),
          version: null,
        })
        await applyManifestToPlugin(slug, patch)
        log.info({ slug, source: manifest.source }, 'manifest applied at submit')
      } else {
        log.info({ slug }, 'no .tabularium manifest found at submit — using fallback metadata')
      }
    } catch (err) {
      log.warn({ err, slug }, 'manifest fetch failed at submit — continuing without it')
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
  }, {
    detail: {
      tags: ['Submit'],
      summary: 'Submit plugin via OAuth-verified ownership',
      operationId: 'submitOAuth',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
    body: t.Object({
      repoUrl: t.String(),
      name: t.String(),
      description: t.String(),
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
      403: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
      412: t.Object({ error: t.String() }),
    },
  })
