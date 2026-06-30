import { Elysia } from 'elysia'
import { db } from '$db'
import {
  verifyGithubSignature,
  verifyGitlabToken,
  parseGithubPayload,
  parseGitlabPayload,
  type NormalizedRelease,
} from '$lib/webhook'
import { getInstance } from '$lib/provider-instance'
import { logger } from '$lib/logger'
import { persistRelease, hashReleaseAssetsAsync, refreshManifestAtRelease } from '$lib/release-ingest'
import { InvalidVersionError } from '$lib/semver'
import { recordAudit } from '$lib/audit'
import { rateLimit } from '$middleware/rate-limit'

// Real GitHub/GitLab release payloads are tens of KB; cap well above that to
// reject DoS amplification before we even parse the body.
const MAX_WEBHOOK_BYTES = 1 * 1024 * 1024

const log = logger.child({ module: 'webhook-release' })

export default new Elysia().use(rateLimit({ bucket: 'webhook-release', limit: 60, windowSeconds: 60 })).post(
  '/',
  async ({ request, set }) => {
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_WEBHOOK_BYTES) {
      set.status = 413
      return { error: 'Payload too large' }
    }
    const rawBody = await request.arrayBuffer()
    if (rawBody.byteLength > MAX_WEBHOOK_BYTES) {
      set.status = 413
      return { error: 'Payload too large' }
    }
    const bodyBuffer = Buffer.from(rawBody)

    let payload: unknown
    try {
      payload = JSON.parse(bodyBuffer.toString('utf-8'))
    } catch {
      set.status = 400
      return { error: 'Invalid JSON' }
    }

    const githubSig = request.headers.get('x-hub-signature-256')
    const gitlabToken = request.headers.get('x-gitlab-token')

    let normalized: NormalizedRelease | null = null
    if (gitlabToken) normalized = parseGitlabPayload(payload)
    if (!normalized && githubSig) normalized = parseGithubPayload(payload)
    if (!normalized) normalized = parseGithubPayload(payload) ?? parseGitlabPayload(payload)

    if (!normalized) {
      set.status = 400
      return { error: 'Unrecognized webhook payload' }
    }

    const plugin = await db.query.plugins.findFirst({ where: { repoUrl: normalized.repoUrl } })

    const inst = plugin?.providerInstanceId ? getInstance(plugin.providerInstanceId) : undefined
    const valid = await (async () => {
      if (!plugin) return false
      if (inst?.kind === 'gitlab') {
        return gitlabToken ? verifyGitlabToken(plugin.webhookSecret, gitlabToken) : false
      }
      if (githubSig) return verifyGithubSignature(plugin.webhookSecret, bodyBuffer, githubSig)
      if (gitlabToken) return verifyGitlabToken(plugin.webhookSecret, gitlabToken)
      return false
    })()

    if (!plugin || !valid) {
      set.status = 401
      return { error: 'Invalid signature' }
    }

    if (plugin.status !== 'approved') {
      set.status = 423
      return { error: `Plugin is ${plugin.status} — releases are not ingested until approved by an admin` }
    }

    if (!normalized.published) {
      return { ok: true, skipped: true }
    }

    let version: string
    let assetMap: Awaited<ReturnType<typeof persistRelease>>['assetMap']
    try {
      ;({ version, assetMap } = await persistRelease(plugin, normalized))
    } catch (err) {
      if (err instanceof InvalidVersionError) {
        await recordAudit({
          action: 'plugin.release_rejected',
          target: `plugin:${plugin.id}`,
          meta: { tag: normalized.tag, reason: 'non_semver_tag' },
        })
        log.warn({ slug: plugin.id, tag: normalized.tag }, 'release rejected: tag is not strict semver')
        set.status = 422
        return { error: err.message }
      }
      throw err
    }

    // Refresh manifest + capture sha256 in background; both write to DB.
    queueMicrotask(async () => {
      const manifest = await refreshManifestAtRelease(plugin, normalized.tag, version, normalized.assets)
      if (manifest) {
        // Re-persist the row with the now-known manifest sha + raw bytes
        // (persistRelease ran without them because the fetch is async).
        await persistRelease(plugin, normalized, { manifestSha256: manifest.sha, manifestRaw: manifest.raw })
      }
    })

    queueMicrotask(() => {
      hashReleaseAssetsAsync(plugin, normalized, assetMap, version).catch((err) =>
        log.error({ err, slug: plugin.id, version }, 'background hashing crashed'),
      )
    })

    return { ok: true, version, assets: Object.keys(assetMap) }
  },
  {
    detail: {
      tags: ['Webhooks'],
      summary: 'Release event ingestion',
      description:
        "GitHub / GitLab / Gitea (and Forgejo) post releases here. Signature scheme is picked per plugin's linked provider instance kind.",
      operationId: 'releaseWebhook',
    },
  },
)
