import { Elysia } from 'elysia'
import { db } from '../../../db'
import { plugins, releases } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { verifyWebhookSignature, inferPlatformKey } from '../../../lib/webhook'

type GithubReleasePayload = {
  action: string
  release: {
    tag_name: string
    assets: Array<{ name: string; browser_download_url: string }>
  }
  repository: { html_url: string }
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(Number)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPat - bPat
}

export default new Elysia()
  .post('/api/webhooks/release', async ({ request, set }) => {
    const rawBody = await request.arrayBuffer()
    const bodyBuffer = Buffer.from(rawBody)

    let payload: GithubReleasePayload
    try {
      payload = JSON.parse(bodyBuffer.toString('utf-8'))
    } catch {
      set.status = 400
      return { error: 'Invalid JSON' }
    }

    const repoUrl = payload.repository?.html_url
    if (!repoUrl) {
      set.status = 400
      return { error: 'Missing repository.html_url' }
    }

    const plugin = await db.query.plugins.findFirst({
      where: eq(plugins.repoUrl, repoUrl),
    })
    if (!plugin) {
      set.status = 404
      return { error: 'No plugin registered for this repository' }
    }

    const signature = request.headers.get('x-hub-signature-256') ?? ''
    const valid = await verifyWebhookSignature(plugin.webhookSecret, bodyBuffer, signature)
    if (!valid) {
      set.status = 401
      return { error: 'Invalid signature' }
    }

    if (payload.action !== 'published') {
      return { ok: true, skipped: true }
    }

    const version = payload.release.tag_name.replace(/^v/, '')

    const assetMap: Record<string, string> = {}
    for (const asset of payload.release.assets) {
      const key = inferPlatformKey(asset.name)
      if (key) assetMap[key] = asset.browser_download_url
    }

    const releaseId = crypto.randomUUID()
    await db
      .insert(releases)
      .values({
        id: releaseId,
        pluginId: plugin.id,
        version,
        assets: JSON.stringify(assetMap),
      })
      .onConflictDoUpdate({
        target: [releases.pluginId, releases.version],
        set: { assets: JSON.stringify(assetMap) },
      })

    const shouldUpdate =
      !plugin.latestVersion || compareSemver(version, plugin.latestVersion) > 0

    if (shouldUpdate) {
      await db
        .update(plugins)
        .set({ latestVersion: version, updatedAt: Date.now() })
        .where(eq(plugins.id, plugin.id))
    }

    return { ok: true, version, assets: Object.keys(assetMap) }
  })
